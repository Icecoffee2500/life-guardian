'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import SceneShell from './SceneShell';
import { useLiveMetrics } from '@/hooks/useSensors';
import { sensorHub } from '@/lib/sensors/hub';
import { mean, slice } from '@/lib/features/signal';
import { sessionRecorder } from '@/lib/session/recorder';
import { sessionClock } from '@/lib/sensors/clock';

/**
 * S3 — 이완.
 *
 * 아무 지시도 없는 30초는 길다. 하지만 여기서 뭔가를 시키면 이완이 아니게 된다.
 * 그래서 화면은 거의 비우되, 마지막 6초에 딱 하나만 돌려준다:
 * "당신의 심박이 방금 N 내려갔습니다." 참가자가 자기 몸의 변화를 처음 목격하는 순간이고,
 * 이 순간이 뒤의 모든 해석을 믿게 만든다.
 */
export default function S3Calm({ progress }: { progress: number }) {
  const m = useLiveMetrics();
  const [drop, setDrop] = useState<number | null>(null);

  useEffect(() => {
    sensorHub.setWatchSettle(true);
    return () => sensorHub.setWatchSettle(false);
  }, []);

  // 마지막 구간에서 한 번만 계산한다 (매 프레임 평균을 다시 내지 않는다).
  // 렌더 중 상태 조정 패턴 — 값이 잡히면 그대로 굳는다.
  const revealing = progress > 0.78;
  if (revealing && drop === null) {
    const t = sessionClock.now();
    const s2 = sessionRecorder.spanOf('S2');
    const early = s2
      ? slice(sessionRecorder.hr, s2.start, s2.start + 12000)
      : slice(sessionRecorder.hr, 0, 12000);
    const now = slice(sessionRecorder.hr, t - 8000, t + 1);
    if (early.length >= 20 && now.length >= 20) {
      setDrop(mean(early.map((p) => p.v)) - mean(now.map((p) => p.v)));
    }
  }

  return (
    <SceneShell className="px-6">
      <div className="flex flex-col items-center">
        {/* 아주 느린 숨 하나. 따라 하라고 말하지 않는다. */}
        <motion.div
          className="h-24 w-24 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(159,180,137,0.22) 0%, rgba(159,180,137,0) 68%)',
          }}
          animate={{ scale: [0.8, 1.25, 0.8], opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />

        <motion.p
          className="mt-10 text-center text-[clamp(1.05rem,2.2vw,1.5rem)] font-light text-paper-dim"
          animate={{ opacity: [0.55, 0.9, 0.55] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        >
          잠시 눈을 감아도 좋습니다
        </motion.p>

        <div className="mt-14 h-16">
          <AnimatePresence>
            {revealing && (
              <motion.div
                key="reveal"
                initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1.4, ease: [0.22, 0.61, 0.36, 1] }}
                className="flex flex-col items-center"
              >
                {drop !== null && drop > 0.8 ? (
                  <>
                    <span className="text-[12px] tracking-[0.14em] text-paper-mute">
                      들어올 때보다
                    </span>
                    <span className="mt-2 text-[15px] font-light text-paper">
                      심박이{' '}
                      <span className="tnum text-hr">{drop.toFixed(1)}</span> bpm 내려갔습니다
                    </span>
                  </>
                ) : (
                  <span className="text-[13px] font-light text-paper-dim">
                    {m.settled ? '지금 상태를 기준선으로 잡았습니다' : '기록하고 있습니다'}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </SceneShell>
  );
}
