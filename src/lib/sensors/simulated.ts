import { BaseSource } from './base';
import { experienceBus, type ExperienceBus } from './bus';
import { sessionClock, type SessionClock } from './clock';
import { PhysiologyEngine } from './physiology';
import { DEFAULT_PERSONA_ID, getPersona, type Persona, type PersonaId } from './personas';
import { clamp, gaussianFrom, hashSeed, mulberry32 } from './random';
import type {
  BioSample,
  ExperienceEvent,
  ExperienceEventType,
  GazeSample,
  SourceKind,
  SourceMode,
} from './types';

/** 이벤트 종류별 기본 각성 강도. 씬이 intensity를 직접 주면 그 값이 우선한다. */
const DEFAULT_INTENSITY: Record<ExperienceEventType, number> = {
  'scene-enter': 0.12,
  'stimulus-onset': 0.25,
  'stimulus-offset': 0,
  'question-onset': 0.3,
  'speech-onset': 0.35,
  'draw-start': 0.35,
  'draw-stroke': 0.03,
  'breath-settled': 0,
  'manual-spike': 0.9,
};

const TICK_MS = 40; // 25Hz

/**
 * 시뮬레이션 런타임 — 페르소나 하나에 대한 생리 엔진과 틱을 소유한다.
 * band/gsr 소스는 이 런타임의 같은 샘플을 나눠 쓰므로 두 신호가 서로 일관된다.
 */
export class SimulationRuntime {
  readonly engine: PhysiologyEngine;
  private persona: Persona;
  private timer: ReturnType<typeof setInterval> | null = null;
  private subs = new Set<(s: BioSample & { arousal: number }) => void>();
  private unsubBus: (() => void) | null = null;
  private clock: SessionClock;
  private bus: ExperienceBus;
  private refCount = 0;

  constructor(
    personaId: PersonaId = DEFAULT_PERSONA_ID,
    opts: { clock?: SessionClock; bus?: ExperienceBus; seed?: number } = {},
  ) {
    this.persona = getPersona(personaId);
    this.clock = opts.clock ?? sessionClock;
    this.bus = opts.bus ?? experienceBus;
    this.engine = new PhysiologyEngine(this.persona, opts.seed ?? hashSeed(personaId));
  }

  setPersona(id: PersonaId): void {
    this.persona = getPersona(id);
    this.engine.setPersona(this.persona);
    this.engine.reset(hashSeed(id));
  }

  currentPersona(): Persona {
    return this.persona;
  }

  start(): void {
    this.refCount++;
    if (this.timer) return;
    this.unsubBus = this.bus.subscribe((e) => this.onEvent(e));
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount > 0) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubBus?.();
    this.unsubBus = null;
  }

  subscribe(cb: (s: BioSample & { arousal: number }) => void): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  private onEvent(e: ExperienceEvent): void {
    if (e.type === 'breath-settled') {
      this.engine.setBreathPacing(null);
      return;
    }
    const base = e.intensity ?? DEFAULT_INTENSITY[e.type] ?? 0;
    // 페르소나의 관심 축과 맞는 자극일수록 각성이 크게 뜬다
    const affinityBoost = e.affinity !== undefined ? 0.45 * Math.abs(e.affinity) : 0;
    const intensity = clamp(base + affinityBoost, 0, 1.5);
    if (intensity > 0) this.engine.trigger(e.t, intensity);
  }

  /** 호흡 가이드 시작/종료 (S2 씬이 호출) */
  setBreathPacing(hz: number | null): void {
    this.engine.setBreathPacing(hz);
  }

  private tick(): void {
    const s = this.engine.sample(this.clock.now());
    for (const cb of this.subs) cb(s);
  }
}

/** 앱 전역 시뮬레이션 런타임 */
export const simulationRuntime = new SimulationRuntime();

/** 시뮬레이션 밴드 — HR과 RR만 내보낸다 (실제 밴드와 동일한 채널) */
export class SimulatedBandSource extends BaseSource<BioSample> {
  readonly kind: SourceKind = 'band';
  readonly mode: SourceMode = 'simulated';
  readonly label = '시뮬레이션 밴드';
  private unsub: (() => void) | null = null;

  constructor(private runtime: SimulationRuntime = simulationRuntime) {
    super();
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    // 실기기 연결의 리듬을 흉내 낸다 — 즉시 연결되면 오히려 가짜 같다
    await new Promise((r) => setTimeout(r, 600));
    this.runtime.start();
    this.unsub = this.runtime.subscribe((s) => this.push({ t: s.t, hr: s.hr, rr: s.rr }));
    this.setStatus('streaming');
  }

  disconnect(): void {
    this.unsub?.();
    this.unsub = null;
    this.runtime.stop();
    super.disconnect();
  }
}

/** 시뮬레이션 GSR */
export class SimulatedGsrSource extends BaseSource<BioSample> {
  readonly kind: SourceKind = 'gsr';
  readonly mode: SourceMode = 'simulated';
  readonly label = '시뮬레이션 GSR';
  private unsub: (() => void) | null = null;

  constructor(private runtime: SimulationRuntime = simulationRuntime) {
    super();
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    await new Promise((r) => setTimeout(r, 900));
    this.runtime.start();
    this.unsub = this.runtime.subscribe((s) => this.push({ t: s.t, gsr: s.gsr }));
    this.setStatus('streaming');
  }

  disconnect(): void {
    this.unsub?.();
    this.unsub = null;
    this.runtime.stop();
    super.disconnect();
  }
}

/**
 * 시뮬레이션 시선.
 *
 * 자극 제시 이벤트의 affinity(-1: 왼쪽 선호 ~ +1: 오른쪽 선호)를 받아
 * 그 쪽에 더 오래 머무는 응시 시퀀스를 만든다.
 * 응시점(+) 구간에는 화면 중앙으로 돌아온다.
 */
export class SimulatedGazeSource extends BaseSource<GazeSample> {
  readonly kind: SourceKind = 'gaze';
  readonly mode: SourceMode = 'simulated';
  readonly label = '시뮬레이션 시선';

  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubBus: (() => void) | null = null;
  private rand = mulberry32(97);
  private gauss = gaussianFrom(this.rand);

  /** -1(좌) ~ +1(우). null이면 자극 없음 → 중앙 응시 */
  private preference: number | null = null;
  private noise = 0.25;
  private currentSide: -1 | 1 = 1;
  private nextSaccadeAt = 0;
  private target = { x: 0.5, y: 0.5 };
  private pos = { x: 0.5, y: 0.5 };

  constructor(
    private runtime: SimulationRuntime = simulationRuntime,
    private clock: SessionClock = sessionClock,
    private bus: ExperienceBus = experienceBus,
  ) {
    super();
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    await new Promise((r) => setTimeout(r, 400));
    this.noise = this.runtime.currentPersona().gazeNoise;
    this.unsubBus = this.bus.subscribe((e) => {
      if (e.type === 'stimulus-onset') {
        this.preference = e.affinity ?? 0;
        this.noise = this.runtime.currentPersona().gazeNoise;
        // 첫 응시 방향은 선호 쪽으로 기울되 확정적이지 않다
        const pFirstRight = clamp(0.5 + 0.46 * this.preference * (1 - this.noise), 0.05, 0.95);
        this.currentSide = this.rand() < pFirstRight ? 1 : -1;
        this.nextSaccadeAt = e.t + 180 + this.rand() * 260;
        this.retarget();
      } else if (e.type === 'stimulus-offset') {
        this.preference = null;
        this.target = { x: 0.5, y: 0.5 };
      }
    });
    this.timer = setInterval(() => this.tick(), 50);
    this.setStatus('streaming');
  }

  disconnect(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubBus?.();
    this.unsubBus = null;
    super.disconnect();
  }

  private retarget(): void {
    if (this.preference === null) {
      this.target = { x: 0.5 + this.gauss() * 0.01, y: 0.5 + this.gauss() * 0.01 };
      return;
    }
    const cx = this.currentSide === 1 ? 0.74 : 0.26;
    this.target = {
      x: clamp(cx + this.gauss() * 0.06, 0.03, 0.97),
      y: clamp(0.5 + this.gauss() * 0.09, 0.05, 0.95),
    };
  }

  private tick(): void {
    const t = this.clock.now();
    if (this.preference !== null && t >= this.nextSaccadeAt) {
      // 선호 쪽에 머무는 비율이 dwell ratio가 된다
      const pRight = clamp(0.5 + 0.44 * this.preference * (1 - this.noise), 0.06, 0.94);
      const stay = this.currentSide === 1 ? pRight : 1 - pRight;
      if (this.rand() > stay * 0.72 + 0.14) this.currentSide = (this.currentSide * -1) as -1 | 1;
      this.nextSaccadeAt = t + 220 + this.rand() * 480;
      this.retarget();
    } else if (this.preference === null && t >= this.nextSaccadeAt) {
      this.nextSaccadeAt = t + 400 + this.rand() * 500;
      this.retarget();
    }
    // 도약(saccade) 후 미세한 표류를 흉내 낸 지수 접근
    this.pos.x += (this.target.x - this.pos.x) * 0.35;
    this.pos.y += (this.target.y - this.pos.y) * 0.35;
    this.push({
      t,
      x: clamp(this.pos.x + this.gauss() * 0.004, 0, 1),
      y: clamp(this.pos.y + this.gauss() * 0.004, 0, 1),
      confidence: 0.9,
    });
  }
}
