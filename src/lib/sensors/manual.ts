import { BaseSource } from './base';
import { sessionClock, type SessionClock } from './clock';
import { gaussianFrom, mulberry32 } from './random';
import type { BioSample, SourceKind, SourceMode } from './types';

/**
 * 수동 입력 소스 — 진행자가 대시보드 슬라이더로 값을 직접 만든다.
 *
 * 발표 시연에서 "지금 이 순간 각성이 올라갑니다"를 의도대로 연출해야 할 때,
 * 그리고 센서도 시뮬레이터도 못 믿을 상황의 최후 수단으로 쓴다.
 */
export class ManualBioSource extends BaseSource<BioSample> {
  readonly mode: SourceMode = 'manual';
  readonly label: string;
  readonly kind: SourceKind;

  private timer: ReturnType<typeof setInterval> | null = null;
  private rand = mulberry32(4242);
  private gauss = gaussianFrom(this.rand);

  private hr = 72;
  private gsr = 6;
  private beatPhase = 0;
  private lastBeatT: number | null = null;
  private lastT = 0;

  constructor(kind: SourceKind = 'band', private clock: SessionClock = sessionClock) {
    super();
    this.kind = kind;
    this.label = kind === 'band' ? '수동 입력 (심박)' : '수동 입력 (GSR)';
  }

  setHr(bpm: number): void {
    this.hr = bpm;
  }

  setGsr(us: number): void {
    this.gsr = us;
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    this.timer = setInterval(() => this.tick(), 40);
    this.setStatus('streaming');
  }

  disconnect(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    super.disconnect();
  }

  private tick(): void {
    const t = this.clock.now();
    const dt = Math.max(0, t - this.lastT);
    this.lastT = t;
    if (this.kind === 'band') {
      const hr = this.hr + this.gauss() * 0.6;
      const rr: number[] = [];
      this.beatPhase += (hr / 60) * (dt / 1000);
      while (this.beatPhase >= 1) {
        this.beatPhase -= 1;
        const beatT = t - (this.beatPhase * 60000) / hr;
        if (this.lastBeatT !== null) rr.push(beatT - this.lastBeatT + this.gauss() * 18);
        this.lastBeatT = beatT;
      }
      this.push({ t, hr, rr });
    } else {
      this.push({ t, gsr: this.gsr + this.gauss() * 0.02 });
    }
  }
}
