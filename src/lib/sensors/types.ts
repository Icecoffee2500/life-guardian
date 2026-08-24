/**
 * DataSource 추상화 — 이 프로젝트의 뼈대.
 *
 * 실기기가 배송되기 전이므로 앱의 어떤 코드도 구체 센서에 직접 의존하지 않는다.
 * 시뮬레이터 / 수동입력 / 실기기 3종이 전부 같은 인터페이스를 만족하며,
 * 기기가 도착하면 구현체 하나만 갈아끼우면 된다. (구현계획.md 2.1절)
 */

/** 심박·GSR 계열 샘플. 결측 채널은 undefined로 둔다. */
export interface BioSample {
  /** 세션 시작 기준 경과 시간(ms) */
  t: number;
  /** 순간 심박수(bpm) */
  hr?: number;
  /** 이번 샘플에 새로 도착한 RR 간격(ms) 목록 */
  rr?: number[];
  /** 피부 전기전도도(µS) */
  gsr?: number;
}

/** 시선 샘플. 좌표는 뷰포트 기준 정규화 값(0~1). */
export interface GazeSample {
  t: number;
  /** 0(좌) ~ 1(우) */
  x: number;
  /** 0(상) ~ 1(하) */
  y: number;
  /** 0~1. 마우스 프록시는 1, WebGazer는 추정 신뢰도 */
  confidence: number;
}

export type SourceKind = 'band' | 'gsr' | 'gaze';
export type SourceMode = 'live' | 'simulated' | 'manual';
export type SourceStatus = 'idle' | 'connecting' | 'streaming' | 'error';

/** 신호 품질 — 부록 C Input 스키마의 quality 필드와 그대로 연결된다. */
export type SignalQuality = 'ok' | 'degraded' | 'missing';

export interface DataSource<S = BioSample> {
  readonly kind: SourceKind;
  readonly mode: SourceMode;
  readonly label: string;
  readonly status: SourceStatus;
  /** 마지막 오류 메시지 (status === 'error'일 때) */
  readonly error?: string;
  /** 이 소스가 현재 내보내는 신호의 품질 */
  readonly quality: SignalQuality;
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(cb: (s: S) => void): () => void;
  onStatusChange(cb: (status: SourceStatus) => void): () => void;
}

export type BioSource = DataSource<BioSample>;
export type GazeSource = DataSource<GazeSample>;

/**
 * 체험 이벤트 — 자극 제시·질문 시작 같은 순간을 신호 생성기에 알린다.
 * 시뮬레이터는 이 이벤트에 반응해 SCR·심박 상승을 만들어내므로
 * 데모에서도 신호가 "진짜처럼" 반응한다. (구현계획.md 2.1절)
 */
export interface ExperienceEvent {
  /** 세션 시작 기준 경과 시간(ms) */
  t: number;
  type: ExperienceEventType;
  /** 이벤트 식별용 라벨 (예: 'pair-7', 'q-4') */
  ref?: string;
  /**
   * 0~1. 이 이벤트가 얼마나 각성을 유발할 것으로 기대되는가.
   * 시뮬레이터는 여기에 페르소나 반응성을 곱해 SCR 진폭을 정한다.
   */
  intensity?: number;
  /** 시뮬레이터 전용 힌트 — 이 자극이 페르소나의 '관심 축'인지 */
  affinity?: number;
}

export type ExperienceEventType =
  | 'scene-enter'
  | 'stimulus-onset'
  | 'stimulus-offset'
  | 'question-onset'
  | 'speech-onset'
  | 'draw-start'
  | 'draw-stroke'
  | 'breath-settled'
  | 'manual-spike';

/** 소스 상태를 UI에 노출하기 위한 요약 */
export interface SourceSnapshot {
  kind: SourceKind;
  mode: SourceMode;
  label: string;
  status: SourceStatus;
  quality: SignalQuality;
  error?: string;
  /**
   * 실효 샘플레이트(Hz). 표본이 아직 없으면 undefined.
   *
   * 상태가 '수신'인데 이 값이 기대치의 절반이라면 신호는 흐르지만 절반을 흘리고 있다는
   * 뜻이다. 실기기 연동에서 이런 조용한 손실을 실제로 겪었기 때문에 노출한다.
   */
  hz?: number;
}
