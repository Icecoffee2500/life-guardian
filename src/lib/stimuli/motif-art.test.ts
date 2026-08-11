import { describe, expect, it } from 'vitest';
import { MOTIF_SPEC, MOTIF_VIEWBOX, motifStrokes } from './motif-art';
import { STIMULUS_PAIRS } from './pairs';
import type { StimulusMotif } from './pairs';

const ALL = Object.keys(MOTIF_SPEC) as StimulusMotif[];

/** 한 플레이트가 눈에 실어 나르는 시각적 무게의 근사 — 잉크의 총량 */
function weight(motif: StimulusMotif): number {
  return motifStrokes(motif).reduce((sum, s) => sum + s.alpha * s.width, 0);
}

function coords(d: string): number[] {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

describe('모티프 생성 아트', () => {
  it('모든 모티프가 그릴 것을 내놓는다', () => {
    for (const m of ALL) {
      const strokes = motifStrokes(m);
      expect(strokes.length, m).toBeGreaterThanOrEqual(5);
      for (const s of strokes) {
        expect(s.d.length, m).toBeGreaterThan(3);
        expect(s.alpha).toBeGreaterThan(0);
        expect(s.alpha).toBeLessThanOrEqual(1);
        expect(s.width).toBeGreaterThan(0);
      }
    }
  });

  it('같은 모티프는 항상 같은 그림이다', () => {
    const a = motifStrokes('mountain').map((s) => s.d).join('|');
    const b = motifStrokes('mountain').map((s) => s.d).join('|');
    expect(a).toBe(b);
  });

  it('모티프마다 서로 다른 그림이다', () => {
    const seen = new Set(ALL.map((m) => motifStrokes(m).map((s) => s.d).join('|')));
    expect(seen.size).toBe(ALL.length);
  });

  it('좌표가 뷰박스를 크게 벗어나지 않는다', () => {
    for (const m of ALL) {
      for (const s of motifStrokes(m)) {
        for (const v of coords(s.d)) {
          expect(Number.isFinite(v), m).toBe(true);
          expect(Math.abs(v), `${m}: ${s.d}`).toBeLessThan(MOTIF_VIEWBOX.w * 2);
        }
      }
    }
  });

  /**
   * 이 테스트가 이 파일의 존재 이유다.
   * 한 쌍의 두 장 중 하나가 눈에 띄게 화려하면, 시선이 그쪽으로 쏠린 이유가
   * 그 사람의 성향이 아니라 그림의 밀도가 되어버린다.
   */
  it('한 쌍의 두 자극이 비슷한 시각적 무게를 가진다', () => {
    for (const p of STIMULUS_PAIRS) {
      const wa = weight(p.a.motif);
      const wb = weight(p.b.motif);
      const ratio = Math.max(wa, wb) / Math.min(wa, wb);
      expect(ratio, `쌍 ${p.id} (${p.a.motif} vs ${p.b.motif}): ${wa.toFixed(1)} / ${wb.toFixed(1)}`)
        .toBeLessThan(1.45);
    }
  });

  it('전체 모티프의 무게가 한 자릿수 배율 안에 모인다', () => {
    const ws = ALL.map(weight);
    expect(Math.max(...ws) / Math.min(...ws)).toBeLessThan(1.6);
  });
});
