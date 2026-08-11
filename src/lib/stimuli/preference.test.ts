import { describe, expect, it } from 'vitest';
import { PERSONAS, getPersona } from '@/lib/sensors/personas';
import { STIMULUS_PAIRS } from './pairs';
import { affinityForRight, preferenceForA } from './preference';

describe('자극 선호도', () => {
  it('항상 -1~+1 범위에 있다', () => {
    for (const p of PERSONAS) {
      for (const pair of STIMULUS_PAIRS) {
        const v = preferenceForA(p, pair);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('탐구자는 실험실(I)을 무대(E)보다 선호한다', () => {
    const pair = STIMULUS_PAIRS.find((p) => p.id === 2)!; // I ↔ E
    expect(preferenceForA(getPersona('quiet-investigator'), pair)).toBeGreaterThan(0.4);
  });

  it('리더는 같은 쌍에서 반대로 기운다', () => {
    const pair = STIMULUS_PAIRS.find((p) => p.id === 2)!;
    expect(preferenceForA(getPersona('stage-leader'), pair)).toBeLessThan(-0.4);
  });

  it('내향 페르소나는 군중(A)보다 조용한 공간(B)을 본다', () => {
    const pair = STIMULUS_PAIRS.find((p) => p.id === 8)!; // 사회적 에너지, positive: a
    expect(preferenceForA(getPersona('quiet-investigator'), pair)).toBeLessThan(0);
    expect(preferenceForA(getPersona('stage-leader'), pair)).toBeGreaterThan(0);
  });

  it('무질서 회피 축은 positive가 b쪽이라 부호가 뒤집힌다', () => {
    const pair = STIMULUS_PAIRS.find((p) => p.id === 12)!; // 어수선한 책상(a) ↔ 정돈된 책상(b)
    // 정돈된 설계자는 무질서_회피가 +0.9 → 정돈된 쪽(B)을 본다 → prefA는 음수
    expect(preferenceForA(getPersona('orderly-architect'), pair)).toBeLessThan(-0.5);
  });

  it('좌우가 뒤집히면 화면 기준 선호도 뒤집힌다', () => {
    expect(affinityForRight(0.8, false)).toBeCloseTo(-0.8);
    expect(affinityForRight(0.8, true)).toBeCloseTo(0.8);
  });

  it('페르소나마다 선호 패턴이 실제로 다르다', () => {
    const sig = (id: Parameters<typeof getPersona>[0]) =>
      STIMULUS_PAIRS.map((p) => Math.sign(preferenceForA(getPersona(id), p))).join('');
    const sigs = new Set(PERSONAS.map((p) => sig(p.id)));
    expect(sigs.size).toBe(PERSONAS.length);
  });
});
