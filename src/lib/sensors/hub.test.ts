import { describe, expect, it } from 'vitest';
import { BaseSource } from './base';
import { ExperienceBus } from './bus';
import { PhysiologyEngine } from './physiology';
import { getPersona } from './personas';
import { SensorHub } from './hub';
import { SessionRecorder } from '@/lib/session/recorder';
import type { BioSample, GazeSample, SourceKind, SourceMode } from './types';

/** 테스트에서 임의의 샘플을 밀어 넣기 위한 소스 */
class FeedSource extends BaseSource<BioSample> {
  readonly kind: SourceKind = 'band';
  readonly mode: SourceMode = 'simulated';
  readonly label = 'test';
  async connect(): Promise<void> {
    this.setStatus('streaming');
  }
  feed(s: BioSample): void {
    this.push(s);
  }
}

/** 시선 표본을 손으로 밀어 넣는 소스 */
class ManualGazeSource extends BaseSource<GazeSample> {
  readonly kind: SourceKind = 'gaze';
  readonly mode: SourceMode = 'simulated';
  readonly label = 'test-gaze';
  async connect(): Promise<void> {
    this.setStatus('streaming');
  }
  emit(s: GazeSample): void {
    this.push(s);
  }
}

function makeHub() {
  const recorder = new SessionRecorder();
  const bus = new ExperienceBus();
  const hub = new SensorHub(recorder, bus);
  const src = new FeedSource();
  hub.attachBio(src);
  hub.setWatchSettle(true);
  return { hub, src, bus, recorder };
}

const TICK = 40; // 25Hz

/** 페르소나의 실제 생리 엔진을 durationSec만큼 돌려 허브에 흘린다 */
function runEngine(
  personaId: Parameters<typeof getPersona>[0],
  durationSec: number,
  opts: { pacing?: number | null; drift?: (t: number) => number } = {},
) {
  const { hub, src } = makeHub();
  const engine = new PhysiologyEngine(getPersona(personaId), 4242);
  if (opts.pacing !== undefined) engine.setBreathPacing(opts.pacing);
  for (let t = 0; t <= durationSec * 1000; t += TICK) {
    const s = engine.sample(t);
    const bump = opts.drift?.(t) ?? 0;
    src.feed({ t, hr: s.hr + bump, rr: s.rr, gsr: s.gsr + bump * 0.05 });
  }
  return hub.current();
}

describe('안정 수렴 판정', () => {
  /**
   * 이 테스트가 없으면 조용히 뒤집힌 채로 남는다.
   * 호흡 가이드는 RSA(심박의 호흡성 진동)를 일부러 키운다. 원시 표준편차로 판정하면
   * 가이드를 잘 따라온 사람일수록 안정 판정을 못 받는다.
   */
  it('호흡 가이드를 따라가는 동안에도 안정 판정이 선다', () => {
    const m = runEngine('quiet-investigator', 60, { pacing: 0.25 });
    expect(m.settled).toBe(true);
    expect(m.settleTimeSec).not.toBeNull();
  });

  it('가이드가 없어도 조용한 페르소나는 안정된다', () => {
    expect(runEngine('quiet-investigator', 60, { pacing: null }).settled).toBe(true);
  });

  it('반응성이 높은 페르소나도 결국은 안정된다', () => {
    expect(runEngine('stage-leader', 90, { pacing: 0.25 }).settled).toBe(true);
  });

  it('심박이 계속 오르는 동안에는 안정 판정이 서지 않는다', () => {
    // 분당 12bpm씩 상승 — 아직 각성이 가라앉지 않은 상태
    const m = runEngine('quiet-investigator', 60, {
      pacing: 0.25,
      drift: (t) => (t / 60000) * 12,
    });
    expect(m.settled).toBe(false);
  });

  it('안정 판정은 최소 몇 초는 지나야 선다 (한 순간의 우연을 안정으로 보지 않는다)', () => {
    const m = runEngine('quiet-investigator', 60, { pacing: 0.25 });
    expect(m.settleTimeSec!).toBeGreaterThan(8);
  });

  it('watchSettle을 끄면 판정하지 않는다', () => {
    const { hub, src } = makeHub();
    hub.setWatchSettle(false);
    const engine = new PhysiologyEngine(getPersona('quiet-investigator'), 4242);
    for (let t = 0; t <= 60000; t += TICK) {
      const s = engine.sample(t);
      src.feed({ t, hr: s.hr, rr: s.rr, gsr: s.gsr });
    }
    expect(hub.current().settled).toBe(false);
  });
});

describe('실시간 지표', () => {
  it('심박·RMSSD·GSR이 생리적으로 그럴듯한 범위에 있다', () => {
    const m = runEngine('nature-artist', 40);
    expect(m.hr!).toBeGreaterThan(45);
    expect(m.hr!).toBeLessThan(140);
    expect(m.rmssd!).toBeGreaterThan(5);
    expect(m.rmssd!).toBeLessThan(200);
    expect(m.gsr!).toBeGreaterThan(0.5);
    expect(m.gsr!).toBeLessThan(30);
  });
});

describe('시선 좌표 노출', () => {
  it('마지막 시선 표본이 metrics.gaze에 남는다 — 시선 커서가 이걸 읽는다', () => {
    const rec = new SessionRecorder();
    const hub = new SensorHub(rec, new ExperienceBus());
    const gaze = new ManualGazeSource();
    hub.attachGaze(gaze);

    expect(hub.current().gaze).toBeNull();

    gaze.emit({ t: 1000, x: 0.2, y: 0.8, confidence: 0.6 });
    expect(hub.current().gaze).toEqual({ x: 0.2, y: 0.8, c: 0.6, t: 1000 });

    gaze.emit({ t: 1040, x: 0.75, y: 0.3, confidence: 0.6 });
    expect(hub.current().gaze).toEqual({ x: 0.75, y: 0.3, c: 0.6, t: 1040 });

    // 기록은 그대로 쌓인다 — 커서용 값과 기록은 별개다
    expect(rec.gaze).toHaveLength(2);
  });
});
