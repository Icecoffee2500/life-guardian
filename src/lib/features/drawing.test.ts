import { describe, expect, it } from 'vitest';
import type { DrawTask } from '@/lib/session/recorder';
import { buildDrawingBlock, detailCount, drawingStats, positionLabel, toAxes } from './drawing';
import type { TimePoint } from './signal';

function box(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  p = 0.6,
  t0 = 0,
): { points: { t: number; x: number; y: number; p: number }[] } {
  return {
    points: [
      { t: t0, x: x0, y: y0, p },
      { t: t0 + 100, x: x1, y: y0, p },
      { t: t0 + 200, x: x1, y: y1, p },
      { t: t0 + 300, x: x0, y: y1, p },
    ],
  };
}

function task(p: Partial<DrawTask> = {}): DrawTask {
  return {
    id: p.id ?? 'tree',
    startedAt: p.startedAt ?? 0,
    endedAt: p.endedAt ?? 90000,
    width: p.width ?? 800,
    height: p.height ?? 600,
    strokes: p.strokes ?? [box(0.4, 0.4, 0.6, 0.7)],
    undos: p.undos ?? 0,
    pressureSource: p.pressureSource ?? 'pen',
  };
}

const flatGsr: TimePoint[] = Array.from({ length: 3000 }, (_, i) => ({ t: i * 40, v: 5 }));

describe('그림 통계', () => {
  it('바운딩 박스와 면적비를 구한다', () => {
    const s = drawingStats(task({ strokes: [box(0.2, 0.2, 0.8, 0.8)] }));
    expect(s.bbox).toEqual({ x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 });
    expect(s.areaRatio).toBeCloseTo(0.36, 2);
  });

  it('착수 지연은 첫 점의 시각이다', () => {
    const s = drawingStats(task({ startedAt: 1000, strokes: [box(0.4, 0.4, 0.5, 0.5, 0.6, 9000)] }));
    expect(s.onsetDelaySec).toBeCloseTo(8, 1);
  });

  it('빈 과제도 통계를 낸다 (무응답도 데이터다)', () => {
    const s = drawingStats(task({ strokes: [] }));
    expect(s.bbox).toBeNull();
    expect(s.areaRatio).toBe(0);
    expect(s.strokeCount).toBe(0);
  });
});

describe('위치 라벨', () => {
  it('사분면을 한국어로 옮긴다', () => {
    expect(positionLabel({ x: 0.5, y: 0.5 })).toBe('중앙');
    expect(positionLabel({ x: 0.2, y: 0.8 })).toBe('좌측 하단');
    expect(positionLabel({ x: 0.9, y: 0.2 })).toBe('우측 상단');
    expect(positionLabel({ x: 0.2, y: 0.5 })).toBe('좌측');
    expect(positionLabel(null)).toBe('없음');
  });
});

describe('세부 요소', () => {
  it('기본 구조(줄기·수관·지면)를 넘는 획만 센다', () => {
    expect(detailCount(3)).toBe(0);
    expect(detailCount(9)).toBe(6);
    expect(detailCount(1)).toBe(0);
  });
});

describe('4축 환산', () => {
  const structure = { root: true, trunk: true, crown: true };

  it('모든 축이 1~3 정수다', () => {
    const cases = [
      task({ strokes: [box(0.1, 0.1, 0.95, 0.95, 0.95)], undos: 9 }),
      task({ strokes: [box(0.48, 0.48, 0.52, 0.52, 0.1)], undos: 0 }),
      task({ strokes: [] }),
    ];
    for (const c of cases) {
      const axes = toAxes(drawingStats(c), structure);
      for (const v of Object.values(axes)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(3);
      }
    }
  });

  it('크게·진하게·세밀하게 그릴수록 표현욕구가 높다', () => {
    const big = toAxes(
      drawingStats(
        task({
          strokes: [box(0.05, 0.05, 0.95, 0.95, 0.9), ...Array(8).fill(box(0.4, 0.4, 0.5, 0.5, 0.9))],
        }),
      ),
      structure,
    );
    const small = toAxes(
      drawingStats(task({ strokes: [box(0.45, 0.45, 0.55, 0.55, 0.2)] })),
      structure,
    );
    expect(big.표현욕구).toBeGreaterThan(small.표현욕구);
  });

  it('수정이 잦고 착수가 늦을수록 완벽주의가 높다', () => {
    const fussy = toAxes(
      drawingStats(task({ undos: 8, strokes: [box(0.4, 0.4, 0.6, 0.6, 0.6, 20000)] })),
      structure,
    );
    const quick = toAxes(
      drawingStats(task({ undos: 0, strokes: [box(0.4, 0.4, 0.6, 0.6, 0.6, 500)] })),
      structure,
    );
    expect(fussy.완벽주의).toBeGreaterThan(quick.완벽주의);
  });

  it('구조 체크가 없으면 중간값으로 둔다 (진행자 미입력을 결함으로 읽지 않는다)', () => {
    const withNull = toAxes(drawingStats(task()), null);
    expect(withNull.안정지향).toBeGreaterThanOrEqual(1);
    expect(withNull.완벽주의).toBeGreaterThanOrEqual(1);
  });
});

describe('drawing 블록', () => {
  it('나무 과제가 없으면 quality가 missing이다', () => {
    const { block } = buildDrawingBlock([], flatGsr, null);
    expect(block.quality).toBe('missing');
    expect(block.axes).toBeNull();
    expect(block.observations).toBeNull();
  });

  it('획이 하나도 없어도 missing이다', () => {
    const { block } = buildDrawingBlock([task({ strokes: [] })], flatGsr, null);
    expect(block.quality).toBe('missing');
  });

  it('필압을 못 믿으면 degraded로 내려간다', () => {
    const { block } = buildDrawingBlock([task()], flatGsr, null, { pressureTrusted: false });
    expect(block.quality).toBe('degraded');
    // degraded여도 관측값은 넘긴다
    expect(block.observations).not.toBeNull();
  });

  it('관측 항목이 부록 C 스키마의 값 범위를 지킨다', () => {
    const { block } = buildDrawingBlock(
      [task({ strokes: [box(0.1, 0.1, 0.9, 0.9, 0.85)], undos: 3 })],
      flatGsr,
      { root: true, trunk: true, crown: false },
    );
    const o = block.observations!;
    expect(['소', '중', '대']).toContain(o.크기);
    expect(['약', '보통', '강']).toContain(o.필압);
    expect(o.수정횟수).toBe(3);
    expect(o.착수지연_sec).toBeGreaterThanOrEqual(0);
  });

  it('GSR이 평탄하면 각성 구간을 만들어내지 않는다', () => {
    const { block } = buildDrawingBlock([task()], flatGsr, null);
    expect(block.arousal_peaks).toEqual([]);
  });

  it('그리는 도중 GSR이 튀면 그 시점을 구간으로 남긴다', () => {
    const gsr: TimePoint[] = Array.from({ length: 3000 }, (_, i) => {
      const t = i * 40;
      return { t, v: 5 + (t > 70000 && t < 78000 ? 3 : 0) };
    });
    const { block } = buildDrawingBlock([task({ endedAt: 90000 })], gsr, null);
    expect(block.arousal_peaks).toContain('마무리할 때');
  });

  it('사람이 그린 그림에는 미래 스케치 서술을 지어내지 않는다', () => {
    const { block } = buildDrawingBlock([task()], flatGsr, null);
    expect(block.future_sketch).toBeNull();
  });
});
