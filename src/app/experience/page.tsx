'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import ProgressRail from '@/components/experience/ProgressRail';
import VitalsReadout from '@/components/experience/VitalsReadout';
import S0Intro from '@/components/scenes/S0Intro';
import S1Connect from '@/components/scenes/S1Connect';
import S2Baseline from '@/components/scenes/S2Baseline';
import S3Calm from '@/components/scenes/S3Calm';
import S4Gaze from '@/components/scenes/S4Gaze';
import S5Draw from '@/components/scenes/S5Draw';
import S6Dialogue from '@/components/scenes/S6Dialogue';
import S7Replay from '@/components/scenes/S7Replay';
import S8Result from '@/components/scenes/S8Result';
import { useSceneTimer } from '@/hooks/useSceneTimer';
import { useSensorSetup } from '@/hooks/useSensors';
import { useInterpretation } from '@/hooks/useInterpretation';
import { useSessionBroadcast } from '@/hooks/useSessionBroadcast';
import { useSession } from '@/lib/session/store';
import { isSelfDriven, sceneDef } from '@/lib/session/scenes';

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
  // S7에 들어가는 순간 해석이 뒤에서 시작된다. 리플레이가 그 대기 시간을 덮는다.
  useInterpretation();

  const def = sceneDef(scene);
  const selfDriven = isSelfDriven(scene);
  const duration = selfDriven ? null : def.durationSec(mode);

  const onDone = useCallback(() => advance(), [advance]);
  const { progress } = useSceneTimer(duration, onDone, {
    paused: status === 'paused',
    key: `${scene}:${sceneNonce}`,
  });

  // 스스로 운전하는 씬은 진행도를 여기로 올려 보낸다 (상단 레일이 계속 살아 있도록).
  // 씬이 바뀌면 렌더 중에 0으로 되돌린다 — 이전 씬의 100%가 한 프레임 남지 않게.
  const sceneKey = `${scene}:${sceneNonce}`;
  const [subProgress, setSubProgress] = useState(0);
  const [lastKey, setLastKey] = useState(sceneKey);
  if (sceneKey !== lastKey) {
    setLastKey(sceneKey);
    setSubProgress(0);
  }
  const railProgress = selfDriven ? subProgress : progress;

  // 진행자 화면으로 실황을 내보낸다 (같은 기기의 다른 창 + Supabase가 있으면 다른 기기)
  useSessionBroadcast(railProgress);

  // 진행자용 단축키: → 다음 씬, ← 이전 씬
  const back = useSession((s) => s.back);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement;
      // 입력 중에는 화살표가 커서 이동이어야 한다
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') advance();
      if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [advance, back]);

  return (
    // data-scene은 스크린샷 하네스와 진행자 디버깅용이다. 렌더에는 영향이 없다.
    <main
      data-scene={scene}
      data-status={status}
      className="relative h-dvh w-full overflow-hidden bg-ink-950"
    >
      {scene !== 'S0' && <ProgressRail scene={scene} sceneProgress={railProgress} />}

      <div className="absolute inset-0">
        {/* mode를 지정하지 않아 씬이 겹치며 교차한다 — 전환 중 검은 공백이 없다 */}
        <AnimatePresence>
          {scene === 'S0' && <S0Intro key="S0" onStart={begin} />}
          {scene === 'S1' && <S1Connect key="S1" onDone={advance} />}
          {scene === 'S2' && <S2Baseline key="S2" />}
          {scene === 'S3' && <S3Calm key="S3" progress={progress} />}
          {scene === 'S4' && <S4Gaze key="S4" onDone={onDone} onProgress={setSubProgress} />}
          {scene === 'S5' && <S5Draw key="S5" onDone={onDone} onProgress={setSubProgress} />}
          {scene === 'S6' && <S6Dialogue key="S6" onDone={onDone} onProgress={setSubProgress} />}
          {scene === 'S7' && <S7Replay key="S7" progress={progress} />}
          {scene === 'S8' && <S8Result key="S8" />}
        </AnimatePresence>
      </div>

      {scene !== 'S0' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between px-6 pb-6 sm:px-10">
          <VitalsReadout />
          <span className="text-[10px] tracking-[0.14em] text-paper-mute/60">{def.label}</span>
        </div>
      )}
    </main>
  );
}
