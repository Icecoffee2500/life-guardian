import { describe, expect, it } from 'vitest';
import { PhysiologyEngine, scrShape } from './physiology';
import { PERSONAS, getPersona } from './personas';
import { mean, rmssd, sd } from '@/lib/features/signal';

/** 엔진을 dtMs 간격으로 durMs만큼 돌린다 */
function run(engine: PhysiologyEngine, durMs: number, dtMs = 40) {
  const hr: number[] = [];
  const gsr: number[] = [];
  const rr: number[] = [];
  for (let t = 0; t <= durMs; t += dtMs) {
    const s = engine.sample(t);
    hr.push(s.hr);
    gsr.push(s.gsr);
    rr.push(...s.rr);
  }
  return { hr, gsr, rr };
}

describe('scrShape', () => {
  it('자극 이전에는 0', () => {
    expect(scrShape(-1, 0.75, 5)).toBe(0);
    expect(scrShape(0, 0.75, 5)).toBe(0);
  });

  it('최대값이 1로 정규화된다', () => {
    let peak = 0;
    for (let dt = 0; dt < 30; dt += 0.01) peak = Math.max(peak, scrShape(dt, 0.75, 5));
    expect(peak).toBeCloseTo(1, 3);
  });

  it('피크는 1~3초 사이에 온다 (생리학적 SCR)', () => {
    let peakT = 0;
    let peak = 0;
    for (let dt = 0; dt < 30; dt += 0.01) {
      const v = scrShape(dt, 0.75, 5);
      if (v > peak) {
        peak = v;
        peakT = dt;
      }
    }
    expect(peakT).toBeGreaterThan(1);
    expect(peakT).toBeLessThan(3);
  });

  it('충분히 지나면 0으로 회복한다', () => {
    expect(scrShape(60, 0.75, 5)).toBeLessThan(0.001);
  });
});

describe('PhysiologyEngine — 생리학적 타당성', () => {
  it('심박이 페르소나 기저값 근처로 수렴한다', () => {
    const p = getPersona('quiet-investigator');
    const e = new PhysiologyEngine(p, 7);
    const { hr } = run(e, 240000);
    // 초반 입장 각성을 제외한 후반부
    const late = hr.slice(Math.floor(hr.length * 0.6));
    expect(mean(late)).toBeGreaterThan(p.physiology.hrBase - 4);
    expect(mean(late)).toBeLessThan(p.physiology.hrBase + 4);
  });

  it('심박이 생리학적 범위를 벗어나지 않는다', () => {
    for (const p of PERSONAS) {
      const e = new PhysiologyEngine(p, 3);
      const { hr } = run(e, 120000);
      expect(Math.min(...hr)).toBeGreaterThan(45);
      expect(Math.max(...hr)).toBeLessThan(140);
    }
  });

  it('호흡성 동성부정맥으로 심박이 실제로 진동한다', () => {
    const e = new PhysiologyEngine(getPersona('quiet-investigator'), 11);
    const { hr } = run(e, 120000);
    expect(sd(hr.slice(600))).toBeGreaterThan(1.0);
  });

  it('RR 간격에서 계산한 RMSSD가 사람 범위(10~120ms)에 들어온다', () => {
    const e = new PhysiologyEngine(getPersona('nature-artist'), 5);
    const { rr } = run(e, 180000);
    expect(rr.length).toBeGreaterThan(100);
    const v = rmssd(rr);
    expect(v).toBeGreaterThan(10);
    expect(v).toBeLessThan(120);
  });

  it('HRV가 높은 페르소나가 실제로 더 높은 RMSSD를 낸다', () => {
    const calm = new PhysiologyEngine(getPersona('quiet-investigator'), 5);
    const tense = new PhysiologyEngine(getPersona('stage-leader'), 5);
    expect(rmssd(run(calm, 180000).rr)).toBeGreaterThan(rmssd(run(tense, 180000).rr));
  });

  it('기저 심박은 페르소나 순서를 지킨다', () => {
    const quiet = new PhysiologyEngine(getPersona('quiet-investigator'), 2);
    const leader = new PhysiologyEngine(getPersona('stage-leader'), 2);
    const a = mean(run(quiet, 200000).hr.slice(-600));
    const b = mean(run(leader, 200000).hr.slice(-600));
    expect(b).toBeGreaterThan(a + 5);
  });
});

describe('PhysiologyEngine — 이벤트 반응', () => {
  it('자극을 주면 GSR이 상승하고 회복한다', () => {
    const e = new PhysiologyEngine(getPersona('stage-leader'), 13);
    // 60초까지 워밍업
    for (let t = 0; t <= 60000; t += 40) e.sample(t);
    const before = e.sample(60000).gsr;
    e.trigger(60000, 0.9);

    let peak = -Infinity;
    for (let t = 60040; t <= 66000; t += 40) peak = Math.max(peak, e.sample(t).gsr);
    expect(peak).toBeGreaterThan(before + 0.3);

    let after = 0;
    for (let t = 66040; t <= 110000; t += 40) after = e.sample(t).gsr;
    expect(after).toBeLessThan(peak - 0.25);
  });

  it('자극이 없으면 GSR이 평탄하게 유지된다', () => {
    const e = new PhysiologyEngine(getPersona('orderly-architect'), 21);
    const { gsr } = run(e, 120000);
    const late = gsr.slice(1200);
    expect(sd(late)).toBeLessThan(0.15);
  });

  it('반응성이 큰 페르소나가 더 큰 SCR을 만든다', () => {
    const measure = (id: Parameters<typeof getPersona>[0]) => {
      const e = new PhysiologyEngine(getPersona(id), 31);
      for (let t = 0; t <= 60000; t += 40) e.sample(t);
      const base = e.sample(60000).gsr;
      e.trigger(60000, 1);
      let peak = -Infinity;
      for (let t = 60040; t <= 70000; t += 40) peak = Math.max(peak, e.sample(t).gsr);
      return peak - base;
    };
    expect(measure('stage-leader')).toBeGreaterThan(measure('quiet-investigator'));
  });

  it('각성 시 심박도 함께 오른다 (두 신호가 같은 상태를 공유)', () => {
    const e = new PhysiologyEngine(getPersona('stage-leader'), 17);
    for (let t = 0; t <= 90000; t += 40) e.sample(t);
    const before = e.sample(90000).hr;
    e.trigger(90000, 1);
    let peak = -Infinity;
    for (let t = 90040; t <= 100000; t += 40) peak = Math.max(peak, e.sample(t).hr);
    expect(peak).toBeGreaterThan(before + 3);
  });

  it('같은 시드는 같은 신호를 재현한다', () => {
    const a = run(new PhysiologyEngine(getPersona('nature-artist'), 99), 30000);
    const b = run(new PhysiologyEngine(getPersona('nature-artist'), 99), 30000);
    expect(a.hr).toEqual(b.hr);
    expect(a.gsr).toEqual(b.gsr);
  });

  it('호흡 페이싱을 켜면 RSA 진폭이 커진다', () => {
    const plain = new PhysiologyEngine(getPersona('quiet-investigator'), 41);
    const paced = new PhysiologyEngine(getPersona('quiet-investigator'), 41);
    paced.setBreathPacing(0.25);
    const a = sd(run(plain, 90000).hr.slice(750));
    const b = sd(run(paced, 90000).hr.slice(750));
    expect(b).toBeGreaterThan(a);
  });
});
