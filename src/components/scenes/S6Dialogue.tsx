'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { cancelSpeech, speak, speechCapabilities, startRecognition } from '@/lib/speech';

type Phase = 'read' | 'answer' | 'recover';

/**
 * 진행자 반응은 문항마다 **완전히 동일해야 한다**.
 * 매번 다른 말로 반응하면 그 차이 자체가 각성을 만들어 문항 간 비교가 깨진다. (부록 B)
 */
const ACK = '기록했습니다';

/**
 * S6 — 대화 세션.
 *
 * 음성 인식이 되면 말로, 안 되면 타이핑으로 받는다. 어느 쪽이든 플로우는 끝까지 간다.
 * 화면이 하는 일은 질문 하나를 크게 띄우고, 남은 시간을 조용히 보여주는 것뿐이다.
 * 답을 잘하고 있는지에 대한 어떤 피드백도 주지 않는다 — 피드백은 그 자체로 자극이다.
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
  // 압축 모드의 questionsFor는 매번 새 배열이다 — 메모하지 않으면 문항 시퀀스가 계속 재시작된다
  const questions = useMemo(() => questionsFor(mode), [mode]);

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('read');
  const [transcript, setTranscript] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [answerProgress, setAnswerProgress] = useState(0);
  const [caps] = useState(() => speechCapabilities());
  /**
   * 인식기가 있다고 해서 쓸 수 있는 건 아니다 — 마이크 권한 거부, 네트워크 인식 실패는
   * 조용히 일어나고, 그대로 두면 아무것도 기록하지 못한 채 문항이 지나간다.
   * 한 번 실패하면 남은 문항은 타이핑으로 받는다.
   */
  const [sttBroken, setSttBroken] = useState(false);
  const sttBrokenRef = useRef(false);

  const transcriptRef = useRef('');
  const speechStartRef = useRef<number | null>(null);
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

  const typing = signalMode !== 'auto' && (!caps.stt || sttBroken);

  useEffect(() => {
    let cancelled = false;
    const persona = getPersona(personaId);

    /** 일시정지를 존중하며 ms만큼 기다린다. 건너뛰기·언마운트로 즉시 끝날 수 있다. */
    const wait = (ms: number, onTick?: (p: number) => void) =>
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
          if (acc >= ms) {
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
        const markSpeech = () => {
          if (speechStartRef.current !== null) return;
          speechStartRef.current = sessionClock.now();
          setSpeaking(true);
          experienceBus.emit('speech-onset', { ref: `q-${q.q}` });
        };

        let stopRec: (() => void) | null = null;
        let autoTimer: ReturnType<typeof setTimeout> | null = null;
        let autoTyper: ReturnType<typeof setInterval> | null = null;

        // 문항마다 다시 판단한다 — 앞 문항에서 인식이 깨졌으면 여기서부터 타이핑이다
        const useTyping = signalMode !== 'auto' && (!caps.stt || sttBrokenRef.current);

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
        } else if (!useTyping) {
          const breakStt = () => {
            if (sttBrokenRef.current) return;
            sttBrokenRef.current = true;
            setSttBroken(true);
            setTimeout(() => inputRef.current?.focus(), 80);
          };
          stopRec = startRecognition({
            onSpeechStart: markSpeech,
            onPartial: (t) => {
              if (t) markSpeech();
              transcriptRef.current = t;
              setTranscript(t);
            },
            onFinal: (t) => {
              if (t) transcriptRef.current = t;
            },
            onError: (reason) => {
              // 'no-speech'는 그냥 말을 안 한 것이다. 그 외는 마이크를 못 쓰는 상황.
              if (reason !== 'no-speech') breakStt();
            },
          });
          // 생성 자체가 실패하면(구형 브라우저·비보안 컨텍스트) 바로 타이핑으로 넘어간다
          if (!stopRec) breakStt();
        }
        if (useTyping) setTimeout(() => inputRef.current?.focus(), 60);

        await wait(timing.answer * 1000, setAnswerProgress);

        stopRec?.();
        if (autoTimer) clearTimeout(autoTimer);
        if (autoTyper) clearInterval(autoTyper);
        setSpeaking(false);
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
    // typing/sttBroken은 의도적으로 의존성에서 뺐다 — 인식 실패로 상태가 바뀔 때마다
    // 이 시퀀스가 처음부터 다시 돌면 참가자가 같은 질문을 다시 듣게 된다.
    // 시퀀스 안에서는 sttBrokenRef로 최신 값을 읽는다.
  }, [caps.stt, personaId, questions, signalMode, timing]);

  const q = questions[idx];
  const remaining = Math.max(0, Math.ceil(timing.answer * (1 - answerProgress)));

  return (
    <SceneShell align="stretch" className="px-6 sm:px-10">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center py-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${idx}-${phase === 'recover' ? 'r' : 'q'}`}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
            transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
          >
            {phase === 'recover' ? (
              <p className="text-center text-[clamp(1rem,2.2vw,1.35rem)] font-light text-paper-mute">
                {ACK}
              </p>
            ) : (
              <>
                <span className="tnum block text-center text-[10px] tracking-[0.22em] text-paper-mute">
                  {String(idx + 1).padStart(2, '0')} / {String(questions.length).padStart(2, '0')}
                </span>
                <h2 className="scene-title mt-5 text-balance text-center text-[clamp(1.25rem,3.1vw,2rem)] text-paper">
                  {q?.prompt}
                </h2>
                {/* 낭독 중임을 알리는 아주 작은 선. 스피커 아이콘 같은 건 쓰지 않는다. */}
                <motion.div
                  className="mx-auto mt-6 h-px bg-paper/35"
                  animate={{ width: phase === 'read' ? ['0%', '100%'] : '0%' }}
                  transition={{ duration: timing.read, ease: 'linear' }}
                  style={{ maxWidth: '10rem' }}
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* 응답 영역 */}
        <div className="mt-10 min-h-[7.5rem]">
          <AnimatePresence>
            {phase === 'answer' && (
              <motion.div
                key="answer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center"
              >
                {typing ? (
                  <textarea
                    ref={inputRef}
                    value={transcript}
                    onChange={(e) => {
                      transcriptRef.current = e.target.value;
                      setTranscript(e.target.value);
                      if (e.target.value && speechStartRef.current === null) {
                        speechStartRef.current = sessionClock.now();
                        experienceBus.emit('speech-onset', { ref: `q-${q?.q}` });
                      }
                    }}
                    rows={3}
                    placeholder="여기에 답을 적어주세요"
                    className="w-full resize-none rounded-xl border border-paper/10 bg-ink-900 px-4 py-3 text-[14px] font-light leading-relaxed text-paper placeholder:text-paper-mute focus:border-paper/30 focus:outline-none"
                  />
                ) : (
                  <>
                    <motion.span
                      className="h-1.5 w-1.5 rounded-full bg-hr"
                      style={{ boxShadow: '0 0 14px var(--color-hr)' }}
                      animate={
                        speaking
                          ? { opacity: [0.4, 1, 0.4], scale: [1, 1.5, 1] }
                          : { opacity: 0.22, scale: 1 }
                      }
                      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <p className="mt-5 min-h-[3.5rem] max-w-xl text-center text-[13.5px] font-light leading-[1.9] text-paper-dim">
                      {transcript || (
                        <span className="text-paper-mute">편하게 말씀해 주세요</span>
                      )}
                    </p>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 하단 바 — 남은 시간과 건너뛰기. 건너뛸 수 있다는 사실은 계속 보여야 한다(부록 B). */}
      <div className="absolute inset-x-0 bottom-16 flex items-center justify-between px-6 sm:px-12">
        <div className="flex items-center gap-3">
          <TimeRing progress={phase === 'answer' ? answerProgress : 0} size={30} />
          <span className="tnum text-[11px] font-light text-paper-mute">
            {phase === 'answer' ? `${remaining}초` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {questions.map((qq, i) => (
            <span
              key={qq.q}
              className="h-px w-4 transition-colors duration-500"
              style={{
                background:
                  i < idx
                    ? 'rgba(236,233,227,0.4)'
                    : i === idx
                      ? 'rgba(236,233,227,0.75)'
                      : 'rgba(236,233,227,0.12)',
              }}
            />
          ))}
        </div>
        <Button variant="quiet" onClick={() => skipRef.current?.()}>
          건너뛰기
        </Button>
      </div>
    </SceneShell>
  );
}
