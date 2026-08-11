import { describe, expect, it } from 'vitest';
import {
  SCENES,
  SCENE_ORDER,
  dialogueDurationSec,
  drawDurationSec,
  gazeDurationSec,
  makeSessionId,
  nextScene,
  pairsFor,
  prevScene,
  questionsFor,
  totalDurationSec,
} from './scenes';
import { STIMULUS_PAIRS } from '@/lib/stimuli/pairs';
import { DIALOGUE_QUESTIONS } from '@/lib/dialogue/script';

describe('씬 정의', () => {
  it('S0~S8 아홉 개가 순서대로 있다', () => {
    expect(SCENE_ORDER).toEqual(['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']);
  });

  it('기획안 Phase 1~4에 모두 대응된다', () => {
    expect(new Set(SCENES.map((s) => s.phase))).toEqual(new Set([1, 2, 3, 4]));
  });

  it('전이는 양끝에서 멈춘다', () => {
    expect(nextScene('S0')).toBe('S1');
    expect(nextScene('S8')).toBeNull();
    expect(prevScene('S0')).toBeNull();
    expect(prevScene('S4')).toBe('S3');
  });
});

describe('자극·문항 구성', () => {
  it('전체 모드는 12쌍, 압축 모드는 6쌍', () => {
    expect(pairsFor('full')).toHaveLength(12);
    expect(pairsFor('compact')).toHaveLength(6);
  });

  it('부록 A의 12쌍이 그대로 실려 있다', () => {
    expect(STIMULUS_PAIRS.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(STIMULUS_PAIRS.filter((p) => p.group === 1)).toHaveLength(6);
    expect(STIMULUS_PAIRS.filter((p) => p.group === 2)).toHaveLength(6);
  });

  it('압축 모드는 부록 B 규칙대로 문항 3을 먼저 생략한다', () => {
    const ids = questionsFor('compact').map((q) => q.q);
    expect(ids).not.toContain(3);
    expect(ids).toContain(0);
    expect(ids).toContain(4);
  });

  it('대화 문항은 5개(0~4)', () => {
    expect(DIALOGUE_QUESTIONS.map((q) => q.q)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('타이밍', () => {
  it('시선 세션은 부록 A대로 쌍당 8초 (노출 6 + 응시점 2) + 선행 응시점 2초', () => {
    expect(gazeDurationSec('full')).toBe(2 + 12 * 8);
    expect(gazeDurationSec('compact')).toBe(1 + 6 * 4);
  });

  it('그림 세션은 나무 90초 + 스케치 30초', () => {
    expect(drawDurationSec('full')).toBe(120);
  });

  it('대화 세션은 문항당 30초 × 5문항', () => {
    expect(dialogueDurationSec('full')).toBe(5 * 30);
  });

  it('전체 모드는 10분 내외, 압축 모드는 3분 내외', () => {
    const full = totalDurationSec('full');
    expect(full).toBeGreaterThan(9 * 60);
    expect(full).toBeLessThan(11 * 60);

    const compact = totalDurationSec('compact');
    expect(compact).toBeGreaterThan(2.4 * 60);
    expect(compact).toBeLessThan(3.5 * 60);
  });

  it('압축 모드가 모든 타이머 씬에서 더 짧다', () => {
    for (const s of SCENES) {
      const f = s.durationSec('full');
      const c = s.durationSec('compact');
      if (f === null || c === null) continue;
      expect(c).toBeLessThan(f);
    }
  });
});

describe('세션 ID', () => {
  it('부록 C 형식 YYYYMMDD-A-NNN', () => {
    expect(makeSessionId(14)).toMatch(/^\d{8}-A-\d{3}$/);
    expect(makeSessionId(14).endsWith('-014')).toBe(true);
  });
});
