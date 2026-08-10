import { COMPACT_PAIR_IDS, STIMULUS_PAIRS } from '@/lib/stimuli/pairs';
import {
  COMPACT_QUESTION_IDS,
  DIALOGUE_QUESTIONS,
  DIALOGUE_TIMING_COMPACT,
  DIALOGUE_TIMING_FULL,
} from '@/lib/dialogue/script';

export type SceneId = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8';

/** 체험 모드. 심사 시간이 짧을 것에 대비한 3분 압축 모드를 제공한다. */
export type ExperienceMode = 'full' | 'compact';

export interface SceneDef {
  id: SceneId;
  /** 기획안 Phase 1~4 중 어디에 속하는가 */
  phase: 1 | 2 | 3 | 4;
  /** 상단 진행 표시에 쓰는 짧은 이름 */
  label: string;
  /** 씬 타이틀 */
  title: string;
  /** 한 줄 안내 */
  caption: string;
  /**
   * 자동 진행 시간(초). null이면 사용자의 행동이나 하위 시퀀스 완료로 넘어간다.
   */
  durationSec: (mode: ExperienceMode) => number | null;
}

/** 시선 세션 타이밍 (부록 A: 노출 6초 + 응시점 2초) */
export const GAZE_TIMING = {
  full: { exposureSec: 6, fixationSec: 2 },
  compact: { exposureSec: 3, fixationSec: 1 },
} as const;

/** 그림 세션 타이밍 (기획안 5장: 나무 90초, 10년 뒤 스케치 30초) */
export const DRAW_TIMING = {
  full: { treeSec: 90, futureSec: 30 },
  compact: { treeSec: 20, futureSec: 10 },
} as const;

export function pairsFor(mode: ExperienceMode) {
  if (mode === 'full') return STIMULUS_PAIRS;
  const ids = new Set<number>(COMPACT_PAIR_IDS);
  return STIMULUS_PAIRS.filter((p) => ids.has(p.id));
}

export function questionsFor(mode: ExperienceMode) {
  if (mode === 'full') return DIALOGUE_QUESTIONS;
  const ids = new Set<number>(COMPACT_QUESTION_IDS);
  return DIALOGUE_QUESTIONS.filter((q) => ids.has(q.q));
}

export function dialogueTimingFor(mode: ExperienceMode) {
  return mode === 'full' ? DIALOGUE_TIMING_FULL : DIALOGUE_TIMING_COMPACT;
}

export function gazeDurationSec(mode: ExperienceMode): number {
  const t = GAZE_TIMING[mode];
  return pairsFor(mode).length * (t.exposureSec + t.fixationSec);
}

export function drawDurationSec(mode: ExperienceMode): number {
  const t = DRAW_TIMING[mode];
  return t.treeSec + t.futureSec;
}

export function dialogueDurationSec(mode: ExperienceMode): number {
  const t = dialogueTimingFor(mode);
  return questionsFor(mode).length * (t.read + t.answer + t.recover);
}

export const SCENES: SceneDef[] = [
  {
    id: 'S0',
    phase: 1,
    label: '인트로',
    title: '당신의 몸은 이미 알고 있습니다',
    caption: '10분 동안, 말 대신 몸이 답하게 둡니다.',
    durationSec: () => null,
  },
  {
    id: 'S1',
    phase: 1,
    label: '연결',
    title: '신호를 연결합니다',
    caption: '센서가 없어도 괜찮습니다. 시뮬레이션으로 그대로 진행됩니다.',
    durationSec: () => null,
  },
  {
    id: 'S2',
    phase: 1,
    label: '베이스라인',
    title: '평상시의 당신을 기록합니다',
    caption: '원의 리듬에 호흡을 맞춰 주세요.',
    durationSec: (m) => (m === 'full' ? 60 : 15),
  },
  {
    id: 'S3',
    phase: 2,
    label: '명상',
    title: '잠시 눈을 감아도 좋습니다',
    caption: '심박과 호흡이 가라앉기를 기다립니다.',
    durationSec: (m) => (m === 'full' ? 30 : 10),
  },
  {
    id: 'S4',
    phase: 3,
    label: '시선',
    title: '보기만 하면 됩니다',
    caption: '어느 쪽을 먼저, 오래 보는지가 기록됩니다.',
    durationSec: (m) => gazeDurationSec(m),
  },
  {
    id: 'S5',
    phase: 3,
    label: '그림',
    title: '나무 한 그루를 그려주세요',
    caption: '잘 그릴 필요는 없습니다.',
    durationSec: (m) => drawDurationSec(m),
  },
  {
    id: 'S6',
    phase: 3,
    label: '대화',
    title: '다섯 가지를 여쭙겠습니다',
    caption: '답하기 어려우면 건너뛰어도 됩니다.',
    durationSec: (m) => dialogueDurationSec(m),
  },
  {
    id: 'S7',
    phase: 4,
    label: '리플레이',
    title: '오늘 당신의 몸이 지나온 길',
    caption: '해석이 완성되는 동안 기록을 함께 봅니다.',
    durationSec: (m) => (m === 'full' ? 26 : 12),
  },
  {
    id: 'S8',
    phase: 4,
    label: '결과',
    title: 'bio-receipt',
    caption: '오늘의 관측을 한 장으로 정리했습니다.',
    durationSec: () => null,
  },
];

export const SCENE_ORDER: SceneId[] = SCENES.map((s) => s.id);

export function sceneDef(id: SceneId): SceneDef {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}

export function nextScene(id: SceneId): SceneId | null {
  const i = SCENE_ORDER.indexOf(id);
  return i >= 0 && i < SCENE_ORDER.length - 1 ? SCENE_ORDER[i + 1] : null;
}

export function prevScene(id: SceneId): SceneId | null {
  const i = SCENE_ORDER.indexOf(id);
  return i > 0 ? SCENE_ORDER[i - 1] : null;
}

/**
 * 타이머가 없는 씬(인트로·연결·결과)에서 실제로 소요되는 시간.
 * 리허설 실측 전까지의 추정치이며, 안내 문구의 "약 N분"에만 쓴다.
 */
const UNTIMED_OVERHEAD_SEC: Record<ExperienceMode, number> = { full: 130, compact: 45 };

/** 전체 체험 예상 소요시간(초) */
export function totalDurationSec(mode: ExperienceMode): number {
  return (
    SCENES.reduce((sum, s) => sum + (s.durationSec(mode) ?? 0), 0) +
    UNTIMED_OVERHEAD_SEC[mode]
  );
}

/** 세션 ID — 부록 C 형식(YYYYMMDD-A-NNN)을 따른다 */
export function makeSessionId(seq?: number): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const n = seq ?? Math.floor(Math.random() * 1000);
  return `${y}${m}${day}-A-${String(n % 1000).padStart(3, '0')}`;
}
