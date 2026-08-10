import { describe, expect, it } from 'vitest';
import {
  clampUnit,
  mean,
  median,
  movingAverage,
  rmssd,
  round,
  scrAmplitude,
  sd,
  slice,
  slope,
  zscore,
} from './signal';

describe('기초 통계', () => {
  it('mean/sd/median', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(sd([2, 2, 2])).toBe(0);
    expect(sd([1, 3])).toBeCloseTo(1.4142, 3);
  });

  it('빈 배열은 NaN', () => {
    expect(Number.isNaN(mean([]))).toBe(true);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe('rmssd', () => {
  it('간격이 일정하면 0', () => {
    expect(rmssd([800, 800, 800, 800])).toBe(0);
  });

  it('알려진 값과 일치한다', () => {
    // 차이: +40, -40, +40 → 제곱평균 1600 → sqrt = 40
    expect(rmssd([800, 840, 800, 840])).toBeCloseTo(40, 6);
  });

  it('300ms를 넘는 비현실적 점프는 아티팩트로 제외한다', () => {
    // 마지막 점프(+1000)를 제외하면 차이는 +40 하나뿐
    expect(rmssd([800, 840, 1840])).toBeCloseTo(40, 6);
  });

  it('샘플이 2개 미만이면 NaN', () => {
    expect(Number.isNaN(rmssd([800]))).toBe(true);
  });
});

describe('slope', () => {
  it('완전한 직선의 기울기를 복원한다', () => {
    const pts = [0, 1, 2, 3, 4].map((i) => ({ t: i * 1000, v: 5 + 0.002 * (i * 1000) }));
    expect(slope(pts)).toBeCloseTo(0.002, 9);
  });

  it('평탄한 신호의 기울기는 0', () => {
    expect(slope([{ t: 0, v: 3 }, { t: 1000, v: 3 }])).toBe(0);
  });
});

describe('slice', () => {
  const xs = [0, 1, 2, 3, 4, 5].map((t) => ({ t: t * 100, v: t }));
  it('[t0, t1) 반열린 구간', () => {
    expect(slice(xs, 100, 400).map((x) => x.v)).toEqual([1, 2, 3]);
  });
  it('범위 밖이면 빈 배열', () => {
    expect(slice(xs, 9000, 9999)).toEqual([]);
  });
});

describe('scrAmplitude', () => {
  it('마커 후 1~4초 창의 상승폭을 잡아낸다', () => {
    const gsr: { t: number; v: number }[] = [];
    for (let t = 0; t <= 10000; t += 100) {
      // 5초 마커 이후 2초 지점에서 +1.5µS 피크
      const bump = t > 5000 ? 1.5 * Math.exp(-(((t - 7000) / 1200) ** 2)) : 0;
      gsr.push({ t, v: 6 + bump });
    }
    expect(scrAmplitude(gsr, 5000)).toBeCloseTo(1.5, 1);
  });

  it('창에 데이터가 없으면 NaN', () => {
    expect(Number.isNaN(scrAmplitude([{ t: 0, v: 1 }], 100000))).toBe(true);
  });
});

describe('보조 함수', () => {
  it('zscore', () => {
    expect(zscore(12, 10, 2)).toBe(1);
    expect(zscore(12, 10, 0)).toBe(0);
  });
  it('clampUnit은 NaN을 0으로', () => {
    expect(clampUnit(NaN)).toBe(0);
    expect(clampUnit(3)).toBe(1);
    expect(clampUnit(-3)).toBe(-1);
  });
  it('round', () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(Infinity)).toBe(0);
  });
  it('movingAverage는 길이를 보존한다', () => {
    const xs = [0, 1, 2, 3].map((t) => ({ t: t * 100, v: t }));
    const out = movingAverage(xs, 200);
    expect(out).toHaveLength(4);
    expect(out[0].v).toBe(0);
  });
});
