/**
 * 심전도풍 파형 합성.
 *
 * 실기기든 시뮬레이터든 우리가 받는 것은 bpm과 RR 간격뿐이고 파형 자체는 오지 않는다.
 * 그래서 박동 위상(0~1)으로부터 파형을 그려낸다 — 두 모드에서 화면이 똑같이 보인다.
 *
 * 병원 모니터의 각진 선이 아니라, 부드러운 P·QRS·T 복합파를 만든다.
 */

/** 가우시안 범프 */
function bump(x: number, center: number, width: number): number {
  const d = (x - center) / width;
  return Math.exp(-d * d);
}

/**
 * 박동 위상 phase(0~1)에서의 파형 값. 대략 -0.22 ~ 1 범위.
 * @param amp 진폭 배율 (각성이 높을수록 살짝 크게)
 */
export function ecgAt(phase: number, amp = 1): number {
  const p = phase % 1;
  // P파 — 낮고 완만한 심방 탈분극
  const P = 0.115 * bump(p, 0.14, 0.036);
  // QRS — Q(작은 음), R(큰 양), S(음)
  const Q = -0.09 * bump(p, 0.222, 0.009);
  const R = 1.0 * bump(p, 0.246, 0.0115);
  const S = -0.19 * bump(p, 0.278, 0.0135);
  // T파 — 넓고 완만한 재분극
  const T = 0.235 * bump(p, 0.44, 0.056);
  return (P + Q + R + S + T) * amp;
}

/**
 * 화면 스크롤 파형 버퍼.
 * 픽셀 열 하나당 값 하나를 유지하며 왼쪽으로 밀린다.
 */
export class ScrollBuffer {
  private buf: Float32Array;
  private head = 0;
  private filled = 0;

  constructor(size: number) {
    this.buf = new Float32Array(size);
  }

  resize(size: number): void {
    if (size === this.buf.length || size <= 0) return;
    const next = new Float32Array(size);
    const n = Math.min(size, this.filled);
    for (let i = 0; i < n; i++) next[size - n + i] = this.at(this.filled - n + i);
    this.buf = next;
    this.head = 0;
    this.filled = n;
  }

  push(v: number): void {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.buf.length;
    if (this.filled < this.buf.length) this.filled++;
  }

  /** 오래된 것부터 i번째 값 */
  at(i: number): number {
    const start = (this.head - this.filled + this.buf.length) % this.buf.length;
    return this.buf[(start + i) % this.buf.length];
  }

  get length(): number {
    return this.filled;
  }

  get capacity(): number {
    return this.buf.length;
  }

  clear(): void {
    this.buf.fill(0);
    this.head = 0;
    this.filled = 0;
  }
}
