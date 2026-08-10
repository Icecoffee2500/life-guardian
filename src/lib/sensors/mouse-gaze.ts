import { BaseSource } from './base';
import { sessionClock, type SessionClock } from './clock';
import { clamp } from './random';
import type { GazeSample, SourceKind, SourceMode } from './types';

/**
 * 마우스/터치 시선 프록시.
 *
 * 데모 배포판의 기본값이다. 심사위원은 웹캠 권한을 주지 않고도 URL만 열어
 * 전체 플로우를 완주할 수 있어야 한다 (CLAUDE.md 원칙 3).
 * 포인터 좌표를 뷰포트 정규화 좌표로 바꿔 시선처럼 흘려보낸다.
 */
export class MouseGazeSource extends BaseSource<GazeSample> {
  readonly kind: SourceKind = 'gaze';
  readonly mode: SourceMode = 'simulated';
  readonly label = '포인터 시선 프록시';

  private timer: ReturnType<typeof setInterval> | null = null;
  private pos = { x: 0.5, y: 0.5 };
  private smoothed = { x: 0.5, y: 0.5 };
  private moved = false;
  private handler = (e: PointerEvent | MouseEvent) => {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.pos = { x: clamp(e.clientX / w, 0, 1), y: clamp(e.clientY / h, 0, 1) };
    this.moved = true;
  };

  constructor(private clock: SessionClock = sessionClock) {
    super();
  }

  async connect(): Promise<void> {
    if (typeof window === 'undefined') {
      this.setStatus('error', '브라우저 환경이 아닙니다');
      return;
    }
    this.setStatus('connecting');
    window.addEventListener('pointermove', this.handler, { passive: true });
    window.addEventListener('pointerdown', this.handler, { passive: true });
    this.timer = setInterval(() => this.tick(), 50);
    this.setStatus('streaming');
  }

  disconnect(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this.handler);
      window.removeEventListener('pointerdown', this.handler);
    }
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    super.disconnect();
  }

  private tick(): void {
    // 포인터가 한 번도 움직이지 않았으면 시선 데이터로 인정하지 않는다
    this._quality = this.moved ? 'ok' : 'degraded';
    this.smoothed.x += (this.pos.x - this.smoothed.x) * 0.4;
    this.smoothed.y += (this.pos.y - this.smoothed.y) * 0.4;
    this.push({
      t: this.clock.now(),
      x: this.smoothed.x,
      y: this.smoothed.y,
      confidence: this.moved ? 1 : 0.2,
    });
  }
}
