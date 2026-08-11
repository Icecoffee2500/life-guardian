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
import {
  cancelSpeech,
  recognitionErrorMessage,
  speak,
  speechCapabilities,
  startRecognition,
} from '@/lib/speech';
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
 * 지금은 네 가지를 지킨다:
 *  1. 마이크를 **명시적으로 연다**. 권한 프롬프트가 제때 뜬다.
 *  2. 인식기가 마이크를 여는 순간(onAudioStart)을 받아 '듣는 중'을 표시한다.
 *  3. 실패하면 **이유 코드를 화면에 그대로 보여준다.** 부스에서 추측하지 않기 위해서다.
 *  4. 타이핑 입력을 폴백이 아니라 **항상 같이** 둔다. 어느 쪽으로든 답할 수 있다.
 *
 * 마이크 장치는 인식기에게 넘긴다. 레벨 미터용 스트림을 붙잡고 있으면
 * 브라우저 인식이 장치를 못 여는 환경이 있어서, 인식이 되는 브라우저에서는
 * 권한만 받고 스트림을 즉시 놓아준다.
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

  /** 참가자가 음성 입력을 켰는가 — 인식기의 수명을 결정한다 */
  const [voiceOn, setVoiceOn] = useState(false);
  /** 레벨 미터용 스트림이 살아 있는가. 인식을 지원하지 않는 브라우저에서만 켠다. */
  const [meterOn, setMeterOn] = useState(false);
  /** 마이크 입력 레벨 0~1 */
  const [level, setLevel] = useState(0);
  const [micNote, setMicNote] = useState<string | null>(null);
  /** 인식기가 마이크를 실제로 열었는가 — 예전의 레벨 미터를 대신하는 증거 */
  const [listening, setListening] = useState(false);

  const micRef = useRef<MicHandle | null>(null);
  const transcriptRef = useRef('');
  const speechStartRef = useRef<number | null>(null);
  /** 지금 진행 중인 문항 번호 — 인식 콜백이 이벤트에 붙인다 */
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

  // ── 마이크 열기 ─────────────────────────────────────────────
  /*
    getUserMedia는 **권한을 받기 위해서만** 연다. 받자마자 장치를 놓아준다.

    레벨 미터를 위해 스트림을 붙잡고 있었는데, 그 스트림이 마이크를 쥔 채로는
    브라우저 음성 인식이 장치를 열지 못하는 환경이 있다(audio-capture / network).
    미터는 "듣고 있다"를 보여주는 장치일 뿐이고, 인식은 이 씬의 기능 자체다.
    둘이 부딪히면 미터를 포기한다 — 대신 인식기가 마이크를 여는 순간(onAudioStart)을
    받아서 같은 역할을 시킨다.

    인식을 아예 지원하지 않는 브라우저에서만 스트림을 붙잡고 미터를 돌린다.
  */
  const enableMic = useCallback(async () => {
    setMicNote(null);
    const mic = await openMicrophone();
    if (!mic) {
      setMicNote('마이크 권한을 받지 못했습니다. 아래에 직접 입력해 주세요.');
    } else if (caps.stt) {
      mic.stop();
    } else {
      micRef.current = mic;
      setMeterOn(true);
    }
    setVoiceOn(true);
  }, [caps.stt]);

  // 레벨 미터 — 스트림이 살아 있는 동안만 돈다
  useEffect(() => {
    if (!meterOn) return;
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
  }, [meterOn]);

  useEffect(
    () => () => {
      micRef.current?.stop();
      micRef.current = null;
    },
    [],
  );

  /** 첫 발화 시각 — 응답 지연의 종료점. 한 문항에서 한 번만 찍는다. */
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
        // 음성 인식은 여기서 켜지 않는다. phase가 'answer'로 바뀌는 것을 보고
        // 아래의 전용 이펙트가 붙인다 — 참가자가 답하는 도중에 마이크를 켜도
        // 그 즉시 인식이 시작되어야 하기 때문이다.
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

  // ── 음성 인식 ───────────────────────────────────────────────
  /*
    인식기의 수명을 **응답 구간 × 음성 켜짐**에 직접 묶는다.

    예전에는 문항 시퀀스 안에서 응답 구간에 진입하는 그 순간에만 인식을 걸었고,
    조건이 `micRef.current?.live()`였다. 그런데 마이크를 켜는 버튼은 바로 그
    응답 구간에 들어가야 화면에 나타났다. 즉 첫 문항에서는 검사 시점에 마이크가
    항상 닫혀 있어서 **인식이 아예 시작되지 않았다.**
    참가자에게는 레벨 미터만 움직이고 글자는 하나도 안 적히는 화면이 보였다.

    이제는 이펙트가 상태 변화를 보고 붙였다 뗀다. 답하는 도중에 마이크를 켜도
    그 즉시 인식이 시작된다.
  */
  useEffect(() => {
    if (auto || !answering || !voiceOn || !caps.stt) return;

    // listening은 정리(cleanup)에서만 내린다. 이펙트 본문에서 동기 setState를 하면
    // 렌더가 연쇄로 다시 돈다 (react-hooks/set-state-in-effect).
    const stop = startRecognition({
      onAudioStart: () => setListening(true),
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
        setListening(false);
        // 이유 코드를 괄호에 남긴다. 부스에서 "왜 안 되지"를 추측하지 않기 위해서다.
        setMicNote(`${recognitionErrorMessage(reason)} (${reason})`);
      },
    });

    if (!stop) setMicNote('이 브라우저에서는 음성 인식을 시작할 수 없습니다. 아래에 직접 입력해 주세요.');
    return () => {
      stop?.();
      setListening(false);
    };
    // idx: 문항이 바뀌면 인식기를 새로 만들어 누적 텍스트를 비운다
  }, [answering, auto, caps.stt, idx, markSpeech, voiceOn]);

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
          {/*
            마이크 조작은 응답 구간 밖에서도 보여야 한다.
            예전에는 이 버튼이 응답 구간에만 나타나서, 참가자가 버튼을 볼 수 있게 될 때는
            이미 인식을 걸지 말지 판단이 끝난 뒤였다 — 그래서 첫 문항은 늘 인식이 죽었다.
            문항을 읽어주는 동안 미리 켜 두면 답을 시작하는 순간부터 받아 적힌다.
          */}
          {!auto && caps.stt && !voiceOn && (
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

          {!auto && voiceOn && (
            <div className="rounded-[4px] border border-line bg-surface-raised px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background:
                      answering && (listening || meterOn)
                        ? 'var(--color-hr)'
                        : 'var(--color-line-strong)',
                  }}
                />
                <span className="t-label shrink-0">
                  {!answering ? '대기' : listening || meterOn ? '듣는 중' : '마이크 여는 중'}
                </span>
                {meterOn ? (
                  /* 이 막대가 움직이면 소리가 실제로 들어오고 있다는 뜻이다 */
                  <div className="h-2 flex-1 overflow-hidden rounded-[1px] bg-surface-sunken">
                    <div
                      className="h-full transition-[width] duration-75"
                      style={{
                        width: `${Math.round(level * 100)}%`,
                        background: 'var(--color-hr)',
                      }}
                    />
                  </div>
                ) : (
                  <span className="t-label flex-1">
                    {answering && listening ? '말씀하시면 아래에 적힙니다' : ''}
                  </span>
                )}
              </div>
            </div>
          )}

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
                    {/*
                      타이핑 — 폴백이 아니라 동등한 입력 수단.
                      인식 결과도 이 칸에 바로 쓰인다. 받아 적힌 걸 다른 곳에 보여주고
                      고칠 곳을 따로 두면, 말한 게 반영됐는지 눈으로 확인하기 어렵다.
                    */}
                    <textarea
                      ref={inputRef}
                      value={transcript}
                      onChange={(e) => onType(e.target.value)}
                      rows={3}
                      placeholder={
                        voiceOn ? '말씀하시면 여기에 적힙니다. 고쳐 쓸 수도 있습니다.' : '여기에 답을 적어주세요'
                      }
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
