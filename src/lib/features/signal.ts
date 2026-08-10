/**
 * 신호 처리 순수 함수 모음.
 *
 * "LLM은 해석만 한다" 원칙에 따라 모든 수치 계산은 여기서 끝난다.
 * 전부 부작용 없는 순수 함수이고 유닛 테스트 대상이다.
 */

export interface TimePoint {
  t: number;
  v: number;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((p, q) => p - q);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/**
 * RMSSD — 연속한 RR 간격 차이의 제곱평균제곱근(ms).
 * 부교감 활성의 표준 지표이며 30초 슬라이딩 윈도우로 계산한다.
 */
export function rmssd(rrMs: number[]): number {
  if (rrMs.length < 2) return NaN;
  let s = 0;
  let n = 0;
  for (let i = 1; i < rrMs.length; i++) {
    const d = rrMs[i] - rrMs[i - 1];
    // 잡음으로 인한 비현실적 점프는 제외 (아티팩트 제거)
    if (Math.abs(d) > 300) continue;
    s += d * d;
    n++;
  }
  return n > 0 ? Math.sqrt(s / n) : NaN;
}

/** 최소제곱 직선의 기울기 (단위: v/ms) */
export function slope(points: TimePoint[]): number {
  const n = points.length;
  if (n < 2) return 0;
  let st = 0;
  let sv = 0;
  for (const p of points) {
    st += p.t;
    sv += p.v;
  }
  const mt = st / n;
  const mv = sv / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - mt) * (p.v - mv);
    den += (p.t - mt) * (p.t - mt);
  }
  return den === 0 ? 0 : num / den;
}

/** [t0, t1) 구간만 잘라낸다. 입력은 t 오름차순이라고 가정한다. */
export function slice<T extends { t: number }>(xs: T[], t0: number, t1: number): T[] {
  const out: T[] = [];
  for (const x of xs) {
    if (x.t >= t1) break;
    if (x.t >= t0) out.push(x);
  }
  return out;
}

/** z-score. sd가 0이면 0을 반환한다. */
export function zscore(v: number, m: number, s: number): number {
  if (!isFinite(v) || !isFinite(m) || !isFinite(s) || s === 0) return 0;
  return (v - m) / s;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** -1~+1로 자르되 NaN은 0으로 */
export function clampUnit(v: number): number {
  if (!isFinite(v)) return 0;
  return clamp(v, -1, 1);
}

/** 소수점 자리 반올림 — LLM 입력 JSON을 깔끔하게 유지한다 */
export function round(v: number, digits = 2): number {
  if (!isFinite(v)) return 0;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/**
 * 이벤트 마커 이후 [lo, hi]초 창에서의 SCR 진폭.
 * 부록 B의 "발화 후 1~4초 구간의 GSR 상승폭" 규칙을 그대로 구현한다.
 * 창 내 최대값 − 마커 직전 기준선.
 */
export function scrAmplitude(
  gsr: TimePoint[],
  markerT: number,
  loSec = 1,
  hiSec = 4,
  baselineSec = 1,
): number {
  const base = slice(gsr, markerT - baselineSec * 1000, markerT);
  const win = slice(gsr, markerT + loSec * 1000, markerT + hiSec * 1000);
  if (win.length === 0) return NaN;
  const b = base.length > 0 ? median(base.map((p) => p.v)) : win[0].v;
  let peak = -Infinity;
  for (const p of win) if (p.v > peak) peak = p.v;
  return peak - b;
}

/** 이동평균 — 파형 표시와 토닉(SCL) 추출에 쓴다 */
export function movingAverage(xs: TimePoint[], windowMs: number): TimePoint[] {
  const out: TimePoint[] = [];
  let j = 0;
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i].v;
    while (xs[i].t - xs[j].t > windowMs) {
      sum -= xs[j].v;
      j++;
    }
    out.push({ t: xs[i].t, v: sum / (i - j + 1) });
  }
  return out;
}
