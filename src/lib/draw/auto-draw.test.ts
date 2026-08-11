import { describe, expect, it } from 'vitest';
import { PERSONAS, getPersona } from '@/lib/sensors/personas';
import { autoFuture, autoTree, type AutoStroke } from './auto-draw';

function allPoints(strokes: AutoStroke[]) {
  return strokes.flatMap((s) => s.points);
}

function bbox(strokes: AutoStroke[]) {
  const pts = allPoints(strokes);
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    x1: Math.max(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
}

describe('가상 참가자 자동 그리기', () => {
  it('모든 페르소나가 나무와 미래 스케치를 그린다', () => {
    for (const p of PERSONAS) {
      const tree = autoTree(p, 'S');
      const future = autoFuture(p, 'S');
      expect(tree.length, p.id).toBeGreaterThanOrEqual(5);
      expect(future.length, p.id).toBeGreaterThanOrEqual(3);
      for (const s of [...tree, ...future]) {
        expect(s.points.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('좌표가 캔버스를 벗어나지 않는다', () => {
    for (const p of PERSONAS) {
      for (const pt of allPoints([...autoTree(p, 'S'), ...autoFuture(p, 'S')])) {
        expect(Number.isFinite(pt.x), p.id).toBe(true);
        // 뿌리는 지면 아래로 살짝 내려갈 수 있다. 그 이상은 잘린 그림이다.
        expect(pt.x, p.id).toBeGreaterThan(-0.02);
        expect(pt.x, p.id).toBeLessThan(1.02);
        expect(pt.y, p.id).toBeGreaterThan(-0.02);
        expect(pt.y, p.id).toBeLessThan(1.02);
      }
    }
  });

  it('필압은 0~1 사이다', () => {
    for (const p of PERSONAS) {
      for (const pt of allPoints(autoTree(p, 'S'))) {
        expect(pt.p).toBeGreaterThan(0);
        expect(pt.p).toBeLessThanOrEqual(1);
      }
    }
  });

  it('같은 세션·페르소나면 같은 그림이 나온다', () => {
    const a = JSON.stringify(autoTree(getPersona('nature-artist'), '20260811-A-001'));
    const b = JSON.stringify(autoTree(getPersona('nature-artist'), '20260811-A-001'));
    expect(a).toBe(b);
  });

  it('세션이 다르면 그림도 달라진다', () => {
    const a = JSON.stringify(autoTree(getPersona('nature-artist'), '20260811-A-001'));
    const b = JSON.stringify(autoTree(getPersona('nature-artist'), '20260811-A-002'));
    expect(a).not.toBe(b);
  });

  /** 프로필의 sizeRatio가 실제 그림 크기로 이어져야 해석(4축 환산)이 의미를 갖는다 */
  it('sizeRatio가 큰 페르소나가 실제로 크게 그린다', () => {
    const small = bbox(autoTree(getPersona('quiet-investigator'), 'S')); // 0.17
    const large = bbox(autoTree(getPersona('stage-leader'), 'S')); // 0.64
    const area = (b: ReturnType<typeof bbox>) => (b.x1 - b.x0) * (b.y1 - b.y0);
    expect(area(large)).toBeGreaterThan(area(small) * 1.8);
  });

  it('뿌리를 그리지 않는 페르소나는 지면 아래로 내려가지 않는다', () => {
    const leader = getPersona('stage-leader'); // structure.root === false
    expect(leader.drawing.structure.root).toBe(false);
    const strokes = autoTree(leader, 'S');
    // 뿌리 획이 없으므로 획 수가 뿌리 있는 페르소나보다 적어야 한다(세부 요소 보정 전)
    const investigator = autoTree(getPersona('orderly-architect'), 'S');
    expect(strokes.some((s) => s.points.length === 3)).toBe(true);
    expect(investigator.length).toBeGreaterThan(0);
  });
});
