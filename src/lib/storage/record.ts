import type { LlmInput } from '@/lib/features/schema';
import type { BioReceipt } from '@/lib/interpret/schema';
import type { ExperienceMode } from '@/lib/session/scenes';
import type { TimePoint } from '@/lib/features/signal';

/**
 * 세션 기록 — 체험이 끝난 뒤 남는 것.
 *
 * 원시 신호(수만 개 표본)는 남기지 않는다. 영수증에 인쇄할 파형 한 줄과
 * 해석 입력·출력만 남긴다. 저장소가 커지지 않고, 개인정보도 최소화된다.
 * 음성 원본은 애초에 어디에도 저장되지 않는다(부록 B 윤리 가드레일).
 */
export interface SessionRecord {
  session_id: string;
  nickname: string;
  mode: ExperienceMode;
  created_at: string;
  /** 부록 C Input — 진행자 검증용 */
  input: LlmInput;
  receipt: BioReceipt;
  /** 규칙 기반 해석이었는가 */
  fallback: boolean;
  /** 영수증에 인쇄할 심박 파형 (다운샘플) */
  hr_trace: number[];
  /** 총 소요 시간(초) */
  duration_sec: number;
}

/** 영수증 파형에 쓸 표본 개수 — 80mm 폭에서 이 정도면 충분하다 */
export const TRACE_POINTS = 180;

/**
 * 시계열을 고정 길이로 줄인다.
 * 구간 평균이 아니라 구간의 **최대 편차**를 취해 박동의 뾰족함을 살린다.
 */
export function downsampleTrace(points: TimePoint[], n = TRACE_POINTS): number[] {
  if (points.length === 0) return [];
  if (points.length <= n) return points.map((p) => p.v);
  const out: number[] = [];
  const size = points.length / n;
  for (let i = 0; i < n; i++) {
    const lo = Math.floor(i * size);
    const hi = Math.min(points.length, Math.floor((i + 1) * size));
    let sum = 0;
    let count = 0;
    for (let j = lo; j < hi; j++) {
      sum += points[j].v;
      count++;
    }
    out.push(count > 0 ? sum / count : out[out.length - 1] ?? 0);
  }
  return out;
}
