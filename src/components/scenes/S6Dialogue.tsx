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
import { cancelSpeech, speak, speechCapabilities, startRecognition } from '@/lib/speech';
import { openMicrophone, type MicHandle } from '@/lib/audio-level';

type Phase = 'read' | 'answer' | 'recover';

/**
 * 진행자 반응은 문항마다 **완전히 동일해야 한다**.
 * 매번 다른 말로 반응하면 그 차이 자체가 각성을 만들어 문항 간 비교가 깨진다. (부록 B)
 */
const ACK = '기록했습니다';

/**
 * S6 — 대화 세션.
 *
 * 이전 버전의 가장 큰 실패: **음성 인식이 되는 척했다.**
 * 브라우저에 인식 객체가 있으면 "편하게 말씀해 주세요"를 띄웠는데,
 * 마이크 권한을 요청하지도 않았고 소리가 들어오는지 확인하지도 않았다.
 * 참가자는 말했는데 아무것도 안 적히는 화면을 보고 있어야 했다.
 *
 * 지금은 세 가지를 지킨다:
 *  1. 마이크를 **명시적으로 연다** (getUserMedia). 권한 프롬프트가 제때 뜬다.
 *  2. 입력 레벨 막대로 **소리가 들어오는 것을 보여준다.** 인식 성공 여부와 별개다.
 *  3. 타이핑 입력을 폴백이 아니라 **항상 같이** 둔다. 어느 쪽으로든 답할 수 있다.
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
  const [caps] = useState(() => speechCapabilities());

  /** 마이크가 실제로 열렸는가 */
  const [micOpen, setMicOpen] = useState(false);
  /** 마이크 입력 레벨 0~1 — "듣고 있다"는 유일한 정직한 증거 */
  const [level, setLevel] = useState(0);
  const [micNote, setMicNote] = useState<string | null>(null);

  const micRef = useRef<MicHandle | null>(null);
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

  // ── 마이크 열기 ─────────────────────────────────────────────
  const enableMic = useCallback(async () => {
    setMicNote(null);
    const mic = await openMicrophone();
    if (!mic) {
      setMicNote('마이크를 열 수 없습니다. 아래에 직접 입력해 주세요.');
      return;
    }
    micRef.current = mic;
    setMicOpen(true);
  }, []);

  // 레벨 미터 — 마이크가 열려 있는 동안만 돈다
  useEffect(() => {
    if (!micOpen) return;
    let raf = 0;
    let last = 0;
    const tick = () => {
      const v = micRef.current?.level() ?? 0;
      // 막대가 60fps로 리렌더될 이유는 없다. 눈에 보일 만큼만.
      if (Math.abs(v - last) > 0.02) {
        last = v;
        setLevel(v);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [micOpen]);

  useEffect(
    () => () => {
      micRef.current?.stop();
      micRef.current = null;
    },
    [],
  );

  // ── 문항 시퀀스 ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const persona = getPersona(personaId);

    /** 일시정지를 존중하며 ms만큼 기다린다. 완료·건너뛰기·언마운트로 즉시 끝날 수 있다. */
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
          experienceBus.emit('speech-onset', { ref: `q-${q.q}` });
        };

        let stopRec: (() => void) | null = null;
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
        } else if (caps.stt && micRef.current?.live()) {
          // 마이크가 실제로 열려 있을 때만 인식을 건다.
          // 열려 있지 않으면 인식은 조용히 실패하고 화면만 듣는 척하게 된다.
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
              if (reason !== 'no-speech') {
                setMicNote('음성 인식이 끊겼습니다. 아래에 직접 입력해 주세요.');
              }
            },
          });
        }

        await wait(timing.answer * 1000, setAnswerProgress);

        stopRec?.();
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
  }, [caps.stt, personaId, questions, signalMode, timing]);

  const q = questions[idx];
  const remaining = Math.max(0, Math.ceil(timing.answer * (1 - answerProgress)));
  const answering = phase === 'answer';
  const auto = signalMode === 'auto';

  const onType = (v: string) => {
    transcriptRef.current = v;
    setTranscript(v);
    if (v && speechStartRef.current === null) {
      speechStartRef.current = sessionClock.now();
      experienceBus.emit('speech-onset', { ref: `q-${q?.q}` });
    }
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
        <div className="min-h-[13rem] shrink-0">
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
                  <>
                    {/* 마이크 — 켜기 전에는 버튼, 켠 뒤에는 레벨 미터 */}
                    {caps.stt && !micOpen && (
                      <button
                        onClick={() => void enableMic()}
                        className="flex items-center justify-center gap-3 rounded-[4px] border border-line-strong bg-surface-raised px-5 py-3.5 text-ink transition-colors hover:bg-surface-sunken"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: 'var(--color-line-strong)' }}
                        />
                        <span className="t-body-strong">마이크로 답하기</span>
                      </button>
                    )}

                    {micOpen && (
                      <div className="rounded-[4px] border border-line bg-surface-raised px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: 'var(--color-hr)' }}
                          />
                          <span className="t-label shrink-0">입력</span>
                          {/* 이 막대가 움직이면 소리가 실제로 들어오고 있다는 뜻이다 */}
                          <div className="h-2 flex-1 overflow-hidden rounded-[1px] bg-surface-sunken">
                            <div
                              className="h-full transition-[width] duration-75"
                              style={{
                                width: `${Math.round(level * 100)}%`,
                                background: 'var(--color-hr)',
                              }}
                            />
                          </div>
                        </div>
                        {transcript && <p className="t-body mt-3 text-ink">{transcript}</p>}
                      </div>
                    )}

                    {/* 타이핑 — 폴백이 아니라 동등한 입력 수단 */}
                    <textarea
                      ref={inputRef}
                      value={transcript}
                      onChange={(e) => onType(e.target.value)}
                      rows={3}
                      placeholder={micOpen ? '고쳐 쓰거나 직접 입력할 수 있습니다' : '여기에 답을 적어주세요'}
                      className="t-body w-full resize-none rounded-[4px] border border-line-strong bg-surface-raised px-4 py-3 text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
                    />

                    {micNote && <p className="t-label text-warn">{micNote}</p>}
                  </>
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
