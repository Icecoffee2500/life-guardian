import type { ExperienceEvent } from '@/lib/sensors/types';
import type { TimePoint } from '@/lib/features/signal';

/** 시선 세션 한 시행(자극쌍 하나)의 원시 기록 */
export interface GazeTrial {
  pairId: number;
  /** 화면에서 좌우가 뒤집혔는가 (좌우 무작위 반전 카운터밸런싱) */
  flipped: boolean;
  /** 자극 제시 시각(ms) */
  onset: number;
  /** 자극 종료 시각(ms) */
  offset: number;
  /** 이 시행 동안의 시선 샘플 (x는 0~1 화면 정규화) */
  samples: { t: number; x: number; y: number; c: number }[];
}

/** 그림 스트로크 한 획 */
export interface DrawStroke {
  /** 이 스트로크의 점들. p는 필압(0~1) */
  points: { t: number; x: number; y: number; p: number }[];
}

/** 그림 과제 한 개 */
export interface DrawTask {
  id: 'tree' | 'future';
  startedAt: number;
  endedAt: number;
  /** 캔버스 논리 크기 */
  width: number;
  height: number;
  strokes: DrawStroke[];
  /** 되돌리기(지움) 횟수 */
  undos: number;
  /**
   * 필압의 출처.
   * - pen   : 스타일러스의 실제 필압
   * - proxy : 마우스·손가락. 속도에서 역산한 대체값이므로 해석 가중치를 낮춘다
   * - auto  : 가상 참가자 자동 재현
   */
  pressureSource: 'pen' | 'proxy' | 'auto';
}

/** 대화 한 문항의 기록 */
export interface DialogueTurn {
  q: number;
  topic: string;
  /** 낭독 종료 시각(ms) — 응답 지연 계산의 기준 */
  readEndT: number;
  /** 첫 발화 감지 시각(ms). 무응답이면 null */
  speechStartT: number | null;
  /** 응답 종료 시각(ms) */
  endT: number;
  /** STT 결과 텍스트. 음성 원본은 저장하지 않는다 (윤리 가드레일) */
  transcript: string;
  /** 무응답 표기 */
  noResponse: boolean;
}

/** 진행자가 체크하는 그림 구조 항목 (자동 판별이 어려운 부분) */
export interface DrawingStructureCheck {
  root: boolean;
  trunk: boolean;
  crown: boolean;
}

/**
 * 세션 레코더 — 모든 신호와 이벤트를 하나의 시간축에 모은다.
 *
 * 원시 신호는 브라우저 메모리에 두고, 특징 추출과 리플레이 쇼가 여기서 읽어간다.
 * 10분 세션 × 25Hz × 3채널이면 수만 개 수준이라 메모리 부담이 없다.
 */
export class SessionRecorder {
  hr: TimePoint[] = [];
  gsr: TimePoint[] = [];
  /** RR 간격: t는 박동 시각, v는 간격(ms) */
  rr: TimePoint[] = [];
  gaze: { t: number; x: number; y: number; c: number }[] = [];
  markers: ExperienceEvent[] = [];

  gazeTrials: GazeTrial[] = [];
  drawTasks: DrawTask[] = [];
  dialogueTurns: DialogueTurn[] = [];
  structureCheck: DrawingStructureCheck | null = null;

  /** 씬별 진입/이탈 시각 — 특징 추출의 구간 경계 */
  sceneSpans: { scene: string; start: number; end: number | null }[] = [];

  pushHr(t: number, v: number): void {
    this.hr.push({ t, v });
  }

  pushGsr(t: number, v: number): void {
    this.gsr.push({ t, v });
  }

  pushRr(t: number, v: number): void {
    this.rr.push({ t, v });
  }

  pushGaze(t: number, x: number, y: number, c: number): void {
    this.gaze.push({ t, x, y, c });
  }

  pushMarker(e: ExperienceEvent): void {
    this.markers.push(e);
  }

  enterScene(scene: string, t: number): void {
    const last = this.sceneSpans[this.sceneSpans.length - 1];
    if (last && last.end === null) last.end = t;
    this.sceneSpans.push({ scene, start: t, end: null });
  }

  spanOf(scene: string): { start: number; end: number } | null {
    const s = this.sceneSpans.find((x) => x.scene === scene);
    if (!s) return null;
    return { start: s.start, end: s.end ?? (this.hr[this.hr.length - 1]?.t ?? s.start) };
  }

  clear(): void {
    this.hr = [];
    this.gsr = [];
    this.rr = [];
    this.gaze = [];
    this.markers = [];
    this.gazeTrials = [];
    this.drawTasks = [];
    this.dialogueTurns = [];
    this.structureCheck = null;
    this.sceneSpans = [];
  }
}

export const sessionRecorder = new SessionRecorder();
