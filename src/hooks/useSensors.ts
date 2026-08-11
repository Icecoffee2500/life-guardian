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
import type { BioSource, SourceSnapshot } from '@/lib/sensors/types';
import type { SignalMode } from '@/lib/session/store';
import type { PersonaId } from '@/lib/sensors/personas';

export type LiveDeviceKind = 'band' | 'gsr' | 'gaze';

/**
 * 기기 하나를 실기기로 교체한다. **반드시 클릭 핸들러 안에서 호출한다.**
 *
 * requestDevice/requestPort는 사용자 제스처를 요구하므로, 이 함수가 await를 만나기
 * 전에 브라우저 선택 다이얼로그가 떠야 한다. 그래서 connect()를 가장 먼저 부른다.
 *
 * 실패하면 아무것도 바꾸지 않는다 — 붙어 있던 시뮬레이터가 그대로 남아
 * 체험이 끊기지 않는다. 밴드 배터리가 없든, 웹캠 권한을 거부당하든,
 * 아두이노 포트를 시리얼 모니터가 물고 있든 마찬가지다.
 */
export async function connectLiveSource(kind: LiveDeviceKind): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    if (kind === 'gaze') {
      const src = new WebGazerSource();
      await src.connect();
      sensorHub.replaceGaze(src);
    } else {
      const src: BioSource = kind === 'band' ? new BleHeartRateSource() : new SerialGsrSource();
      await src.connect();
      sensorHub.replaceBio(kind, src);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '연결 실패' };
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

    simulationRuntime.setPersona(personaId);

    if (signalMode === 'live') {
      /*
       * 실기기는 여기서 자동 연결하지 않는다.
       *
       * Web Bluetooth의 requestDevice와 Web Serial의 requestPort는 **사용자 제스처
       * 안에서만** 호출할 수 있고, 각각 브라우저 선택 다이얼로그를 띄운다.
       * 이펙트에서 세 개를 한꺼번에 부르면 (a) 제스처가 이미 소모돼 있고
       * (b) 다이얼로그가 서로 겹쳐서 두 번째부터는 그냥 실패한다.
       *
       * 그래서 실기기 모드에서는 우선 시뮬레이터로 붙여 체험을 살려 두고,
       * 진행자가 /operator에서 기기별 '연결' 버튼을 눌러 하나씩 교체한다.
       * connectLiveSource()가 그 교체를 맡는다.
       */
      const band = new SimulatedBandSource();
      const gsr = new SimulatedGsrSource();
      const gaze = new MouseGazeSource();
      sensorHub.attachBio(band);
      sensorHub.attachBio(gsr);
      sensorHub.attachGaze(gaze);
      void Promise.all([band.connect(), gsr.connect(), gaze.connect()]);
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

    return () => sensorHub.detachAll();
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
