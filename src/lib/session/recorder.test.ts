import { describe, expect, it } from 'vitest';
import { SessionRecorder, type DrawTask } from './recorder';
import { buildDrawingBlock } from '@/lib/features/drawing';
import type { TimePoint } from '@/lib/features/signal';

function task(id: 'tree' | 'future', strokeCount: number): DrawTask {
  return {
    id,
    startedAt: 0,
    endedAt: 90000,
    width: 800,
    height: 600,
    strokes: Array.from({ length: strokeCount }, (_, i) => ({
      points: [
        { t: i * 100, x: 0.4, y: 0.4, p: 0.6 },
        { t: i * 100 + 50, x: 0.6, y: 0.7, p: 0.6 },
      ],
    })),
    undos: 0,
    pressureSource: 'pen',
  };
}

const flatGsr: TimePoint[] = Array.from({ length: 3000 }, (_, i) => ({ t: i * 40, v: 5 }));

describe('그림 과제 기록', () => {
  /**
   * 실제로 났던 버그의 회귀 테스트.
   *
   * 씬은 여러 번 마운트될 수 있다(StrictMode 이중 마운트, 진행자가 ←로 되돌아옴).
   * append로 쌓으면 획 없는 빈 기록이 맨 앞에 남고, 특징 추출의 find가 그걸 집어서
   * 자동 모드에서 그림이 멀쩡히 그려졌는데도 quality가 missing으로 나왔다.
   */
  it('같은 과제를 다시 기록하면 덮어쓴다', () => {
    const r = new SessionRecorder();
    r.putDrawTask(task('tree', 0));
    r.putDrawTask(task('tree', 5));
    expect(r.drawTasks).toHaveLength(1);
    expect(r.drawTasks[0].strokes).toHaveLength(5);
  });

  it('빈 기록이 이미 그려진 그림을 덮지 않는다', () => {
    const r = new SessionRecorder();
    r.putDrawTask(task('tree', 5));
    r.putDrawTask(task('tree', 0));
    expect(r.drawTasks[0].strokes).toHaveLength(5);
  });

  it('과제가 다르면 따로 쌓인다', () => {
    const r = new SessionRecorder();
    r.putDrawTask(task('tree', 3));
    r.putDrawTask(task('future', 2));
    expect(r.drawTasks.map((t) => t.id)).toEqual(['tree', 'future']);
  });

  it('빈 기록이 먼저 들어와도 특징 추출이 진짜 그림을 본다', () => {
    const r = new SessionRecorder();
    r.putDrawTask(task('tree', 0)); // 마운트 취소로 생긴 빈 기록
    r.putDrawTask(task('tree', 6)); // 실제 그림
    const { block } = buildDrawingBlock(r.drawTasks, flatGsr, null);
    expect(block.quality).not.toBe('missing');
    expect(block.observations).not.toBeNull();
  });

  it('정말 아무것도 안 그렸으면 결측이다 — 무응답을 지어내지 않는다', () => {
    const r = new SessionRecorder();
    r.putDrawTask(task('tree', 0));
    const { block } = buildDrawingBlock(r.drawTasks, flatGsr, null);
    expect(block.quality).toBe('missing');
  });

  it('clear()가 그림 기록도 비운다', () => {
    const r = new SessionRecorder();
    r.putDrawTask(task('tree', 3));
    r.clear();
    expect(r.drawTasks).toHaveLength(0);
  });
});
