'use client';

import { useEffect, useState } from 'react';
import { sensorHub, type LiveMetrics } from '@/lib/sensors/hub';
import {
  SimulatedBandSource,
  SimulatedGazeSource,
  SimulatedGsrSource,
  simulationRuntime,
} from '@/lib/sensors/simulated';
import { MouseGazeSource } from '@/lib/sensors/mouse-gaze';
import type { SourceSnapshot } from '@/lib/sensors/types';
import type { SignalMode } from '@/lib/session/store';
import type { PersonaId } from '@/lib/sensors/personas';

/**
 * 세션 전체 수명 동안 센서를 붙여 둔다.
 *
 * 씬 컴포넌트 안에서 이걸 호출하면 씬이 바뀌는 순간 신호가 끊긴다.
 * 반드시 체험 페이지(부모) 한 곳에서만 호출한다.
 *
 * live 모드는 M5에서 실기기 소스를 쓰며, 연결 실패 시 시뮬레이터로 자동 폴백한다 —
 * 데모가 기기에 인질로 잡히면 안 된다.
 */
export function useSensorSetup(signalMode: SignalMode, personaId: PersonaId, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    simulationRuntime.setPersona(personaId);
    const band = new SimulatedBandSource();
    const gsr = new SimulatedGsrSource();
    // 가상 참가자 모드에서는 시선까지 시뮬레이터가 만든다.
    // 데모 모드에서는 관람자의 포인터가 시선 프록시가 된다.
    const gaze = signalMode === 'auto' ? new SimulatedGazeSource() : new MouseGazeSource();

    sensorHub.attachBio(band);
    sensorHub.attachBio(gsr);
    sensorHub.attachGaze(gaze);

    // 연결 상태는 허브 스냅샷으로 흘러나오므로 여기서 별도 상태를 들 필요가 없다
    void Promise.all([band.connect(), gsr.connect(), gaze.connect()]);

    return () => {
      sensorHub.detachAll();
    };
  }, [enabled, signalMode, personaId]);
}

/** 연결 상태 스냅샷 구독 (S1 연결 씬·진행자 대시보드) */
export function useSourceSnapshots(): SourceSnapshot[] {
  const [sources, setSources] = useState<SourceSnapshot[]>(() => sensorHub.sources());
  useEffect(() => sensorHub.onSources(setSources), []);
  return sources;
}

/** 허브의 실시간 지표 구독 */
export function useLiveMetrics(): LiveMetrics {
  const [m, setM] = useState<LiveMetrics>(() => sensorHub.current());
  useEffect(() => {
    // 25Hz로 그대로 리렌더하면 낭비다. 상태는 10Hz로만 반영하고
    // 파형은 Canvas가 직접 60fps로 그린다.
    let last = 0;
    return sensorHub.subscribe((next) => {
      const now = Date.now();
      if (now - last < 100) return;
      last = now;
      setM({ ...next });
    });
  }, []);
  return m;
}
