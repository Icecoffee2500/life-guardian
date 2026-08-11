import { scoreTrial } from '@/lib/features/gaze';
import { round } from '@/lib/features/signal';
import type { SessionRecorder } from '@/lib/session/recorder';
import { STIMULUS_PAIRS } from '@/lib/stimuli/pairs';

/**
 * 예측 퀴즈 — "당신은 당신을 얼마나 알고 있습니까".
 *
 * 이 체험의 주장은 "몸이 당신보다 먼저 안다"이다. 그 주장을 문장으로 읽히는 것과
 * 직접 틀려보는 것은 완전히 다른 경험이다. 그래서 결과를 보여주기 전에 먼저 묻는다.
 * 참가자가 한 문항이라도 틀리는 순간, 뒤에 나올 영수증의 설득력은 우리가 쓴
 * 어떤 카피보다 강해진다.
 *
 * 규칙: **문항은 참가자의 실제 기록에서만 만든다.**
 * 그리고 시뮬레이터가 만들어낸 값(HR·GSR)으로는 묻지 않는다 —
 * 기기가 없는 지금 그건 "당신의 심장"이 아니라 우리의 난수이고,
 * 그걸 맞히라고 하면 이 체험 전체가 거짓말이 된다.
 * 여기서 쓰는 건 전부 참가자 본인의 **행동 타이밍과 시선**이다.
 */

export interface QuizItem {
  id: string;
  question: string;
  options: string[];
  /** options 안의 정답 인덱스 */
  answer: number;
  /** 정답 공개 시 함께 보여줄 실측값 */
  reveal: string;
}

export interface QuizOptions {
  /** 보정을 마친 웹캠 추적으로 시선을 쟀는가. 포인터 프록시면 false. */
  gazeTrusted: boolean;
}

/** 한 화면에 담기는 상한 */
export const MAX_QUIZ_ITEMS = 3;
/** 응답 지연 차이가 이보다 작으면 "가장 오래"라고 물을 수 없다(초) */
const LATENCY_GAP_MIN = 0.4;
/** 체류 편향이 이보다 작으면 어느 쪽을 봤다고 말할 수 없다 */
const DWELL_DEV_MIN = 0.12;

/** 나무 첫 획까지의 망설임 */
function drawLatencyItem(rec: SessionRecorder): QuizItem | null {
  const tree = rec.drawTasks.find((t) => t.id === 'tree');
  const first = tree?.strokes[0]?.points[0];
  if (!tree || !first) return null;

  const sec = Math.max(0, (first.t - tree.startedAt) / 1000);
  return {
    id: 'draw-latency',
    question: '"나무를 그려주세요"를 듣고 첫 획을 긋기까지, 얼마나 걸렸을까요?',
    options: ['1초 안에 바로', '1~3초', '3초 넘게'],
    answer: sec < 1 ? 0 : sec < 3 ? 1 : 2,
    reveal: `실제로는 ${round(sec, 1)}초였습니다`,
  };
}

/** 가장 오래 뜸을 들인 질문 */
function dialogueLatencyItem(rec: SessionRecorder): QuizItem | null {
  const answered = rec.dialogueTurns.filter((t) => t.q !== 0 && t.speechStartT !== null);
  if (answered.length < 3) return null;

  const lat = (t: (typeof answered)[number]) => ((t.speechStartT as number) - t.readEndT) / 1000;
  const byLatency = [...answered].sort((a, b) => lat(b) - lat(a));
  const slowest = byLatency[0];
  // 가장 빠른 두 문항을 오답 보기로 쓴다. 비슷한 것끼리 붙이면 찍기가 되어버린다.
  const fastest = byLatency.slice(-2);
  if (lat(slowest) - lat(fastest[0]) < LATENCY_GAP_MIN) return null;

  const pool = [slowest, ...fastest].sort((a, b) => a.q - b.q);
  return {
    id: 'dialogue-latency',
    question: '어떤 질문 앞에서 가장 오래 뜸을 들였을까요?',
    options: pool.map((t) => t.topic),
    answer: pool.findIndex((t) => t.q === slowest.q),
    reveal: `"${slowest.topic}" — 질문이 끝나고 ${round(lat(slowest), 1)}초 뒤에 입을 열었습니다`,
  };
}

/** 가장 한쪽으로 치우쳐 본 자극쌍 */
function gazeItem(rec: SessionRecorder): QuizItem | null {
  let best: { pairId: number; dwellA: number; dev: number } | null = null;

  for (const trial of rec.gazeTrials) {
    const s = scoreTrial(trial);
    if (s.dwellA === null) continue;
    const dev = Math.abs(s.dwellA - 0.5);
    if (!best || dev > best.dev) best = { pairId: trial.pairId, dwellA: s.dwellA, dev };
  }
  if (!best || best.dev < DWELL_DEV_MIN) return null;

  const pair = STIMULUS_PAIRS.find((p) => p.id === best.pairId);
  if (!pair) return null;

  const pctA = Math.round(best.dwellA * 100);
  const aWon = best.dwellA >= 0.5;
  return {
    id: 'gaze-dwell',
    question: `"${pair.a.label}"과 "${pair.b.label}" — 눈이 더 오래 머문 쪽은 어디였을까요?`,
    options: [pair.a.label, pair.b.label],
    answer: aWon ? 0 : 1,
    reveal: `${aWon ? pctA : 100 - pctA}% 대 ${aWon ? 100 - pctA : pctA}%로 "${
      aWon ? pair.a.label : pair.b.label
    }" 쪽이었습니다`,
  };
}

/**
 * 이번 세션에서 물을 수 있는 문항만 만든다.
 * 물을 것이 없으면 빈 배열이다 — 채우기 위한 문항은 만들지 않는다.
 */
export function buildQuiz(rec: SessionRecorder, opts: QuizOptions): QuizItem[] {
  const items = [
    opts.gazeTrusted ? gazeItem(rec) : null,
    drawLatencyItem(rec),
    dialogueLatencyItem(rec),
  ].filter((x): x is QuizItem => x !== null);

  return items.slice(0, MAX_QUIZ_ITEMS);
}

/** 맞힌 개수 */
export function scoreQuiz(items: QuizItem[], picks: (number | null)[]): number {
  return items.reduce((n, it, i) => n + (picks[i] === it.answer ? 1 : 0), 0);
}

/**
 * 점수 한 줄평.
 *
 * 많이 맞혀도 적게 맞혀도 이 체험의 주장은 같다.
 * "틀렸으니 당신은 자신을 모른다"고 몰아붙이지 않는다 — 윤리 가드레일.
 */
export function quizVerdict(correct: number, total: number): string {
  if (total === 0) return '';
  if (correct === total) return '전부 맞혔습니다. 당신은 자신을 꽤 잘 읽고 있습니다.';
  if (correct === 0) return '모두 빗나갔습니다. 몸은 당신이 기억하는 것과 다르게 움직였습니다.';
  return `${total}개 중 ${correct}개. 나머지는 당신도 모르고 지나간 자리입니다.`;
}
