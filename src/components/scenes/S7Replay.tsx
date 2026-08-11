'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import SceneShell from './SceneShell';
import SessionTimeline from '@/components/experience/SessionTimeline';
import { QuizAsk, QuizReveal } from '@/components/experience/PredictionQuiz';
import { buildQuiz } from '@/lib/experience/quiz';
import { sessionRecorder } from '@/lib/session/recorder';
import { useSession } from '@/lib/session/store';
import { STIMULUS_PAIRS } from '@/lib/stimuli/pairs';
import { round } from '@/lib/features/signal';

/**
 * S7 — 리플레이.
 *
 * 해석이 오는 20~30초를 로딩 스피너로 때우지 않는다. 그 시간에
 * 참가자는 (1) 자기 기록을 맞혀보고 (2) 답을 확인하고 (3) 지나온 신호를 내려다본다.
 *
 * 여기 뜨는 문장은 전부 실제 기록에서 뽑는다. 연출용으로 지어내지 않는다 —
 * 이 씬에서 한 번이라도 거짓말을 하면 뒤에 나올 영수증 전체가 의심받는다.
 */

/** 씬 진행도에서 각 막의 경계 */
const ASK_UNTIL = 0.45;
const REVEAL_UNTIL = 0.68;

interface Beat {
  /** 0~1. 타임라인 상의 위치 */
  at: number;
  text: string;
}

function buildBeats(): Beat[] {
  const hr = sessionRecorder.hr;
  if (hr.length < 2) return [];
  const t0 = hr[0].t;
  const span = Math.max(1, hr[hr.length - 1].t - t0);
  const at = (t: number) => Math.min(0.97, Math.max(0.03, (t - t0) / span));
  const beats: Beat[] = [];

  // 1) 베이스라인 — 오늘의 기준
  const s2 = sessionRecorder.spanOf('S2');
  if (s2) {
    const win = hr.filter((p) => p.t >= s2.start && p.t <= s2.end);
    if (win.length > 20) {
      const m = win.reduce((s, p) => s + p.v, 0) / win.length;
      beats.push({ at: at((s2.start + s2.end) / 2), text: `여기까지가 오늘의 기준선입니다 · ${round(m, 0)} bpm` });
    }
  }

  // 2) 시선 — 가장 크게 반응한 자극쌍
  let peakTrial: { t: number; label: string; amp: number } | null = null;
  for (const trial of sessionRecorder.gazeTrials) {
    const win = sessionRecorder.gsr.filter((p) => p.t >= trial.onset && p.t <= trial.offset + 3000);
    if (win.length < 10) continue;
    const base = win[0].v;
    const peak = Math.max(...win.map((p) => p.v));
    const amp = peak - base;
    const pair = STIMULUS_PAIRS.find((p) => p.id === trial.pairId);
    if (!pair) continue;
    // 더 오래 본 쪽을 고른다
    const off = trial.samples.filter((s) => Math.abs(s.x - 0.5) > 0.06);
    const aSide = off.filter((s) => (trial.flipped ? s.x > 0.5 : s.x < 0.5)).length;
    const label = aSide >= off.length / 2 ? pair.a.label : pair.b.label;
    if (!peakTrial || amp > peakTrial.amp) peakTrial = { t: trial.onset, label, amp };
  }
  if (peakTrial && peakTrial.amp > 0.05) {
    beats.push({ at: at(peakTrial.t), text: `"${peakTrial.label}"에서 몸이 가장 크게 반응했습니다` });
  }

  // 3) 그림 — 착수까지 걸린 시간
  const tree = sessionRecorder.drawTasks.find((t) => t.id === 'tree');
  const firstPoint = tree?.strokes[0]?.points[0];
  if (tree && firstPoint) {
    const delay = round(Math.max(0, firstPoint.t - tree.startedAt) / 1000, 1);
    beats.push({ at: at(tree.startedAt), text: `첫 획까지 ${delay}초 망설였습니다` });
  }

  // 4) 대화 — 가장 오래 뜸을 들인 문항
  let slowest: { t: number; topic: string; sec: number } | null = null;
  for (const turn of sessionRecorder.dialogueTurns) {
    if (turn.speechStartT === null || turn.q === 0) continue;
    const sec = (turn.speechStartT - turn.readEndT) / 1000;
    if (!slowest || sec > slowest.sec) slowest = { t: turn.readEndT, topic: turn.topic, sec };
  }
  if (slowest && slowest.sec > 1.5) {
    beats.push({
      at: at(slowest.t),
      text: `"${slowest.topic}" 앞에서 ${round(slowest.sec, 1)}초 머뭇거렸습니다`,
    });
  }

  return beats.sort((a, b) => a.at - b.at);
}

function TimelineAct({ progress }: { progress: number }) {
  const beats = useMemo(() => buildBeats(), []);
  const [shown, setShown] = useState<Beat | null>(null);
  const lastIdx = useRef(-1);

  useEffect(() => {
    // 재생 헤드가 비트를 지날 때마다 그 문장을 띄운다
    const idx = beats.findIndex((b, i) => progress >= b.at && (i === beats.length - 1 || progress < beats[i + 1].at));
    if (idx !== -1 && idx !== lastIdx.current) {
      lastIdx.current = idx;
      setShown(beats[idx]);
    }
  }, [beats, progress]);

  return (
    <>
      <p className="t-label shrink-0 text-center">오늘 당신의 몸이 지나온 길</p>

      <div className="mt-8 h-[clamp(8rem,22vh,12rem)] shrink-0">
        <SessionTimeline progress={progress} className="h-full w-full" />
      </div>

      <div className="mt-8 flex h-16 shrink-0 items-start justify-center">
        <AnimatePresence mode="wait">
          {shown && (
            <motion.p
              key={shown.text}
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
              transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
              className="t-title max-w-xl text-balance text-center text-ink"
            >
              {shown.text}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

export default function S7Replay({ progress }: { progress: number }) {
  const gazeMode = useSession((s) => s.gazeMode);
  const gazeCalibrated = useSession((s) => s.gazeCalibrated);

  /*
    문항은 씬에 들어오는 순간 한 번만 만든다. 매 렌더마다 다시 만들면
    타이머가 진행되는 동안 문항이 바뀌어 답이 초기화된다.
    시선 문항은 보정된 웹캠으로 잰 경우에만 낸다 — quiz.ts의 정직성 규칙.
  */
  const items = useMemo(
    () => buildQuiz(sessionRecorder, { gazeTrusted: gazeMode === 'webcam' && gazeCalibrated }),
    [gazeCalibrated, gazeMode],
  );
  const [picks, setPicks] = useState<(number | null)[]>(() => items.map(() => null));

  const hasQuiz = items.length > 0;
  // 물을 것이 없으면 타임라인이 씬 전체를 쓴다
  const act = !hasQuiz
    ? 'timeline'
    : progress < ASK_UNTIL
      ? 'ask'
      : progress < REVEAL_UNTIL
        ? 'reveal'
        : 'timeline';
  const timelineProgress = hasQuiz
    ? Math.min(1, Math.max(0, (progress - REVEAL_UNTIL) / (1 - REVEAL_UNTIL)))
    : progress;

  return (
    <SceneShell align="stretch" className="px-6 sm:px-12">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center py-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={act}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {act === 'ask' && (
              <QuizAsk
                items={items}
                picks={picks}
                onPick={(i, o) =>
                  setPicks((prev) => {
                    // 이미 답한 문항은 바꾸지 않는다. 답을 바꿔가며 맞히면 퀴즈가 아니다.
                    if (prev[i] !== null) return prev;
                    const next = [...prev];
                    next[i] = o;
                    return next;
                  })
                }
              />
            )}
            {act === 'reveal' && <QuizReveal items={items} picks={picks} />}
            {act === 'timeline' && <TimelineAct progress={timelineProgress} />}
          </motion.div>
        </AnimatePresence>

        <motion.p
          className="t-label mt-6 shrink-0 text-center"
          animate={{ opacity: [0.35, 0.8, 0.35] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          해석을 정리하고 있습니다
        </motion.p>
      </div>
    </SceneShell>
  );
}
