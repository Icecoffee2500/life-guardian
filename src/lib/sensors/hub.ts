import { experienceBus, type ExperienceBus } from './bus';
import type { BioSample, BioSource, GazeSample, GazeSource, SourceSnapshot } from './types';
import { sessionRecorder, type SessionRecorder } from '@/lib/session/recorder';
import { mean, movingAverage, rmssd, sd, slice, slope } from '@/lib/features/signal';

/** 화면에 실시간으로 보여줄 현재 상태 */
export interface LiveMetrics {
  /** 최근 심박(bpm) */
  hr: number | null;
  /** 30초 슬라이딩 RMSSD(ms) */
  rmssd: number | null;
  /** 피부전도 수준(µS) */
  gsr: number | null;
  /** 최근 20초 기준 GSR 상승분 — 각성 인디케이터 */
  gsrDelta: number;
  /** 안정 판정 여부 (S2/S3 수렴 판정) */
  settled: boolean;
  /** 안정 판정까지 걸린 시간(초). 아직이면 null */
  settleTimeSec: number | null;
  /** 심박 위상(0~1) — 파형 렌더러가 QRS를 그리는 데 쓴다 */
  beatPhase: number;
  /** 마지막 박동 시각(ms) */
  lastBeatT: number | null;
}

const EMPTY_METRICS: LiveMetrics = {
  hr: null,
  rmssd: null,
  gsr: null,
  gsrDelta: 0,
  settled: false,
  settleTimeSec: null,
  beatPhase: 0,
  lastBeatT: null,
};

/**
 * 안정 판정 기준 (구현계획.md S3).
 *
 * 주의: 심박의 **원시 표준편차**로 판정하면 안 된다.
 * 호흡 가이드는 호흡성 동성부정맥(RSA)을 일부러 키우는 장치라서, 잘 따라올수록
 * 원시 sd가 커진다. 그러면 "제일 잘 이완한 사람이 영영 안정 판정을 못 받는" 역설이 생긴다.
 *
 * 그래서 한 호흡 주기로 이동평균을 걸어 RSA를 걷어낸 뒤, 남은 **느린 추세**의
 * 흔들림과 기울기만 본다. 여기서 평탄하다는 것은 각성이 더 이상 오르내리지 않는다는 뜻이다.
 */
export const SETTLE_TREND_SD_MAX = 1.25; // bpm
export const SETTLE_HR_SLOPE_MAX = 0.00022; // bpm/ms ≈ 13 bpm/분
export const SETTLE_SCL_SLOPE_MAX = 0.0000075; // µS/ms ≈ 0.45 µS/분
export const SETTLE_WINDOW_MS = 20000;
/** RSA를 걷어내기 위한 이동평균 창 — 한 호흡 주기보다 약간 길게 */
export const SETTLE_SMOOTH_MS = 5000;

/**
 * SensorHub — 여러 소스의 스트림을 하나로 통합하고, 파생 지표를 계산해 UI에 흘린다.
 *
 * 소스가 시뮬레이터든 실기기든 여기서부터는 구분이 없다.
 */
export class SensorHub {
  private bio: BioSource[] = [];
  private gaze: GazeSource | null = null;
  private unsubs: (() => void)[] = [];
  private listeners = new Set<(m: LiveMetrics) => void>();
  private snapshotListeners = new Set<(s: SourceSnapshot[]) => void>();

  private metrics: LiveMetrics = { ...EMPTY_METRICS };
  private settleSince: number | null = null;
  private settledAt: number | null = null;
  /** 안정 판정을 감시할지 여부 (S2/S3에서만 켠다) */
  private watchSettle = false;

  constructor(
    private recorder: SessionRecorder = sessionRecorder,
    private bus: ExperienceBus = experienceBus,
  ) {}

  attachBio(source: BioSource): void {
    this.bio.push(source);
    this.unsubs.push(source.subscribe((s) => this.onBio(s)));
    this.unsubs.push(source.onStatusChange(() => this.emitSnapshots()));
    this.emitSnapshots();
  }

  attachGaze(source: GazeSource): void {
    this.gaze = source;
    this.unsubs.push(source.subscribe((s) => this.onGaze(s)));
    this.unsubs.push(source.onStatusChange(() => this.emitSnapshots()));
    this.emitSnapshots();
  }

  /** 소스를 전부 떼고 버퍼를 비운다 */
  detachAll(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    for (const s of this.bio) s.disconnect();
    this.gaze?.disconnect();
    this.bio = [];
    this.gaze = null;
    this.metrics = { ...EMPTY_METRICS };
    this.settleSince = null;
    this.settledAt = null;
    this.emitSnapshots();
  }

  sources(): SourceSnapshot[] {
    const all = [...this.bio, ...(this.gaze ? [this.gaze] : [])];
    return all.map((s) => ({
      kind: s.kind,
      mode: s.mode,
      label: s.label,
      status: s.status,
      quality: s.quality,
      error: s.error,
    }));
  }

  setWatchSettle(on: boolean): void {
    this.watchSettle = on;
    if (!on) this.settleSince = null;
  }

  subscribe(cb: (m: LiveMetrics) => void): () => void {
    this.listeners.add(cb);
    cb(this.metrics);
    return () => {
      this.listeners.delete(cb);
    };
  }

  onSources(cb: (s: SourceSnapshot[]) => void): () => void {
    this.snapshotListeners.add(cb);
    cb(this.sources());
    return () => {
      this.snapshotListeners.delete(cb);
    };
  }

  current(): LiveMetrics {
    return this.metrics;
  }

  private emitSnapshots(): void {
    const snap = this.sources();
    for (const cb of this.snapshotListeners) cb(snap);
  }

  private onGaze(s: GazeSample): void {
    this.recorder.pushGaze(s.t, s.x, s.y, s.confidence);
  }

  private onBio(s: BioSample): void {
    const r = this.recorder;
    if (s.hr !== undefined) {
      r.pushHr(s.t, s.hr);
      this.metrics.hr = s.hr;
      // 박동 위상은 파형 렌더러가 쓴다
      if (this.metrics.lastBeatT !== null) {
        const period = 60000 / s.hr;
        this.metrics.beatPhase = Math.min(1, (s.t - this.metrics.lastBeatT) / period);
      }
    }
    if (s.rr && s.rr.length) {
      for (const v of s.rr) r.pushRr(s.t, v);
      this.metrics.lastBeatT = s.t;
      this.metrics.beatPhase = 0;
      const recent = slice(r.rr, s.t - 30000, s.t + 1).map((p) => p.v);
      const v = rmssd(recent);
      if (isFinite(v)) this.metrics.rmssd = v;
    }
    if (s.gsr !== undefined) {
      r.pushGsr(s.t, s.gsr);
      this.metrics.gsr = s.gsr;
      const win = slice(r.gsr, s.t - 20000, s.t + 1);
      if (win.length > 4) {
        const base = win.slice(0, Math.max(1, Math.floor(win.length * 0.2)));
        this.metrics.gsrDelta = s.gsr - mean(base.map((p) => p.v));
      }
    }

    this.updateSettle(s.t);
    for (const cb of this.listeners) cb(this.metrics);
  }

  /**
   * 안정 수렴 판정. 조건이 연속 5초 이상 유지되어야 확정한다.
   * (한 순간의 우연한 평탄 구간을 안정으로 오인하지 않게)
   */
  private updateSettle(t: number): void {
    if (!this.watchSettle || this.settledAt !== null) return;
    const r = this.recorder;
    const hrWin = slice(r.hr, t - SETTLE_WINDOW_MS, t + 1);
    const gsrWin = slice(r.gsr, t - SETTLE_WINDOW_MS, t + 1);
    if (hrWin.length < 60 || gsrWin.length < 60) return;

    // RSA를 걷어낸 느린 추세만 남긴다. 이동평균이 자리를 잡기 전 구간은 버린다.
    const trend = movingAverage(hrWin, SETTLE_SMOOTH_MS).filter(
      (p) => p.t - hrWin[0].t > SETTLE_SMOOTH_MS,
    );
    if (trend.length < 30) return;

    const trendSd = sd(trend.map((p) => p.v));
    const hrSlope = Math.abs(slope(trend));
    const sclSlope = Math.abs(slope(gsrWin));
    const ok =
      trendSd < SETTLE_TREND_SD_MAX &&
      hrSlope < SETTLE_HR_SLOPE_MAX &&
      sclSlope < SETTLE_SCL_SLOPE_MAX;

    if (ok) {
      if (this.settleSince === null) this.settleSince = t;
      else if (t - this.settleSince > 5000) {
        this.settledAt = t;
        this.metrics.settled = true;
        this.metrics.settleTimeSec = Math.round(t / 100) / 10;
        this.bus.emit('breath-settled', { t });
      }
    } else {
      this.settleSince = null;
    }
  }

  resetSettle(): void {
    this.settleSince = null;
    this.settledAt = null;
    this.metrics.settled = false;
    this.metrics.settleTimeSec = null;
  }
}

export const sensorHub = new SensorHub();
