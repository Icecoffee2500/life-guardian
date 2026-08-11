'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import GazeCursor from '@/components/experience/GazeCursor';
import ProgressRail from '@/components/experience/ProgressRail';
import SceneNav from '@/components/experience/SceneNav';
import GazeCursorToggle from '@/components/experience/GazeCursorToggle';
import SoundToggle from '@/components/experience/SoundToggle';
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
import { heartbeat } from '@/lib/audio/heartbeat';
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

  /*
    자동 진행은 무인 시연(auto 모드)에서만 한다.

    사람이 하는 체험에서는 시간이 다 돼도 화면이 저 혼자 넘어가지 않는다.
    쫓기는 느낌은 그 자체로 각성을 만들고, 그 각성이 다음 씬의 측정에 그대로 실린다 —
    즉 재촉은 취향 문제가 아니라 데이터 오염이다.
  */
  const autoAdvance = signalMode === 'auto';

  /** 이 씬이 예정한 시간·시퀀스를 마쳤는가 (자기 운전 씬은 스스로 알려온다) */
  const [sceneReady, setSceneReady] = useState(false);

  const onDone = useCallback(() => {
    if (autoAdvance) advance();
    else setSceneReady(true);
  }, [advance, autoAdvance]);

  const { progress, complete } = useSceneTimer(duration, onDone, {
    paused: status === 'paused',
    key: `${scene}:${sceneNonce}`,
    autoAdvance,
  });

  // 스스로 운전하는 씬은 진행도를 여기로 올려 보낸다 (상단 레일이 계속 살아 있도록).
  // 씬이 바뀌면 렌더 중에 0으로 되돌린다 — 이전 씬의 100%가 한 프레임 남지 않게.
  const sceneKey = `${scene}:${sceneNonce}`;
  const [subProgress, setSubProgress] = useState(0);
  const [lastKey, setLastKey] = useState(sceneKey);
  if (sceneKey !== lastKey) {
    setLastKey(sceneKey);
    setSubProgress(0);
    setSceneReady(false);
  }
  const railProgress = selfDriven ? subProgress : progress;

  // 진행자 화면으로 실황을 내보낸다 (같은 기기의 다른 창 + Supabase가 있으면 다른 기기)
  useSessionBroadcast(railProgress);

  /*
    시선 물방울.

    두 가지 조건이 모두 맞을 때만 뜬다.
    1) 웹캠으로 보정까지 마쳤을 것 — 포인터 프록시에서 띄우면 마우스를 눈이라 부르는 셈이다
    2) 지금이 시선 씬(S4)일 것 — 시선을 재지 않는 화면에서 방울이 떠다니면
       읽는 데 방해만 되고, 무엇을 재는 중인지도 흐려진다

    앞선 판(版)은 반대로 되어 있었다. 자극이 떠 있는 동안 감추고 나머지에서 띄웠는데,
    그러면 정작 시선 씬에서는 방울이 안 보이고 다른 씬에서만 떠다닌다.
    자극 위에 방울이 보이면 시선이 그쪽으로 끌릴 위험이 있지만, 그건 우하단
    '시선 표시' 스위치로 끌 수 있게 두고, 기본은 **보이는 쪽**으로 정한다.
  */
  const gazeMode = useSession((s) => s.gazeMode);
  const gazeCalibrated = useSession((s) => s.gazeCalibrated);
  const gazeCursor = useSession((s) => s.gazeCursor);
  const gazeLive = gazeMode === 'webcam' && gazeCalibrated;
  const gazeScene = scene === 'S4';

  /*
    심장 소리는 대화 씬에서만 재운다.
    마이크가 열려 있는 동안 스피커에서 심박이 나오면 STT가 그걸 같이 받아 적고,
    응답 지연(첫 발화 시각) 측정까지 오염된다.
    결과 화면에서도 멈춘다 — 측정이 끝난 뒤의 심박은 더 이상 이야기의 일부가 아니다.
  */
  const soundActive = scene !== 'S6' && scene !== 'S8';
  useEffect(() => {
    heartbeat.setActive(soundActive);
  }, [soundActive]);

  // 페이지를 떠나면 소리도 끝난다
  useEffect(() => () => heartbeat.disable(), []);

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
      className="relative h-dvh w-full overflow-hidden"
    >
      {scene !== 'S0' && <ProgressRail scene={scene} sceneProgress={railProgress} />}

      {gazeLive && gazeScene && <GazeCursor visible={gazeCursor} />}

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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-6 pb-6 sm:px-10">
          <VitalsReadout />
          <div className="flex items-center gap-4">
            {gazeLive && gazeScene && <GazeCursorToggle />}
            {/* 소리를 재우는 씬에서는 스위치도 숨긴다 — '켜짐'인데 조용하면 고장으로 읽힌다 */}
            {soundActive && <SoundToggle />}
            {/*
              S1은 자기 화면 안에 '측정 시작'이 있고, S8은 영수증 버튼이 끝이다.
              같은 일을 하는 버튼을 두 개 두지 않는다.
            */}
            {scene !== 'S1' && scene !== 'S8' && (
              <SceneNav
                onBack={back}
                onNext={advance}
                canBack
                canNext
                ready={selfDriven ? sceneReady : complete}
              />
            )}
            <span className="t-label">{def.label}</span>
          </div>
        </div>
      )}
    </main>
  );
}
