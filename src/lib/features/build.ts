import type { SessionRecorder } from '@/lib/session/recorder';
import type { RiasecType } from '@/lib/stimuli/pairs';
import { buildBaselineBlock, buildCalmPhaseBlock } from './baseline';
import { buildCrossCheckBlock } from './crosscheck';
import { buildDialogueBlocks } from './dialogue';
import { buildDrawingBlock } from './drawing';
import { buildGazeBlock, topRiasec, type TrialScore } from './gaze';
import type { LlmInput } from './schema';

/**
 * 부록 C Input JSON 조립.
 *
 * 여기까지가 "코드가 하는 일"의 끝이다. 이 함수가 만든 JSON 하나만 LLM에 넘어가고,
 * 원시 신호(수만 개의 표본)는 브라우저 밖으로 나가지 않는다.
 */

export interface BuildOptions {
  sessionId: string;
  /** S2·S3에서의 안정 수렴 결과 */
  settled: boolean;
  settleTimeSec: number | null;
  /** 시선이 실기기가 아닌 프록시(포인터·시뮬레이션)인가 */
  gazeDegraded?: boolean;
  /** 필압이 실제 스타일러스 값인가 */
  pressureTrusted?: boolean;
  /** '10년 뒤 나의 하루' 언어 서술 (가상 참가자 모드에서만 있음) */
  futureSketch?: string | null;
  /** 발화 RIASEC 유형 (가상 참가자 모드에서만 있음) */
  speechTopOverride?: RiasecType | null;
  /** 문항별 내용 정서가 (별도 LLM 호출 결과) */
  valences?: Map<number, number>;
  /** 베이스라인 구간 이름 — 기본은 S2 */
  baselineScene?: string;
}

export interface BuiltInput {
  input: LlmInput;
  /** 리플레이 씬이 쓰는 시행별 점수 (LLM에는 넘기지 않는다) */
  gazeScores: TrialScore[];
}

export function buildLlmInput(recorder: SessionRecorder, opts: BuildOptions): BuiltInput {
  const baselineSpan = recorder.spanOf(opts.baselineScene ?? 'S2');

  const baseline = buildBaselineBlock(recorder.hr, recorder.rr, recorder.gsr, baselineSpan);
  const calm_phase = buildCalmPhaseBlock(opts.settled, opts.settleTimeSec);

  const { block: gaze, scores: gazeScores } = buildGazeBlock(recorder.gazeTrials, recorder.gsr, {
    degraded: opts.gazeDegraded,
  });

  const { block: drawing } = buildDrawingBlock(
    recorder.drawTasks,
    recorder.gsr,
    recorder.structureCheck,
    { pressureTrusted: opts.pressureTrusted, futureSketch: opts.futureSketch },
  );

  const dialogue = buildDialogueBlocks(recorder.dialogueTurns, recorder.gsr, recorder.hr, {
    valences: opts.valences,
  });

  const cross_check = buildCrossCheckBlock(topRiasec(gaze.riasec), dialogue, {
    speechTopOverride: opts.speechTopOverride,
  });

  return {
    input: {
      session_id: opts.sessionId,
      baseline,
      calm_phase,
      gaze,
      drawing,
      dialogue,
      cross_check,
    },
    gazeScores,
  };
}
