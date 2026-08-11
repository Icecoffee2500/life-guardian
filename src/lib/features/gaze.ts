import { STIMULUS_PAIRS, type RiasecType, type StimulusPair, type TraitKey } from '@/lib/stimuli/pairs';
import type { GazeTrial } from '@/lib/session/recorder';
import { clampUnit, mean, round, scrAmplitude, sd, slice, zscore, type TimePoint } from './signal';
import type { GazeBlock, HighArousalPair, Quality } from './schema';

/**
 * 시선 세션 특징 추출.
 *
 * 기획안 3장 판정 로직을 그대로 코드화한다:
 *   선호도 = 0.4 × 첫 응시 + 0.6 × 체류시간 비율, 각성 동반 자극은 ×1.3
 * 그 결과를 축별 -1 ~ +1로 정규화한다.
 *
 * LLM은 이 숫자만 본다. 원시 좌표는 넘기지 않는다.
 */

/** 첫 응시 판정 창 — 자극 제시 후 0.5초 */
export const FIRST_FIXATION_MS = 500;
/** 화면 중앙의 무판정 구간. 이 안의 표본은 좌우 어느 쪽으로도 세지 않는다. */
export const CENTER_DEADZONE = 0.06;
/** 이 신뢰도 미만의 시선 표본은 버린다 */
export const MIN_CONFIDENCE = 0.3;
/** 각성 동반 판정 z 임계값 */
export const AROUSAL_Z_THRESHOLD = 1;
/** 각성 동반 자극 가중치 */
export const AROUSAL_WEIGHT = 1.3;
/** 이 비율 미만으로만 유효 표본이 남으면 품질을 낮춘다 */
export const DEGRADED_TRIAL_RATIO = 0.7;

export interface TrialScore {
  pairId: number;
  /** A쪽 선호도 -1 ~ +1. 판정 불가면 null */
  score: number | null;
  /** 첫 응시가 A쪽이었는가. 판정 불가면 null */
  firstOnA: boolean | null;
  /** A쪽 체류 비율 0~1 */
  dwellA: number | null;
  /** 이 시행의 SCR 진폭 (µS) */
  scr: number;
  /** 시행 간 z-score */
  arousalZ: number;
  /** 각성 동반으로 가중되었는가 */
  weighted: boolean;
  /** 더 오래 본 쪽의 라벨 */
  chosenLabel: string | null;
}

function pairById(id: number): StimulusPair | undefined {
  return STIMULUS_PAIRS.find((p) => p.id === id);
}

/**
 * 화면 좌우를 A/B로 되돌린다.
 * flipped면 A가 오른쪽에 있었으므로 x > 0.5가 A쪽이다.
 */
function xIsA(x: number, flipped: boolean): boolean {
  return flipped ? x > 0.5 : x < 0.5;
}

/** 한 시행의 좌우 판정 (각성 가중 전) */
export function scoreTrial(trial: GazeTrial): Omit<TrialScore, 'scr' | 'arousalZ' | 'weighted'> {
  const pair = pairById(trial.pairId);
  const usable = trial.samples.filter((s) => s.c >= MIN_CONFIDENCE);

  // 첫 응시 — 제시 후 0.5초 안의 평균 위치
  const early = usable.filter((s) => s.t - trial.onset <= FIRST_FIXATION_MS);
  const earlyOff = early.filter((s) => Math.abs(s.x - 0.5) > CENTER_DEADZONE);
  const earlyMean = earlyOff.length > 0 ? mean(earlyOff.map((s) => s.x)) : null;
  // 좌우를 오간 끝에 평균이 중앙으로 수렴하면 "먼저 본 쪽"이 있었다고 말할 수 없다.
  // 여기서 억지로 한쪽을 고르면 가중치 0.4가 동전 던지기가 된다.
  const firstOnA =
    earlyMean !== null && Math.abs(earlyMean - 0.5) > CENTER_DEADZONE
      ? xIsA(earlyMean, trial.flipped)
      : null;

  // 체류 — 중앙 무판정 구간 밖의 표본만 센다
  const off = usable.filter((s) => Math.abs(s.x - 0.5) > CENTER_DEADZONE);
  const aCount = off.filter((s) => xIsA(s.x, trial.flipped)).length;
  const dwellA = off.length > 0 ? aCount / off.length : null;

  if (firstOnA === null && dwellA === null) {
    return { pairId: trial.pairId, score: null, firstOnA, dwellA, chosenLabel: null };
  }

  // 판정 불가한 항목은 0(중립)으로 두고 나머지 가중치만 살린다
  const firstTerm = firstOnA === null ? 0 : firstOnA ? 1 : -1;
  const dwellTerm = dwellA === null ? 0 : dwellA * 2 - 1;
  const score = clampUnit(0.4 * firstTerm + 0.6 * dwellTerm);

  const chosenLabel =
    pair && dwellA !== null ? (dwellA >= 0.5 ? pair.a.label : pair.b.label) : null;

  return { pairId: trial.pairId, score, firstOnA, dwellA, chosenLabel };
}

/**
 * 시행 전체를 점수화한다.
 * SCR은 시행 간 z-score로 표준화한다 — 절대 진폭은 개인차가 커서 비교 불가능하다.
 */
export function scoreTrials(trials: GazeTrial[], gsr: TimePoint[]): TrialScore[] {
  const base = trials.map((t) => ({
    ...scoreTrial(t),
    scr: scrAmplitude(gsr, t.onset),
  }));

  const valid = base.map((b) => b.scr).filter((v) => isFinite(v));
  const m = valid.length > 0 ? mean(valid) : 0;
  const s = valid.length > 1 ? sd(valid) : 0;

  return base.map((b) => {
    const arousalZ = isFinite(b.scr) ? zscore(b.scr, m, s) : 0;
    const weighted = arousalZ >= AROUSAL_Z_THRESHOLD && b.score !== null;
    return {
      ...b,
      scr: isFinite(b.scr) ? b.scr : 0,
      arousalZ: round(arousalZ),
      weighted,
      score: b.score === null ? null : clampUnit(b.score * (weighted ? AROUSAL_WEIGHT : 1)),
    };
  });
}

const RIASEC_TYPES: RiasecType[] = ['R', 'I', 'A', 'S', 'E', 'C'];
const TRAIT_KEYS: TraitKey[] = [
  '개방성',
  '사회적_에너지',
  '환경_가치',
  '모험_가치',
  '소비_가치',
  '무질서_회피',
];

/** 시행 점수를 RIASEC 6축·성향 6축으로 접는다 */
export function foldAxes(scores: TrialScore[]): {
  riasec: Record<RiasecType, number> | null;
  traits: Record<TraitKey, number> | null;
} {
  const riasecSum: Record<string, number> = {};
  const riasecN: Record<string, number> = {};
  const traitSum: Record<string, number> = {};
  const traitN: Record<string, number> = {};

  for (const s of scores) {
    if (s.score === null) continue;
    const pair = pairById(s.pairId);
    if (!pair) continue;
    if (pair.axis.kind === 'riasec') {
      // A쪽 선호는 a유형 +, b유형 −
      const { a, b } = pair.axis;
      riasecSum[a] = (riasecSum[a] ?? 0) + s.score;
      riasecN[a] = (riasecN[a] ?? 0) + 1;
      riasecSum[b] = (riasecSum[b] ?? 0) - s.score;
      riasecN[b] = (riasecN[b] ?? 0) + 1;
    } else {
      const { trait, positive } = pair.axis;
      const v = positive === 'a' ? s.score : -s.score;
      traitSum[trait] = (traitSum[trait] ?? 0) + v;
      traitN[trait] = (traitN[trait] ?? 0) + 1;
    }
  }

  const anyRiasec = RIASEC_TYPES.some((t) => (riasecN[t] ?? 0) > 0);
  const anyTrait = TRAIT_KEYS.some((k) => (traitN[k] ?? 0) > 0);

  const riasec = anyRiasec
    ? (Object.fromEntries(
        RIASEC_TYPES.map((t) => [
          t,
          round(riasecN[t] ? clampUnit(riasecSum[t] / riasecN[t]) : 0),
        ]),
      ) as Record<RiasecType, number>)
    : null;

  const traits = anyTrait
    ? (Object.fromEntries(
        TRAIT_KEYS.map((k) => [k, round(traitN[k] ? clampUnit(traitSum[k] / traitN[k]) : 0)]),
      ) as Record<TraitKey, number>)
    : null;

  return { riasec, traits };
}

/** RIASEC 상위 유형 (동점이면 사전순 우선) */
export function topRiasec(riasec: Record<RiasecType, number> | null): RiasecType | null {
  if (!riasec) return null;
  let best: RiasecType | null = null;
  for (const t of RIASEC_TYPES) {
    if (best === null || riasec[t] > riasec[best]) best = t;
  }
  // 전부 0이면 "상위 유형"이라고 말할 근거가 없다
  return best !== null && Math.abs(riasec[best]) > 0.05 ? best : null;
}

export interface GazeFeatureOptions {
  /** 시선 소스가 실제 아이트래커가 아니면 품질을 낮춰 전달한다 */
  degraded?: boolean;
}

/** 부록 C의 gaze 블록을 만든다 */
export function buildGazeBlock(
  trials: GazeTrial[],
  gsr: TimePoint[],
  opts: GazeFeatureOptions = {},
): { block: GazeBlock; scores: TrialScore[] } {
  const scores = scoreTrials(trials, gsr);
  const scored = scores.filter((s) => s.score !== null);
  const { riasec, traits } = foldAxes(scores);

  const high_arousal_pairs: HighArousalPair[] = scores
    .filter((s) => s.arousalZ >= AROUSAL_Z_THRESHOLD && s.chosenLabel)
    .sort((a, b) => b.arousalZ - a.arousalZ)
    .slice(0, 3)
    .map((s) => ({ pair: s.pairId, 선택: s.chosenLabel as string, arousal_z: s.arousalZ }));

  let quality: Quality = 'ok';
  if (trials.length === 0 || scored.length === 0) quality = 'missing';
  else if (opts.degraded || scored.length / trials.length < DEGRADED_TRIAL_RATIO)
    quality = 'degraded';

  return {
    block: {
      riasec: quality === 'missing' ? null : riasec,
      traits: quality === 'missing' ? null : traits,
      high_arousal_pairs: quality === 'missing' ? [] : high_arousal_pairs,
      quality,
    },
    scores,
  };
}

/** 리플레이 씬에서 쓰는 시행별 요약 */
export function trialWindow(trial: GazeTrial, gsr: TimePoint[]): TimePoint[] {
  return slice(gsr, trial.onset, trial.offset);
}
