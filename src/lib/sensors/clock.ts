/**
 * 세션 시계 — 모든 신호·이벤트가 공유하는 단일 시간축.
 *
 * 여러 센서의 타임스탬프를 정렬하려면 기준이 하나여야 한다.
 * 모든 t는 "세션 시작 이후 경과 ms"이며 performance.now() 기반이다.
 */
export class SessionClock {
  private origin: number;

  constructor(origin = SessionClock.rawNow()) {
    this.origin = origin;
  }

  static rawNow(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  /** 세션 시작 시각을 지금으로 리셋 */
  reset(): void {
    this.origin = SessionClock.rawNow();
  }

  /** 세션 시작 기준 경과 시간(ms) */
  now(): number {
    return SessionClock.rawNow() - this.origin;
  }
}

/** 앱 전역에서 공유하는 세션 시계 */
export const sessionClock = new SessionClock();
