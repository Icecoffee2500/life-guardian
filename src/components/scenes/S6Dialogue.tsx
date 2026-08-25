'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import SceneShell from './SceneShell';
import Button from '@/components/ui/Button';
import TimeRing from '@/components/ui/TimeRing';
import { experienceBus } from '@/lib/sensors/bus';
import { sessionClock } from '@/lib/sensors/clock';
import { getPersona } from '@/lib/sensors/personas';
import { sessionRecorder } from '@/lib/session/recorder';
import { dialogueTimingFor, questionsFor } from '@/lib/session/scenes';
import { useSession } from '@/lib/session/store';
import { cancelSpeech, speak } from '@/lib/speech';

type Phase = 'read' | 'answer' | 'recover';

/**
 * 진행자 반응은 문항마다 **완전히 동일해야 한다**.
 * 매번 다른 말로 반응하면 그 차이 자체가 각성을 만들어 문항 간 비교가 깨진다. (부록 B)
 */
const ACK = '기록했습니다';

/**
 * S6 — 대화 세션.
 *
 * 문항은 음성 AI(TTS)가 낭독하고, 응답은 참가자가 **직접 입력**한다.
 * 이전에는 음성 인식(STT)도 시도했지만, 되는 척하기가 너무 쉬웠다 — 인식 객체가
 * 존재한다는 것과 실제로 마이크가 열려 소리가 잡힌다는 것은 전혀 다른 이야기였고,
 * 참가자는 말했는데 아무것도 안 적히는 화면을 보고 있어야 했다.
 *
 * 지금은 입력 수단을 하나로 좁힌다: **타이핑.** 어느 브라우저·어느 환경에서도
 * 똑같이 동작하고, 참가자가 무엇이 기록되는지 눈으로 바로 확인할 수 있다.
 */
export default function S6Dialogue({
  onDone,
  onProgress,
}: {
  onDone: () => void;
  onProgress: (p: number) => void;
}) {
  const mode = useSession((s) => s.mode);
  const signalMode = useSession((s) => s.signalMode);
  const personaId = useSession((s) => s.personaId);
  const paused = useSession((s) => s.status === 'paused');

  const timing = dialogueTimingFor(mode);
  const questions = useMemo(() => questionsFor(mode), [mode]);

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('read');
  const [transcript, setTranscript] = useState('');
  const [answerProgress, setAnswerProgress] = useState(0);

  const transcriptRef = useRef('');
  const speechStartRef = useRef<number | null>(null);
  /** 지금 진행 중인 문항 번호 — 이벤트에 붙인다 */
  const curQRef = useRef<number | null>(null);
  const skipRef = useRef<(() => void) | null>(null);
  const pausedRef = useRef(paused);
  const onDoneRef = useRef(onDone);
  const onProgressRef = useRef(onProgress);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  /** 첫 입력 시각 — 응답 지연의 종료점. 한 문항에서 한 번만 찍는다. */
  const markSpeech = useCallback(() => {
    if (speechStartRef.current !== null) return;
    speechStartRef.current = sessionClock.now();
    experienceBus.emit('speech-onset', { ref: `q-${curQRef.current}` });
  }, []);

  // ── 문항 시퀀스 ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const persona = getPersona(personaId);

    /**
     * 일시정지를 존중하며 ms만큼 기다린다. 완료·건너뛰기·언마운트로 즉시 끝날 수 있다.
     *
     * hold를 주면 **시간이 다 돼도 스스로 끝나지 않는다.** 진행도만 1에 멈추고
     * 사람이 '답변 완료'를 누를 때까지 기다린다 — 대답을 재촉하지 않기 위해서다.
     */
    const wait = (ms: number, onTick?: (p: number) => void, hold = false) =>
      new Promise<void>((resolve) => {
        let acc = 0;
        let last = performance.now();
        let raf = 0;
        let lastP = -1;
        const frame = (now: number) => {
          if (cancelled) return resolve();
          const dt = now - last;
          last = now;
          if (!pausedRef.current) acc += dt;
          const p = Math.min(1, acc / ms);
          if (onTick && (Math.abs(p - lastP) > 0.006 || p >= 1)) {
            lastP = p;
            onTick(p);
          }
          if (acc >= ms && !hold) {
            skipRef.current = null;
            return resolve();
          }
          raf = requestAnimationFrame(frame);
        };
        skipRef.current = () => {
          cancelAnimationFrame(raf);
          skipRef.current = null;
          resolve();
        };
        raf = requestAnimationFrame(frame);
      });

    const run = async () => {
      for (let i = 0; i < questions.length && !cancelled; i++) {
        const q = questions[i];
        curQRef.current = q.q;
        setIdx(i);
        setPhase('read');
        setTranscript('');
        setAnswerProgress(0);
        transcriptRef.current = '';
        speechStartRef.current = null;
        onProgressRef.current(i / questions.length);

        const onsetT = sessionClock.now();
        experienceBus.emit('question-onset', {
          ref: `q-${q.q}`,
          // baseline 문항(q0)은 말하는 행위 자체의 기준선이라 각성을 낮게 잡는다
          intensity: q.isBaseline ? 0.16 : 0.3,
          t: onsetT,
        });

        await speak(q.prompt, { minSec: timing.read });
        if (cancelled) return;
        const readEndT = sessionClock.now();

        // ── 응답 구간 ──
        setPhase('answer');

        let autoTimer: ReturnType<typeof setTimeout> | null = null;
        let autoTyper: ReturnType<typeof setInterval> | null = null;

        if (signalMode === 'auto') {
          // 가상 참가자 — 준비된 답을 지연시간에 맞춰 타이핑하듯 흘린다
          const canned = persona.answers.find((a) => a.q === q.q);
          if (canned) {
            autoTimer = setTimeout(
              () => {
                markSpeech();
                let n = 0;
                const step = Math.max(
                  28,
                  ((timing.answer - canned.latencySec - 1) * 1000) / canned.transcript.length,
                );
                autoTyper = setInterval(() => {
                  n += 1;
                  transcriptRef.current = canned.transcript.slice(0, n);
                  setTranscript(transcriptRef.current);
                  if (n >= canned.transcript.length && autoTyper) clearInterval(autoTyper);
                }, step);
              },
              Math.min(canned.latencySec, timing.answer * 0.6) * 1000,
            );
          }
        }

        // 무인 시연(auto)이 아니면 시간이 지나도 넘어가지 않는다. '답변 완료'를 기다린다.
        await wait(timing.answer * 1000, setAnswerProgress, signalMode !== 'auto');

        if (autoTimer) clearTimeout(autoTimer);
        if (autoTyper) clearInterval(autoTyper);
        if (cancelled) return;

        const endT = sessionClock.now();
        const text = transcriptRef.current.trim();
        sessionRecorder.dialogueTurns.push({
          q: q.q,
          topic: q.topic,
          readEndT,
          speechStartT: speechStartRef.current,
          endT,
          transcript: text,
          noResponse: text.length === 0,
        });

        // ── 회복 구간 ──
        setPhase('recover');
        onProgressRef.current((i + 0.9) / questions.length);
        await wait(timing.recover * 1000);
      }

      if (!cancelled) {
        onProgressRef.current(1);
        onDoneRef.current();
      }
    };

    void run();
    return () => {
      cancelled = true;
      skipRef.current?.();
      cancelSpeech();
    };
  }, [markSpeech, personaId, questions, signalMode, timing]);

  const q = questions[idx];
  const remaining = Math.max(0, Math.ceil(timing.answer * (1 - answerProgress)));
  const answering = phase === 'answer';
  const auto = signalMode === 'auto';

  const onType = (v: string) => {
    transcriptRef.current = v;
    setTranscript(v);
    if (v) markSpeech();
  };

  return (
    <SceneShell align="stretch" className="px-6 sm:px-10">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center gap-8 py-24">
        {/* 문항 */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${idx}-${phase === 'recover' ? 'r' : 'q'}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
            className="shrink-0"
          >
            {phase === 'recover' ? (
              <p className="t-title text-center text-ink-3">{ACK}</p>
            ) : (
              <>
                <p className="t-label text-center">
                  {idx + 1} / {questions.length}
                </p>
                <h1 className="t-display mt-4 text-balance text-center text-ink">{q?.prompt}</h1>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* 응답 */}
        <div className="flex min-h-[13rem] shrink-0 flex-col gap-4">
          <AnimatePresence>
            {answering && (
              <motion.div
                key="answer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-4"
              >
                {auto ? (
                  <p className="t-body min-h-[6rem] rounded-[4px] border border-line bg-surface-raised p-4 text-ink">
                    {transcript || <span className="text-ink-3">가상 참가자가 답하는 중입니다</span>}
                  </p>
                ) : (
                  <textarea
                    ref={inputRef}
                    value={transcript}
                    onChange={(e) => onType(e.target.value)}
                    rows={3}
                    placeholder="여기에 답을 적어주세요"
                    className="t-body w-full resize-none rounded-[4px] border border-line-strong bg-surface-raised px-4 py-3 text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 조작 — 다 답했으면 기다리지 않는다 */}
        <div className="flex shrink-0 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TimeRing progress={answering ? answerProgress : 0} seconds={answering ? remaining : undefined} />
            <div className="flex gap-1.5">
              {questions.map((qq, i) => (
                <span
                  key={qq.q}
                  className="h-1.5 w-6 rounded-[1px]"
                  style={{
                    background: i <= idx ? 'var(--color-ink)' : 'var(--color-line)',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="quiet" onClick={() => skipRef.current?.()}>
              건너뛰기
            </Button>
            <Button onClick={() => skipRef.current?.()} disabled={!answering}>
              답변 완료
            </Button>
          </div>
        </div>
      </div>
    </SceneShell>
  );
}
