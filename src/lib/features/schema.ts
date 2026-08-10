import type { RiasecType, TraitKey } from '@/lib/stimuli/pairs';

/**
 * 부록 C Input 스키마 — 그대로 구현한다. 임의로 바꾸지 않는다.
 *
 * 결측 항목은 키를 생략하지 않고 null + quality:"missing"으로 명시한다.
 * 키가 사라지면 모델이 다른 필드로 메우려 들기 때문이다. (부록 C 주석)
 */

export type Quality = 'ok' | 'degraded' | 'missing';

export interface BaselineBlock {
  hr_mean: number | null;
  hrv_rmssd: number | null;
  gsr_scl_mean: number | null;
  quality: Quality;
}

export interface CalmPhaseBlock {
  reached: boolean;
  settle_time_sec: number | null;
}

export interface HighArousalPair {
  pair: number;
  선택: string;
  arousal_z: number;
}

export interface GazeBlock {
  riasec: Record<RiasecType, number> | null;
  traits: Record<TraitKey, number> | null;
  high_arousal_pairs: HighArousalPair[];
  quality: Quality;
}

export type DrawingAxisKey = '개방성' | '안정지향' | '표현욕구' | '완벽주의';

export interface DrawingObservations {
  크기: '소' | '중' | '대';
  위치: string;
  필압: '약' | '보통' | '강';
  수정횟수: number;
  세부요소: number;
  착수지연_sec: number;
}

export interface DrawingBlock {
  axes: Record<DrawingAxisKey, number> | null;
  observations: DrawingObservations | null;
  arousal_peaks: string[];
  future_sketch: string | null;
  quality: Quality;
}

export interface NarrativeDimensions {
  주도성: number;
  관계성: number;
  낙관: number;
}

export interface DialogueTurnBlock {
  q: number;
  topic: string;
  transcript: string;
  latency_sec: number | null;
  words: number;
  content_valence: number | null;
  arousal_z: number | null;
  mismatch: number | null;
  서사차원?: NarrativeDimensions;
}

export interface CrossCheckBlock {
  gaze_vs_speech_riasec: {
    gaze_top: RiasecType | null;
    speech_top: RiasecType | null;
    agree: boolean | null;
  };
}

export interface LlmInput {
  session_id: string;
  baseline: BaselineBlock;
  calm_phase: CalmPhaseBlock;
  gaze: GazeBlock;
  drawing: DrawingBlock;
  dialogue: DialogueTurnBlock[];
  cross_check: CrossCheckBlock;
}
