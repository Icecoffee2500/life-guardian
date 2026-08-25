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

describe('실효 샘플레이트', () => {
  /**
   * 이 지표는 "신호가 오는가"가 아니라 "기대한 만큼 오는가"를 본다.
   * 실기기 연동에서 두 프로세스가 같은 시리얼 포트를 잡고 바이트를 나눠 가져
   * 25Hz가 12Hz로 반토막 났는데, 그동안 상태는 내내 '수신'이었다.
   */
  it('표본이 없으면 Hz를 만들어내지 않는다', () => {
    const hub = new SensorHub(new SessionRecorder(), new ExperienceBus());
    const src = new FeedSource();
    hub.attachBio(src);
    expect(hub.sources()[0].hz).toBeUndefined();

    // 한 개만으로는 간격을 알 수 없다
    src.feed({ t: 0, hr: 70 });
    expect(hub.sources()[0].hz).toBeUndefined();
  });

  it('도착 간격에서 Hz를 계산한다', async () => {
    const hub = new SensorHub(new SessionRecorder(), new ExperienceBus());
    const src = new FeedSource();
    hub.attachBio(src);

    // 벽시계 기준이므로 실제로 시간을 흘려보내며 넣는다
    for (let i = 0; i < 6; i++) {
      src.feed({ t: i * 20, hr: 70 });
      await new Promise((r) => setTimeout(r, 20));
    }

    const hz = hub.sources()[0].hz;
    expect(hz).toBeDefined();
    // 20ms 간격 ≈ 50Hz. 타이머 정확도가 낮으므로 범위로만 확인한다.
    expect(hz!).toBeGreaterThan(15);
    expect(hz!).toBeLessThan(90);
  });
});

describe('교체·결측 시 지표가 남지 않는다', () => {
  /**
   * 실기기 모드는 시뮬레이터를 먼저 붙였다가 교체한다. 교체 후에도 이전 값이
   * 남아 있으면 시뮬레이터가 만든 수치가 실측인 척한다.
   * Polar Verity Sense를 붙였을 때 HRV가 54에 멈춰 있던 것이 정확히 이것이었다.
   */
  it('소스를 교체하면 이전 소스의 지표를 물려주지 않는다', () => {
    const hub = new SensorHub(new SessionRecorder(), new ExperienceBus());
    const sim = new FeedSource();
    hub.attachBio(sim);

    // 시뮬레이터가 HR과 RR을 남긴다
    for (let i = 0; i < 12; i++) sim.feed({ t: i * 1000, hr: 70, rr: [850 + (i % 3) * 40] });
    expect(hub.current().hr).not.toBeNull();
    expect(hub.current().rmssd).not.toBeNull();

    // 실기기로 교체 — 아직 아무것도 안 보냈다
    const live = new FeedSource();
    hub.replaceBio('band', live);
    expect(hub.current().hr).toBeNull();
    expect(hub.current().rmssd).toBeNull();
  });

  it('RR 없이 HR만 오래 오면 HRV는 지워진다 — 멈춘 숫자는 없는 것보다 나쁘다', () => {
    const hub = new SensorHub(new SessionRecorder(), new ExperienceBus());
    const src = new FeedSource();
    hub.attachBio(src);

    for (let i = 0; i < 12; i++) src.feed({ t: i * 1000, hr: 70, rr: [850 + (i % 3) * 40] });
    const withRr = hub.current().rmssd;
    expect(withRr).not.toBeNull();

    // RR 없이 HR만 계속 (광학 밴드가 RR을 안 주는 경우)
    src.feed({ t: 12000, hr: 71 });
    expect(hub.current().rmssd).toBe(withRr); // 아직 유예 안에 있다

    src.feed({ t: 30000, hr: 71 }); // 10초를 훌쩍 넘김
    expect(hub.current().rmssd).toBeNull();
    // HR은 계속 살아 있어야 한다 — 지우는 건 HRV뿐이다
    expect(hub.current().hr).toBe(71);
  });
});
