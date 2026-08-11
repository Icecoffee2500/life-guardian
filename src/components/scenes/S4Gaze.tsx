'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import SceneShell from './SceneShell';
import StimulusPlate from '@/components/stimuli/StimulusPlate';
import SignalCanvas from '@/components/SignalCanvas';
import { experienceBus } from '@/lib/sensors/bus';
import { sessionClock } from '@/lib/sensors/clock';
import { getPersona } from '@/lib/sensors/personas';
import { hashSeed, mulberry32 } from '@/lib/sensors/random';
import { sessionRecorder } from '@/lib/session/recorder';
import { GAZE_TIMING, pairsFor } from '@/lib/session/scenes';
import { useSession } from '@/lib/session/store';
import { affinityForRight, preferenceForA } from '@/lib/stimuli/preference';

type Phase = 'lead' | 'expose' | 'fix';

/**
 * S4 — 시선 세션.
 *
 * 참가자가 할 일은 없다. 보기만 하면 된다. 그래서 화면도 아무것도 요구하지 않는다.
 * 자극 두 장이 조용히 켜지고, 응시점 구간에는 자기 심박이 흐른다.
 *
 * 좌우는 쌍마다 무작위로 뒤집는다(카운터밸런싱). 뒤집힘 여부는 세션 ID에서 파생된
 * 결정적 난수라, 같은 세션을 다시 재생해도 같은 배치가 나온다.
 */
export default function S4Gaze({
  onDone,
  onProgress,
}: {
  onDone: () => void;
  onProgress: (p: number) => void;
}) {
  const mode = useSession((s) => s.mode);
  const signalMode = useSession((s) => s.signalMode);
  const personaId = useSession((s) => s.personaId);
  const sessionId = useSession((s) => s.sessionId);
  const paused = useSession((s) => s.status === 'paused');

  const timing = GAZE_TIMING[mode];
  // pairsFor는 매번 새 배열을 만든다. 그대로 이펙트 의존성에 넣으면
  // 리렌더마다 타임라인이 처음부터 다시 돌아 첫 시행에서 영원히 멈춘다.
  const pairs = useMemo(() => pairsFor(mode), [mode]);

  // 좌우 반전 배치 — 세션마다 고정
  const [flips] = useState<boolean[]>(() => {
    const rand = mulberry32(hashSeed(sessionId));
    return pairs.map(() => rand() < 0.5);
  });

  const [idx, setIdx] = useState(-1);
  const [phase, setPhase] = useState<Phase>('lead');
  const pointerRef = useRef<HTMLDivElement>(null);

  const onDoneRef = useRef(onDone);
  const onProgressRef = useRef(onProgress);
  const pausedRef = useRef(paused);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // 현재 시행의 시선 표본을 잘라 담기 위한 커서
  const trialRef = useRef<{ pairId: number; flipped: boolean; onset: number } | null>(null);

  const closeTrial = useCallback((t: number) => {
    const cur = trialRef.current;
    if (!cur) return;
    experienceBus.emit('stimulus-offset', { ref: `pair-${cur.pairId}`, t });
    sessionRecorder.gazeTrials.push({
      pairId: cur.pairId,
      flipped: cur.flipped,
      onset: cur.onset,
      offset: t,
      samples: sessionRecorder.gaze.filter((g) => g.t >= cur.onset && g.t <= t),
    });
    trialRef.current = null;
  }, []);

  useEffect(() => {
    const persona = getPersona(personaId);
    const cycle = timing.exposureSec + timing.fixationSec;
    const total = timing.fixationSec + pairs.length * cycle;

    let raf = 0;
    let acc = 0;
    let last = performance.now();
    let finished = false;
    let curIdx = -1;
    let curPhase: Phase = 'lead';

    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!pausedRef.current) acc += dt;

      onProgressRef.current(Math.min(1, acc / total));

      let nextIdx: number;
      let nextPhase: Phase;
      if (acc < timing.fixationSec) {
        nextIdx = -1;
        nextPhase = 'lead';
      } else {
        const w = acc - timing.fixationSec;
        nextIdx = Math.floor(w / cycle);
        nextPhase = w % cycle < timing.exposureSec ? 'expose' : 'fix';
      }

      if (nextIdx >= pairs.length) {
        if (!finished) {
          finished = true;
          closeTrial(sessionClock.now());
          onProgressRef.current(1);
          onDoneRef.current();
        }
        return;
      }

      if (nextIdx !== curIdx || nextPhase !== curPhase) {
        const t = sessionClock.now();
        if (curPhase === 'expose') closeTrial(t);
        if (nextPhase === 'expose') {
          const pair = pairs[nextIdx];
          const flipped = flips[nextIdx];
          const affinity = affinityForRight(preferenceForA(persona, pair), flipped);
          trialRef.current = { pairId: pair.id, flipped, onset: t };
          experienceBus.emit('stimulus-onset', {
            ref: `pair-${pair.id}`,
            affinity,
            // 관심 축에 가까운 자극일수록 각성이 크게 뜬다 (버스에서 affinity 보너스가 더해진다)
            intensity: 0.22,
            t,
          });
        }
        curIdx = nextIdx;
        curPhase = nextPhase;
        setIdx(nextIdx);
        setPhase(nextPhase);
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      closeTrial(sessionClock.now());
    };
  }, [closeTrial, flips, pairs, personaId, timing]);

  /**
   * 데모 모드에서는 포인터가 시선이다. 그 사실을 말로 설명하는 대신 빛으로 보여준다.
   *
   * 단, **자극 노출 중에는 절대 켜지 않는다** (구현계획 3.2.1).
   * 시선을 따라다니는 빛이 자극 위에 있으면 시선이 그 빛에 끌리고,
   * 그러면 어느 쪽을 오래 봤는지가 성향이 아니라 조명 탓이 된다.
   * 위치 추적은 계속하되 표시는 응시점 구간에만 한다.
   */
  const tracerVisible = phase !== 'expose';
  useEffect(() => {
    if (signalMode === 'auto') return;
    const el = pointerRef.current;
    if (!el) return;
    const h = (e: PointerEvent) => {
      el.style.transform = `translate3d(${e.clientX - 60}px, ${e.clientY - 60}px, 0)`;
      el.dataset.moved = '1';
    };
    window.addEventListener('pointermove', h, { passive: true });
    return () => window.removeEventListener('pointermove', h);
  }, [signalMode]);

  useEffect(() => {
    const el = pointerRef.current;
    if (!el) return;
    // 포인터가 한 번도 안 움직였으면 아직 보여줄 것이 없다
    el.style.opacity = tracerVisible && el.dataset.moved === '1' ? '1' : '0';
  }, [tracerVisible]);

  const pair = idx >= 0 && idx < pairs.length ? pairs[idx] : null;
  const flipped = idx >= 0 ? flips[idx] : false;
  const left = pair ? (flipped ? pair.b : pair.a) : null;
  const right = pair ? (flipped ? pair.a : pair.b) : null;
  const exposing = phase === 'expose' && !!pair;

  return (
    <SceneShell align="stretch" className="justify-center px-3 sm:px-10">
      {/* 시선 프록시 표식 — 존재를 알릴 만큼만, 방해하지 않을 만큼 흐리게 */}
      {signalMode !== 'auto' && (
        <div
          ref={pointerRef}
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-20 h-[120px] w-[120px] rounded-full opacity-0 transition-opacity duration-700"
          style={{
            background:
              'radial-gradient(circle, rgba(236,233,227,0.075) 0%, rgba(236,233,227,0) 68%)',
          }}
        />
      )}

      <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-center py-16">
        {/* 첫 시행에서만 나오는 한 줄. 두 번째부터는 침묵이 낫다.
            자리는 늘 비워 두어 자극이 위아래로 튀지 않게 한다. */}
        <div className="mb-7 h-4 shrink-0">
          <AnimatePresence>
            {idx <= 0 && (
              <motion.p
                className="t-label text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1 }}
              >
                고르지 마세요. 보기만 하면 됩니다.
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* 두 판은 언제나 같은 비율·같은 크기. 한쪽이 크면 그게 곧 편향이다. */}
        <div className="grid w-full grid-cols-2 items-center justify-items-center gap-3 sm:gap-10">
          {left && right && (
            <>
              <StimulusPlate
                key={`${idx}-l`}
                image={left}
                active={exposing}
                className="aspect-[4/3] max-h-[62vh] w-full"
              />
              <StimulusPlate
                key={`${idx}-r`}
                image={right}
                active={exposing}
                className="aspect-[4/3] max-h-[62vh] w-full"
              />
            </>
          )}
        </div>

        {/* 중앙 응시점 — 노출 사이의 눈의 원점 */}
        <AnimatePresence>
          {!exposing && (
            <motion.div
              key="fix"
              className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <motion.span
                className="text-[30px] font-light text-ink-3"
                animate={{ opacity: [0.45, 0.9, 0.45] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden
              >
                +
              </motion.span>
              <div className="mt-8 h-9 w-56 opacity-70">
                <SignalCanvas variant="strip" channels={['hr']} className="h-full w-full" speed={52} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pointer-events-none mt-9 flex shrink-0 justify-center gap-2">
          {pairs.map((p, i) => (
            <span
              key={p.id}
              className="h-px w-5 transition-colors duration-500"
              style={{
                background:
                  i < idx
                    ? 'rgba(236,233,227,0.5)'
                    : i === idx
                      ? 'rgba(236,233,227,0.9)'
                      : 'rgba(236,233,227,0.18)',
              }}
            />
          ))}
        </div>
      </div>
    </SceneShell>
  );
}
