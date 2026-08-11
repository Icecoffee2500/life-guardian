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
import { BleHeartRateSource } from '@/lib/sensors/ble-heart-rate';
import { SerialGsrSource } from '@/lib/sensors/serial-gsr';
import { WebGazerSource } from '@/lib/sensors/webgazer';
import type { BioSource, GazeSource, SourceSnapshot } from '@/lib/sensors/types';
import type { SignalMode } from '@/lib/session/store';
import type { PersonaId } from '@/lib/sensors/personas';

/**
 * 실기기 연결을 시도하고, 실패하면 시뮬레이터로 갈아끼운다.
 *
 * 이 함수가 이 프로젝트의 안전장치다. 밴드 배터리가 없든, 웹캠 권한을 거부당하든,
 * 아두이노 포트를 시리얼 모니터가 물고 있든 — 체험은 그냥 계속된다.
 * 진행자는 /operator의 소스 목록에서 무엇이 대체되었는지 볼 수 있다.
 */
async function connectOrFallback<T extends BioSource | GazeSource>(
  live: () => T,
  fallback: () => T,
): Promise<T> {
  try {
    const source = live();
    await source.connect();
    return source;
  } catch {
    const sim = fallback();
    await sim.connect();
    return sim;
  }
}

/**
 * 세션 전체 수명 동안 센서를 붙여 둔다.
 *
 * 씬 컴포넌트 안에서 이걸 호출하면 씬이 바뀌는 순간 신호가 끊긴다.
 * 반드시 체험 페이지(부모) 한 곳에서만 호출한다.
 */
export function useSensorSetup(signalMode: SignalMode, personaId: PersonaId, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    simulationRuntime.setPersona(personaId);

    if (signalMode === 'live') {
      // 실기기는 붙일 소스가 무엇이 될지 연결해 봐야 안다(실패하면 시뮬레이터로 대체).
      // 그래서 연결이 끝난 뒤에 붙인다.
      void (async () => {
        const [band, gsr, gaze] = await Promise.all([
          connectOrFallback<BioSource>(
            () => new BleHeartRateSource(),
            () => new SimulatedBandSource(),
          ),
          connectOrFallback<BioSource>(
            () => new SerialGsrSource(),
            () => new SimulatedGsrSource(),
          ),
          connectOrFallback<GazeSource>(() => new WebGazerSource(), () => new MouseGazeSource()),
        ]);

        // 연결이 끝나기 전에 씬을 벗어났으면 즉시 정리한다
        if (cancelled) {
          band.disconnect();
          gsr.disconnect();
          gaze.disconnect();
          return;
        }
        sensorHub.attachBio(band);
        sensorHub.attachBio(gsr);
        sensorHub.attachGaze(gaze);
      })();
    } else {
      // 시뮬레이션 경로는 먼저 붙이고 나중에 연결한다.
      // S1 연결 씬이 '대기 → 연결 → 수신'으로 채워지는 리듬이 여기서 나온다.
      const band = new SimulatedBandSource();
      const gsr = new SimulatedGsrSource();
      // 가상 참가자 모드에서는 시선까지 시뮬레이터가 만든다.
      // 데모 모드에서는 관람자의 포인터가 시선 프록시가 된다.
      const gaze = signalMode === 'auto' ? new SimulatedGazeSource() : new MouseGazeSource();

      sensorHub.attachBio(band);
      sensorHub.attachBio(gsr);
      sensorHub.attachGaze(gaze);
      void Promise.all([band.connect(), gsr.connect(), gaze.connect()]);
    }

    return () => {
      cancelled = true;
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
