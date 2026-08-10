'use client';

import { useCallback, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import ProgressRail from '@/components/experience/ProgressRail';
import VitalsReadout from '@/components/experience/VitalsReadout';
import S0Intro from '@/components/scenes/S0Intro';
import S1Connect from '@/components/scenes/S1Connect';
import PlaceholderScene from '@/components/scenes/PlaceholderScene';
import { useSceneTimer } from '@/hooks/useSceneTimer';
import { useSensorSetup } from '@/hooks/useSensors';
import { useSession } from '@/lib/session/store';
import { sceneDef } from '@/lib/session/scenes';

export default function ExperiencePage() {
  const scene = useSession((s) => s.scene);
  const mode = useSession((s) => s.mode);
  const status = useSession((s) => s.status);
  const sceneNonce = useSession((s) => s.sceneNonce);
  const begin = useSession((s) => s.begin);
  const advance = useSession((s) => s.advance);

  const signalMode = useSession((s) => s.signalMode);
  const personaId = useSession((s) => s.personaId);
  // 센서는 세션 전체 수명 동안 살아 있어야 한다 (씬별로 붙였다 떼면 신호가 끊긴다)
  useSensorSetup(signalMode, personaId, scene !== 'S0');

  const def = sceneDef(scene);
  const duration = def.durationSec(mode);

  const onDone = useCallback(() => advance(), [advance]);
  const { progress, remaining } = useSceneTimer(duration, onDone, {
    paused: status === 'paused',
    key: `${scene}:${sceneNonce}`,
  });

  // 진행자용 단축키: → 다음 씬, ← 이전 씬
  const back = useSession((s) => s.back);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') advance();
      if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [advance, back]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink-950">
      {scene !== 'S0' && <ProgressRail scene={scene} sceneProgress={progress} />}

      <div className="absolute inset-0">
        {/* mode를 지정하지 않아 씬이 겹치며 교차한다 — 전환 중 검은 공백이 없다 */}
        <AnimatePresence>
          {scene === 'S0' && <S0Intro key="S0" onStart={begin} />}
          {scene === 'S1' && <S1Connect key="S1" onDone={advance} />}
          {scene !== 'S0' && scene !== 'S1' && (
            <PlaceholderScene key={scene} def={def} progress={progress} remaining={remaining} />
          )}
        </AnimatePresence>
      </div>

      {scene !== 'S0' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between px-6 pb-6 sm:px-10">
          <VitalsReadout />
          <span className="text-[10px] tracking-[0.14em] text-paper-mute/60">
            {def.label}
          </span>
        </div>
      )}
    </main>
  );
}
