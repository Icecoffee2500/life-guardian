import type { Persona } from './personas';
import { clamp, gaussianFrom, mulberry32 } from './random';

/**
 * 생리 신호 생성 엔진.
 *
 * 심박과 GSR을 각각 따로 만들면 서로 무관한 두 개의 난수가 되어 금방 가짜 티가 난다.
 * 실제 몸에서는 둘 다 같은 자율신경 각성 상태를 공유하므로, 여기서도 하나의
 * arousal(t) 곡선을 두 신호가 함께 쓴다.
 *
 * - HR  = 기저 + 입장 각성(지수 감쇠) + 호흡성 동성부정맥(RSA) + 완만한 표류
 *         + 각성 반응 + 노이즈
 * - RR  = 60000/HR + 지터(각성이 높을수록 지터 감소 → HRV 저하)
 * - GSR = 토닉 SCL + 표류 + Σ SCR(자극별 이중지수 파형) + 미세 노이즈
 */

/** 단일 SCR(피부전도반응) 이벤트 */
interface ScrEvent {
  /** 자극 발생 시각(ms) */
  t0: number;
  /** 진폭(µS) */
  amp: number;
  /** 상승 시상수(초) */
  tauRise: number;
  /** 회복 시상수(초) */
  tauDecay: number;
  /** 자극~반응 개시 지연(초). 생리학적으로 1~3초 */
  latency: number;
}

/** 이중지수(Bateman) SCR 파형. 최대값이 1이 되도록 정규화한다. */
export function scrShape(dtSec: number, tauRise: number, tauDecay: number): number {
  if (dtSec <= 0) return 0;
  const peakT = ((tauRise * tauDecay) / (tauDecay - tauRise)) * Math.log(tauDecay / tauRise);
  const norm = Math.exp(-peakT / tauDecay) - Math.exp(-peakT / tauRise);
  const v = Math.exp(-dtSec / tauDecay) - Math.exp(-dtSec / tauRise);
  return norm > 0 ? Math.max(0, v / norm) : 0;
}

export interface PhysiologySample {
  t: number;
  hr: number;
  gsr: number;
  /** 이 샘플 구간에 완결된 박동의 RR 간격(ms) */
  rr: number[];
  /** 참고용 내부 각성 상태(0~2). 시뮬레이션 디버깅과 진행자 화면에만 쓴다 */
  arousal: number;
}

export class PhysiologyEngine {
  private persona: Persona;
  private events: ScrEvent[] = [];
  private rand: () => number;
  private gauss: () => number;

  /** 마지막으로 샘플을 만든 시각 */
  private lastT = 0;
  /** 심박 위상(0~1). 1을 넘으면 한 박동 */
  private beatPhase = 0;
  /** 직전 박동 시각(ms) */
  private lastBeatT: number | null = null;
  /** 호흡 가이드가 켜졌을 때의 목표 주파수(Hz) */
  private pacedBreathHz: number | null = null;
  /** 1차 필터를 통과한 부드러운 HR (급격한 계단 변화 방지) */
  private smoothedHr: number;
  private noiseState = 0;

  constructor(persona: Persona, seed = 1) {
    this.persona = persona;
    this.rand = mulberry32(seed);
    this.gauss = gaussianFrom(this.rand);
    this.smoothedHr = persona.physiology.hrBase + persona.physiology.hrArrivalOffset;
  }

  setPersona(persona: Persona): void {
    this.persona = persona;
    this.smoothedHr = persona.physiology.hrBase + persona.physiology.hrArrivalOffset;
    this.events = [];
  }

  /**
   * 자극·질문 등 각성 유발 이벤트를 등록한다.
   * @param intensity 0~1. 페르소나의 반응성(scrGain)이 곱해진다.
   */
  trigger(t: number, intensity: number): void {
    const p = this.persona.physiology;
    const amp = clamp(intensity, 0, 1.5) * p.scrGain * (0.75 + this.rand() * 0.5);
    if (amp < 0.02) return;
    this.events.push({
      t0: t,
      amp,
      tauRise: 0.6 + this.rand() * 0.5,
      tauDecay: p.scrDecaySec * (0.85 + this.rand() * 0.3),
      latency: 1.0 + this.rand() * 1.4,
    });
    // 오래된 이벤트는 버린다 (30초 지나면 기여분이 사실상 0)
    if (this.events.length > 64) {
      this.events = this.events.filter((e) => t - e.t0 < 30000);
    }
  }

  /** 호흡 가이드 시작/종료. 페이싱 호흡은 RSA 진폭을 키운다. */
  setBreathPacing(hz: number | null): void {
    this.pacedBreathHz = hz;
  }

  /** 현재까지 등록된 각성 이벤트의 합(정규화 전) */
  arousalAt(t: number): number {
    let a = 0;
    for (const e of this.events) {
      const dt = (t - e.t0) / 1000 - e.latency;
      if (dt <= 0) continue;
      a += e.amp * scrShape(dt, e.tauRise, e.tauDecay);
    }
    return a;
  }

  /** t 시점의 샘플을 만든다. 호출 간격(dt)만큼 박동 위상을 전진시킨다. */
  sample(t: number): PhysiologySample {
    const p = this.persona.physiology;
    const dt = Math.max(0, t - this.lastT);
    this.lastT = t;

    const arousal = this.arousalAt(t);

    // 입장 직후의 각성이 지수적으로 가라앉는다 (settleRate가 클수록 빨리)
    const arrival = p.hrArrivalOffset * Math.exp((-t / 90000) * p.settleRate);

    // 호흡성 동성부정맥 — 페이싱 호흡 중에는 진폭이 커진다
    const breathHz = this.pacedBreathHz ?? p.breathHz;
    const rsaAmp = p.rsaAmp * (this.pacedBreathHz ? 1.6 : 1);
    const rsa = rsaAmp * Math.sin((2 * Math.PI * breathHz * t) / 1000);

    // 아주 느린 표류 (0.02Hz) — 완전한 정상성은 오히려 부자연스럽다
    const drift = 1.2 * Math.sin((2 * Math.PI * 0.02 * t) / 1000 + 1.3);

    // 붉은 잡음에 가깝게: 1차 저역통과된 백색잡음
    this.noiseState = this.noiseState * 0.9 + this.gauss() * 0.5;

    const targetHr =
      p.hrBase + arrival + rsa + drift + p.hrReactivity * Math.min(arousal, 1.4) + this.noiseState;

    // 심박은 계단처럼 튀지 않는다. 시상수 ~1.5초의 1차 지연을 준다.
    const alpha = dt > 0 ? 1 - Math.exp(-dt / 1500) : 0;
    this.smoothedHr += (targetHr - this.smoothedHr) * alpha;
    const hr = clamp(this.smoothedHr, 42, 180);

    // 박동 생성 — RR 지터가 HRV(RMSSD)의 원천
    const rr: number[] = [];
    this.beatPhase += (hr / 60) * (dt / 1000);
    while (this.beatPhase >= 1) {
      this.beatPhase -= 1;
      const beatT = t - (this.beatPhase * 60000) / hr;
      if (this.lastBeatT !== null) {
        const jitterSd = p.rrJitterSd * clamp(1 - 0.45 * arousal, 0.3, 1);
        const interval = clamp(beatT - this.lastBeatT + this.gauss() * jitterSd, 280, 1600);
        rr.push(interval);
      }
      this.lastBeatT = beatT;
    }

    const gsr =
      p.sclBase +
      p.sclDrift * (t / 60000) +
      arousal * 1.1 +
      this.gauss() * 0.02;

    return { t, hr, gsr: Math.max(0.5, gsr), rr, arousal };
  }

  reset(seed = 1): void {
    const p = this.persona.physiology;
    this.events = [];
    this.rand = mulberry32(seed);
    this.gauss = gaussianFrom(this.rand);
    this.lastT = 0;
    this.beatPhase = 0;
    this.lastBeatT = null;
    this.pacedBreathHz = null;
    this.smoothedHr = p.hrBase + p.hrArrivalOffset;
    this.noiseState = 0;
  }
}
