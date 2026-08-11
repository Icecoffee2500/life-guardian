import type { DrawTask, DrawingStructureCheck } from '@/lib/session/recorder';
import { clamp, mean, round, slice, type TimePoint } from './signal';
import type { DrawingAxisKey, DrawingBlock, DrawingObservations } from './schema';

/**
 * 그림 세션 특징 추출.
 *
 * 기획안 5장의 정량 체크리스트를 그대로 코드화한다:
 *   크기 / 위치 / 필압·선 / 구조 / 세부 / 소요시간 → 3점 척도 → 4축 환산.
 *
 * 임상 채점이 아니다. 그림에서 나온 값은 "경향의 참고 자료"로만 쓰이며,
 * bio-receipt에 단정적으로 출력하지 않는다(기획안 5장 해석 원칙).
 */

/** 용지 대비 그림 면적: 소 20% 미만 / 대 60% 초과 */
export const SIZE_SMALL_MAX = 0.2;
export const SIZE_LARGE_MIN = 0.6;
/** 필압: 약 0.4 미만 / 강 0.7 초과 */
export const PRESSURE_WEAK_MAX = 0.4;
export const PRESSURE_STRONG_MIN = 0.7;

export interface DrawingStats {
  /** 획들의 바운딩 박스 (정규 좌표) */
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
  /** 용지 대비 면적 비율 */
  areaRatio: number;
  /** 무게중심 (정규 좌표) */
  centroid: { x: number; y: number } | null;
  meanPressure: number;
  strokeCount: number;
  undos: number;
  onsetDelaySec: number;
  totalSec: number;
}

export function drawingStats(task: DrawTask): DrawingStats {
  const pts = task.strokes.flatMap((s) => s.points);
  if (pts.length === 0) {
    return {
      bbox: null,
      areaRatio: 0,
      centroid: null,
      meanPressure: 0,
      strokeCount: 0,
      undos: task.undos,
      onsetDelaySec: round(Math.max(0, task.endedAt - task.startedAt) / 1000, 1),
      totalSec: round(Math.max(0, task.endedAt - task.startedAt) / 1000, 1),
    };
  }

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const bbox = {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };

  return {
    bbox,
    areaRatio: round(clamp((bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0), 0, 1), 3),
    centroid: { x: round(mean(xs), 3), y: round(mean(ys), 3) },
    meanPressure: round(mean(pts.map((p) => p.p)), 3),
    strokeCount: task.strokes.length,
    undos: task.undos,
    onsetDelaySec: round(Math.max(0, pts[0].t - task.startedAt) / 1000, 1),
    totalSec: round(Math.max(0, task.endedAt - task.startedAt) / 1000, 1),
  };
}

function sizeCode(areaRatio: number): DrawingObservations['크기'] {
  if (areaRatio < SIZE_SMALL_MAX) return '소';
  if (areaRatio > SIZE_LARGE_MIN) return '대';
  return '중';
}

function pressureCode(p: number): DrawingObservations['필압'] {
  if (p < PRESSURE_WEAK_MAX) return '약';
  if (p > PRESSURE_STRONG_MIN) return '강';
  return '보통';
}

/** 위치 — 좌·중·우 × 상·중·하. 예: "좌측 하단", "중앙" */
export function positionLabel(c: { x: number; y: number } | null): string {
  if (!c) return '없음';
  const h = c.x < 0.4 ? '좌측' : c.x > 0.6 ? '우측' : '';
  const v = c.y < 0.4 ? '상단' : c.y > 0.6 ? '하단' : '';
  if (!h && !v) return '중앙';
  return [h, v].filter(Boolean).join(' ');
}

/**
 * 세부 요소 수.
 * 나무의 기본 구조(줄기·수관·지면)를 넘어서는 획을 부가 요소로 센다.
 * 획 하나가 곧 요소 하나는 아니지만, 부스 스케일에서는 이 근사가 충분하다.
 */
export const STRUCTURAL_STROKES = 3;
export function detailCount(strokeCount: number): number {
  return Math.max(0, strokeCount - STRUCTURAL_STROKES);
}

/**
 * 4축 환산 (각 1~3점).
 *
 * 각 축은 체크리스트 항목 2~3개의 평균이다. 특정 항목 하나가 축을 지배하지 않게
 * 항목마다 1~3으로 코딩한 뒤 평균 내고 반올림한다.
 */
export function toAxes(
  stats: DrawingStats,
  structure: DrawingStructureCheck | null,
): Record<DrawingAxisKey, number> {
  const size = stats.areaRatio < SIZE_SMALL_MAX ? 1 : stats.areaRatio > SIZE_LARGE_MIN ? 3 : 2;
  const detail = detailCount(stats.strokeCount);
  const detailScore = detail <= 1 ? 1 : detail <= 5 ? 2 : 3;
  const pressure =
    stats.meanPressure < PRESSURE_WEAK_MAX ? 1 : stats.meanPressure > PRESSURE_STRONG_MIN ? 3 : 2;
  // 수정이 많고 착수가 늦을수록 완벽주의 쪽으로 읽는다
  const corrections = stats.undos <= 1 ? 1 : stats.undos <= 4 ? 2 : 3;
  const delay = stats.onsetDelaySec < 3 ? 1 : stats.onsetDelaySec < 8 ? 2 : 3;
  // 뿌리·줄기·수관이 갖춰질수록 안정 지향으로 읽는다
  const structureScore = structure
    ? clamp(Number(structure.root) + Number(structure.trunk) + Number(structure.crown), 1, 3)
    : 2;
  // 화면 아래쪽에 무겁게 앉힐수록 안정 지향
  const grounded = stats.centroid === null ? 2 : stats.centroid.y > 0.6 ? 3 : stats.centroid.y < 0.4 ? 1 : 2;

  const avg = (...xs: number[]) => clamp(Math.round(mean(xs)), 1, 3);

  return {
    개방성: avg(size, detailScore, 4 - corrections),
    안정지향: avg(structureScore, grounded, 4 - size),
    표현욕구: avg(size, pressure, detailScore),
    완벽주의: avg(corrections, delay, structureScore),
  };
}

/**
 * 각성이 올라간 구간을 그리기 과정의 시점으로 옮긴다.
 *
 * 어떤 "요소"를 그릴 때인지는 획만 보고 알 수 없다. 아는 척하지 않고
 * 과제 안에서의 시점(초반/중반/마무리)으로만 말한다.
 */
export const AROUSAL_PEAK_Z = 1.2;
export function arousalPeaks(task: DrawTask, gsr: TimePoint[]): string[] {
  const win = slice(gsr, task.startedAt, task.endedAt);
  if (win.length < 20) return [];
  const vs = win.map((p) => p.v);
  const m = mean(vs);
  const s = Math.sqrt(mean(vs.map((v) => (v - m) * (v - m))));
  if (s <= 0) return [];

  const span = Math.max(1, task.endedAt - task.startedAt);
  const buckets = new Set<string>();
  for (const p of win) {
    if ((p.v - m) / s < AROUSAL_PEAK_Z) continue;
    const k = (p.t - task.startedAt) / span;
    buckets.add(k < 0.33 ? '그리기 시작할 때' : k < 0.7 ? '중반을 채워 넣을 때' : '마무리할 때');
  }
  return [...buckets];
}

export interface DrawingFeatureOptions {
  /** 자동 재현·마우스 입력 등 필압을 신뢰할 수 없는 경우 */
  pressureTrusted?: boolean;
  /** '10년 뒤 나의 하루'에 대한 언어 서술. 사람이 그린 경우 알 수 없으므로 기본 null */
  futureSketch?: string | null;
}

/** 부록 C의 drawing 블록을 만든다 */
export function buildDrawingBlock(
  tasks: DrawTask[],
  gsr: TimePoint[],
  structure: DrawingStructureCheck | null,
  opts: DrawingFeatureOptions = {},
): { block: DrawingBlock; stats: DrawingStats | null } {
  const tree = tasks.find((t) => t.id === 'tree');
  if (!tree || tree.strokes.length === 0) {
    return {
      block: {
        axes: null,
        observations: null,
        arousal_peaks: [],
        future_sketch: opts.futureSketch ?? null,
        quality: 'missing',
      },
      stats: null,
    };
  }

  const stats = drawingStats(tree);
  const future = tasks.find((t) => t.id === 'future');

  const observations: DrawingObservations = {
    크기: sizeCode(stats.areaRatio),
    위치: positionLabel(stats.centroid),
    필압: pressureCode(stats.meanPressure),
    수정횟수: stats.undos,
    세부요소: detailCount(stats.strokeCount),
    착수지연_sec: stats.onsetDelaySec,
  };

  const peaks = [
    ...arousalPeaks(tree, gsr),
    ...(future ? arousalPeaks(future, gsr).map((s) => `10년 뒤 스케치에서 ${s}`) : []),
  ];

  return {
    block: {
      axes: toAxes(stats, structure),
      observations,
      arousal_peaks: peaks,
      future_sketch: opts.futureSketch ?? null,
      // 필압을 못 믿으면 표현욕구·완벽주의 축의 근거가 약해진다. 그 사실을 숨기지 않는다.
      quality: opts.pressureTrusted === false ? 'degraded' : 'ok',
    },
    stats,
  };
}
