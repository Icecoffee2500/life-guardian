'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import SceneShell, { SceneCaption } from './SceneShell';
import SignalCanvas from '@/components/SignalCanvas';
import { useLiveMetrics } from '@/hooks/useSensors';
import { sensorHub } from '@/lib/sensors/hub';
import { simulationRuntime } from '@/lib/sensors/simulated';

/** 호흡 가이드 주기(초). 들숨 : 날숨 = 1 : 1 */
const BREATH_CYCLE_SEC = 4;
/** 시뮬레이터에 알려줄 페이싱 주파수(Hz) */
const BREATH_HZ = 1 / BREATH_CYCLE_SEC;

/**
 * S2 — 베이스라인.
 *
 * "지금부터 60초간 평상시 상태를 측정합니다"라고 쓰면 아무도 평상시가 되지 않는다.
 * 대신 따라 할 것 하나만 준다. 원이 커지면 들이쉬고, 작아지면 내쉰다.
 * 호흡이 맞춰지면 신호가 스스로 가라앉고, 그 순간 화면의 온도가 바뀐다.
 */
export default function S2Baseline() {
  const m = useLiveMetrics();
  const [inhaling, setInhaling] = useState(true);

  useEffect(() => {
    sensorHub.resetSettle();
    sensorHub.setWatchSettle(true);
    simulationRuntime.setBreathPacing(BREATH_HZ);
    return () => {
      sensorHub.setWatchSettle(false);
      simulationRuntime.setBreathPacing(null);
    };
  }, []);

  // 들숨/날숨 문구는 원의 애니메이션과 같은 시계를 봐야 한다
  useEffect(() => {
    const started = performance.now();
    let raf = 0;
    let last = true;
    const frame = (now: number) => {
      const t = ((now - started) / 1000) % BREATH_CYCLE_SEC;
      const next = t < BREATH_CYCLE_SEC / 2;
      // 매 프레임 setState하면 씬 전체가 60fps로 리렌더된다. 바뀔 때만 알린다.
      if (next !== last) {
        last = next;
        setInhaling(next);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 안정 판정은 허브가 래치한다(한 번 서면 세션 내내 유지). 여기서는 읽기만 한다.
  const settled = m.settled;

  return (
    <SceneShell className="px-6">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 opacity-25">
        <SignalCanvas variant="ambient" channels={['hr', 'gsr']} className="h-full w-full" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="relative flex h-[clamp(15rem,42vh,20rem)] w-[clamp(15rem,42vh,20rem)] items-center justify-center">
          {/* 바깥 궤도 — 목표 크기. 여기까지 채우면 들숨이 끝난다. */}
          <div
            className="absolute inset-0 rounded-full border transition-colors duration-[2500ms]"
            style={{
              borderColor: settled ? 'rgba(159,180,137,0.22)' : 'rgba(236,233,227,0.10)',
            }}
          />

          <motion.div
            className="absolute rounded-full border"
            style={{
              inset: 0,
              borderColor: settled ? 'rgba(159,180,137,0.55)' : 'rgba(236,233,227,0.4)',
              transition: 'border-color 2500ms ease',
            }}
            animate={{ scale: [0.58, 1, 0.58] }}
            transition={{
              duration: BREATH_CYCLE_SEC,
              repeat: Infinity,
              ease: [0.45, 0, 0.55, 1],
            }}
          />

          {/* 안쪽 면 — 숨이 차오르는 감각 */}
          <motion.div
            className="absolute rounded-full"
            style={{
              inset: 0,
              background: settled
                ? 'radial-gradient(circle, rgba(159,180,137,0.13) 0%, rgba(159,180,137,0) 70%)'
                : 'radial-gradient(circle, rgba(236,233,227,0.10) 0%, rgba(236,233,227,0) 70%)',
              transition: 'background 2500ms ease',
            }}
            animate={{ scale: [0.5, 0.94, 0.5], opacity: [0.5, 1, 0.5] }}
            transition={{
              duration: BREATH_CYCLE_SEC,
              repeat: Infinity,
              ease: [0.45, 0, 0.55, 1],
            }}
          />

          <AnimatePresence mode="wait">
            <motion.span
              key={inhaling ? 'in' : 'out'}
              className="text-[13px] font-light tracking-[0.3em] text-paper-dim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              {inhaling ? '들이쉬고' : '내쉬고'}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="mt-12 h-10">
          <AnimatePresence mode="wait">
            {settled ? (
              <motion.div
                key="settled"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.1, ease: [0.22, 0.61, 0.36, 1] }}
                className="flex flex-col items-center"
              >
                <span className="text-[13px] font-light text-hrv">신호가 가라앉았습니다</span>
                <span className="tnum mt-2 text-[11px] tracking-[0.12em] text-paper-mute">
                  {m.settleTimeSec?.toFixed(1)}초 만에 안정
                </span>
              </motion.div>
            ) : (
              <motion.div key="guide" exit={{ opacity: 0 }}>
                <SceneCaption>원의 리듬에 호흡을 맞춰 주세요.</SceneCaption>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </SceneShell>
  );
}
