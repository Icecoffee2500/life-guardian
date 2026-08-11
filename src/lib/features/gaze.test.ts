import { describe, expect, it } from 'vitest';
import type { GazeTrial } from '@/lib/session/recorder';
import type { TimePoint } from './signal';
import { AROUSAL_WEIGHT, buildGazeBlock, foldAxes, scoreTrial, scoreTrials, topRiasec } from './gaze';

/**
 * 시선 표본을 만든다.
 * @param xs 각 구간의 x 좌표 — 앞에서부터 시간 순으로 균등 배치된다
 */
function trial(
  pairId: number,
  flipped: boolean,
  xs: number[],
  opts: { onset?: number; durMs?: number; c?: number } = {},
): GazeTrial {
  const onset = opts.onset ?? 0;
  const dur = opts.durMs ?? 6000;
  const samples = xs.map((x, i) => ({
    t: onset + (dur * i) / Math.max(1, xs.length - 1),
    x,
    y: 0.5,
    c: opts.c ?? 0.9,
  }));
  return { pairId, flipped, onset, offset: onset + dur, samples };
}

/** 평탄한 GSR — 각성 가중이 걸리지 않게 */
function flatGsr(untilMs = 200000): TimePoint[] {
  const out: TimePoint[] = [];
  for (let t = 0; t <= untilMs; t += 40) out.push({ t, v: 5 });
  return out;
}

describe('시행 점수 (0.4 × 첫 응시 + 0.6 × 체류 비율)', () => {
  it('내내 A쪽만 봤으면 +1에 가깝다', () => {
    const s = scoreTrial(trial(1, false, Array(60).fill(0.2)));
    expect(s.firstOnA).toBe(true);
    expect(s.dwellA).toBe(1);
    expect(s.score).toBeCloseTo(1, 5);
  });

  it('내내 B쪽만 봤으면 -1에 가깝다', () => {
    const s = scoreTrial(trial(1, false, Array(60).fill(0.8)));
    expect(s.score).toBeCloseTo(-1, 5);
  });

  it('좌우가 뒤집히면 같은 좌표가 반대 의미가 된다', () => {
    const left = scoreTrial(trial(1, false, Array(60).fill(0.2)));
    const right = scoreTrial(trial(1, true, Array(60).fill(0.2)));
    expect(left.score).toBeCloseTo(-(right.score ?? 0), 5);
  });

  it('첫 응시와 체류가 엇갈리면 체류가 이긴다 (가중치 0.6 대 0.4)', () => {
    // 처음 0.5초는 A(0.2), 이후는 계속 B(0.8)
    const xs = [...Array(6).fill(0.2), ...Array(54).fill(0.8)];
    const s = scoreTrial(trial(1, false, xs));
    expect(s.firstOnA).toBe(true);
    expect(s.score!).toBeLessThan(0);
    // 0.4×(+1) + 0.6×(체류 A비율 2×0.1-1 ≒ -0.8) ≒ -0.08
    expect(s.score!).toBeGreaterThan(-0.4);
  });

  it('반반 보면 0이다 — 첫 응시도 한쪽으로 기울지 않았다면 판정하지 않는다', () => {
    const xs = Array.from({ length: 60 }, (_, i) => (i % 2 ? 0.2 : 0.8));
    const s = scoreTrial(trial(1, false, xs));
    expect(s.firstOnA).toBeNull();
    expect(s.dwellA).toBeCloseTo(0.5, 5);
    expect(s.score).toBeCloseTo(0, 5);
  });

  it('체류는 반반이어도 먼저 본 쪽이 뚜렷하면 그만큼만 기운다', () => {
    // 앞 0.5초는 확실히 A, 이후 좌우 반반
    const xs = [...Array(6).fill(0.2), ...Array(54).fill(0).map((_, i) => (i % 2 ? 0.2 : 0.8))];
    const s = scoreTrial(trial(1, false, xs));
    expect(s.firstOnA).toBe(true);
    // 0.4×(+1) + 0.6×(체류가 A쪽으로 아주 조금)
    expect(s.score!).toBeGreaterThan(0.35);
    expect(s.score!).toBeLessThan(0.55);
  });

  it('중앙만 보고 있었으면 판정하지 않는다', () => {
    const s = scoreTrial(trial(1, false, Array(60).fill(0.5)));
    expect(s.score).toBeNull();
    expect(s.dwellA).toBeNull();
  });

  it('신뢰도가 낮은 표본은 버린다', () => {
    const s = scoreTrial(trial(1, false, Array(60).fill(0.2), { c: 0.1 }));
    expect(s.score).toBeNull();
  });

  it('더 오래 본 쪽의 라벨을 기록한다', () => {
    const s = scoreTrial(trial(1, false, Array(60).fill(0.2)));
    expect(s.chosenLabel).toBe('공구를 다루는 정비 작업장');
    const t = scoreTrial(trial(1, false, Array(60).fill(0.8)));
    expect(t.chosenLabel).toBe('아이를 돌보는 교사');
  });
});

describe('각성 가중', () => {
  it('SCR이 큰 시행은 ×1.3 가중된다', () => {
    // 세 시행 모두 같은 시선 패턴(A 70% / B 30%). 첫 번째에서만 SCR이 크게 뜬다.
    const xs = Array.from({ length: 60 }, (_, i) => (i % 10 < 7 ? 0.2 : 0.8));
    const trials = [
      trial(1, false, xs, { onset: 0, durMs: 6000 }),
      trial(2, false, xs, { onset: 10000, durMs: 6000 }),
      trial(3, false, xs, { onset: 20000, durMs: 6000 }),
    ];
    const gsr: TimePoint[] = [];
    for (let t = 0; t <= 30000; t += 40) {
      // 첫 시행 직후에만 큰 상승
      const bump = t > 1500 && t < 5000 ? 1.8 : 0;
      gsr.push({ t, v: 5 + bump });
    }
    const scores = scoreTrials(trials, gsr);
    expect(scores[0].weighted).toBe(true);
    expect(scores[1].weighted).toBe(false);
    // 같은 좌표인데 각성이 동반된 쪽 점수가 더 크다
    expect(Math.abs(scores[0].score!)).toBeGreaterThan(Math.abs(scores[1].score!));
    expect(Math.abs(scores[0].score!)).toBeCloseTo(
      Math.min(1, Math.abs(scores[1].score!) * AROUSAL_WEIGHT),
      5,
    );
  });

  it('GSR이 평탄하면 아무 시행도 가중되지 않는다', () => {
    const trials = [0, 10000, 20000].map((onset, i) =>
      trial(i + 1, false, Array(60).fill(0.3), { onset }),
    );
    expect(scoreTrials(trials, flatGsr()).every((s) => !s.weighted)).toBe(true);
  });
});

describe('축 접기', () => {
  it('R↔S 쌍에서 A(정비 작업장)를 보면 R이 오르고 S가 내린다', () => {
    const scores = scoreTrials([trial(1, false, Array(60).fill(0.2))], flatGsr());
    const { riasec } = foldAxes(scores);
    expect(riasec!.R).toBeGreaterThan(0.8);
    expect(riasec!.S).toBeLessThan(-0.8);
    // 다루지 않은 축은 0
    expect(riasec!.A).toBe(0);
  });

  it('positive가 b쪽인 축은 부호가 뒤집힌다', () => {
    // 12번: 어수선한 책상(a) ↔ 정돈된 책상(b), 무질서_회피의 positive는 b
    const scores = scoreTrials([trial(12, false, Array(60).fill(0.8))], flatGsr());
    const { traits } = foldAxes(scores);
    // B(정돈된 책상)를 봤으므로 무질서 회피가 높다
    expect(traits!.무질서_회피).toBeGreaterThan(0.8);
  });

  it('같은 축의 반복 측정은 평균된다', () => {
    // 1번과 4번 모두 R↔S. 하나는 A, 하나는 B를 보면 상쇄된다
    const scores = scoreTrials(
      [
        trial(1, false, Array(60).fill(0.2), { onset: 0 }),
        trial(4, false, Array(60).fill(0.8), { onset: 10000 }),
      ],
      flatGsr(),
    );
    const { riasec } = foldAxes(scores);
    expect(Math.abs(riasec!.R)).toBeLessThan(0.05);
  });

  it('판정 가능한 시행이 없으면 축이 통째로 null이다', () => {
    const scores = scoreTrials([trial(1, false, Array(60).fill(0.5))], flatGsr());
    const { riasec, traits } = foldAxes(scores);
    expect(riasec).toBeNull();
    expect(traits).toBeNull();
  });
});

describe('상위 유형', () => {
  it('가장 높은 축을 고른다', () => {
    expect(topRiasec({ R: -0.2, I: 0.7, A: 0.5, S: -0.4, E: -0.6, C: 0.1 })).toBe('I');
  });

  it('전부 0에 가까우면 유형을 말하지 않는다', () => {
    expect(topRiasec({ R: 0, I: 0.01, A: 0, S: 0, E: 0, C: 0 })).toBeNull();
    expect(topRiasec(null)).toBeNull();
  });
});

describe('gaze 블록', () => {
  it('시행이 없으면 quality가 missing이고 축은 null이다', () => {
    const { block } = buildGazeBlock([], flatGsr());
    expect(block.quality).toBe('missing');
    expect(block.riasec).toBeNull();
    expect(block.high_arousal_pairs).toEqual([]);
  });

  it('프록시 시선은 degraded로 표시된다', () => {
    const { block } = buildGazeBlock(
      [trial(1, false, Array(60).fill(0.2))],
      flatGsr(),
      { degraded: true },
    );
    expect(block.quality).toBe('degraded');
    // degraded여도 값 자체는 넘긴다. 판단은 프롬프트가 한다.
    expect(block.riasec).not.toBeNull();
  });

  it('판정 불가 시행이 많으면 degraded로 내려간다', () => {
    const trials = [
      trial(1, false, Array(60).fill(0.2), { onset: 0 }),
      trial(2, false, Array(60).fill(0.5), { onset: 10000 }),
      trial(3, false, Array(60).fill(0.5), { onset: 20000 }),
    ];
    expect(buildGazeBlock(trials, flatGsr()).block.quality).toBe('degraded');
  });

  it('각성이 큰 쌍만 high_arousal_pairs에 오른다', () => {
    const trials = [0, 10000, 20000].map((onset, i) =>
      trial(i + 1, false, Array(60).fill(0.2), { onset }),
    );
    const gsr: TimePoint[] = [];
    for (let t = 0; t <= 30000; t += 40) {
      gsr.push({ t, v: 5 + (t > 11500 && t < 15000 ? 2.2 : 0) });
    }
    const { block } = buildGazeBlock(trials, gsr);
    expect(block.high_arousal_pairs.length).toBe(1);
    expect(block.high_arousal_pairs[0].pair).toBe(2);
    expect(block.high_arousal_pairs[0].arousal_z).toBeGreaterThan(1);
  });
});
