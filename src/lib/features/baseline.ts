import { mean, rmssd, round, slice, type TimePoint } from './signal';
import type { BaselineBlock, CalmPhaseBlock, Quality } from './schema';

/**
 * 베이스라인 블록 — 이 사람의 "평상시"가 무엇이었는지.
 *
 * 이후의 모든 각성 지표는 이 값 대비로만 의미가 있다.
 * 절대 심박 74bpm은 아무것도 말해주지 않지만, 자기 기준선보다 12 올라간 74는 말해준다.
 */

/** 이만큼의 표본이 없으면 기준선이라고 부르지 않는다 (25Hz 기준 약 8초) */
export const MIN_BASELINE_SAMPLES = 200;
/** 이만큼도 없으면 결측 */
export const MISSING_BASELINE_SAMPLES = 40;

export interface BaselineSpan {
  start: number;
  end: number;
}

export function buildBaselineBlock(
  hr: TimePoint[],
  rr: TimePoint[],
  gsr: TimePoint[],
  span: BaselineSpan | null,
): BaselineBlock {
  if (!span) {
    return { hr_mean: null, hrv_rmssd: null, gsr_scl_mean: null, quality: 'missing' };
  }

  const hrWin = slice(hr, span.start, span.end);
  const rrWin = slice(rr, span.start, span.end);
  const gsrWin = slice(gsr, span.start, span.end);

  const n = Math.min(hrWin.length, gsrWin.length);
  let quality: Quality = 'ok';
  if (n < MISSING_BASELINE_SAMPLES) quality = 'missing';
  else if (n < MIN_BASELINE_SAMPLES) quality = 'degraded';

  if (quality === 'missing') {
    return { hr_mean: null, hrv_rmssd: null, gsr_scl_mean: null, quality };
  }

  const hrv = rmssd(rrWin.map((p) => p.v));

  return {
    hr_mean: hrWin.length ? round(mean(hrWin.map((p) => p.v)), 1) : null,
    // RR이 충분히 안 모이면 RMSSD를 지어내지 않는다
    hrv_rmssd: rrWin.length >= 10 && isFinite(hrv) ? round(hrv, 1) : null,
    gsr_scl_mean: gsrWin.length ? round(mean(gsrWin.map((p) => p.v)), 2) : null,
    quality,
  };
}

export function buildCalmPhaseBlock(
  settled: boolean,
  settleTimeSec: number | null,
): CalmPhaseBlock {
  return {
    reached: settled,
    settle_time_sec: settled && settleTimeSec !== null ? round(settleTimeSec, 1) : null,
  };
}
