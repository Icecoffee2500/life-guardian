import type { DialogueTurn } from '@/lib/session/recorder';
import { clamp, mean, round, scrAmplitude, sd, slice, zscore, type TimePoint } from './signal';
import type { DialogueTurnBlock, NarrativeDimensions } from './schema';

/**
 * 대화 세션 특징 추출.
 *
 * 기획안 부록 B '코딩 → LLM 입력 형식' 표를 그대로 코드화한다.
 * 이 세션의 핵심 산출물은 **불일치 지수**다:
 *   |내용 정서가 − 생체 각성|
 * 긍정적으로 말했는데 각성이 크게 뜬 지점이 '나도 몰랐던 나' 문장을 만든다.
 *
 * 내용 정서가(content_valence)는 여기서 계산하지 않는다. 발화 텍스트만 보고
 * 별도 호출로 먼저 평정한 값을 받아 넣는다(부록 C). 호출이 불가능하면
 * 규칙 기반 평정으로 대체한다.
 */

/** 이 이하의 불일치는 hidden_finding으로 다루지 않는다 (부록 C 시스템 프롬프트) */
export const MISMATCH_THRESHOLD = 0.5;

/** 어절 수 — 한국어는 공백 단위가 어절에 가깝다 */
export function wordCount(transcript: string): number {
  const t = transcript.trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

export interface TurnArousal {
  q: number;
  /** 응답 구간의 SCR 진폭 (µS) */
  scr: number;
  /** 응답 구간 평균 심박 − 문항 직전 평균 심박 (bpm) */
  hrDelta: number;
  /** 두 지표를 합친 원시 각성 */
  raw: number;
}

/**
 * 문항별 생체 각성.
 *
 * 발화 시작 시점을 마커로 삼는다. 낭독 종료 시점을 쓰면 "말하기 시작하는 행위"의
 * 각성이 문항 내용의 각성과 섞인다. 무응답이면 응답 구간 시작을 마커로 쓴다.
 */
export function turnArousal(turn: DialogueTurn, gsr: TimePoint[], hr: TimePoint[]): TurnArousal {
  const marker = turn.speechStartT ?? turn.readEndT;
  const scr = scrAmplitude(gsr, marker);

  const before = slice(hr, turn.readEndT - 6000, turn.readEndT);
  const during = slice(hr, marker, turn.endT);
  const hrDelta =
    before.length > 3 && during.length > 3
      ? mean(during.map((p) => p.v)) - mean(before.map((p) => p.v))
      : 0;

  // SCR(µS)과 심박 변화(bpm)는 단위가 다르다. 대략 같은 크기가 되도록 맞춘 뒤 합친다.
  const raw = (isFinite(scr) ? scr : 0) * 1.6 + hrDelta * 0.12;

  return { q: turn.q, scr: isFinite(scr) ? round(scr, 3) : 0, hrDelta: round(hrDelta, 2), raw };
}

/**
 * 각성의 z-score.
 *
 * 부록 B의 규정은 "**문항 0 대비** SCR 진폭·심박 변화의 z-score"다.
 * 중심은 문항 0이지, 문항들의 평균이 아니다. 이 구분이 결과를 통째로 바꾼다.
 *
 * 문항 평균을 중심으로 잡으면, 문항이 3~4개뿐인 부스 스케일에서는 조용했던 문항이
 * 자동으로 큰 음수 z를 받는다. 그러면 |정서가 − 각성|이 커지면서
 * "차분하게 좋은 말을 한 문항"이 최대 불일치로 뽑힌다 — 잡으려던 것의 정반대다.
 *
 * 기준선을 중심에 두면 0은 "말하는 행위 자체와 다르지 않았다"는 뜻이 되고,
 * 양수만이 "이 문항에서 몸이 더 반응했다"를 의미한다.
 *
 * 문항이 둘뿐이라 산포를 못 구하면 0으로 둔다(없는 신호를 만들지 않는다).
 */
export function arousalZScores(arousals: TurnArousal[]): Map<number, number> {
  const baseline = arousals.find((a) => a.q === 0)?.raw ?? 0;
  const rest = arousals.filter((a) => a.q !== 0).map((a) => a.raw);
  const s = rest.length > 1 ? sd(rest) : 0;

  const out = new Map<number, number>();
  for (const a of arousals) {
    // 기준선 문항 자체는 정의상 0
    if (a.q === 0) {
      out.set(a.q, 0);
      continue;
    }
    out.set(a.q, s > 0 ? round(zscore(a.raw, baseline, s)) : 0);
  }
  return out;
}

/**
 * 규칙 기반 정서가 평정 — LLM 호출이 불가능할 때의 폴백.
 *
 * 정교하지 않다. 어휘 몇 개를 세는 수준이고, 반어법이나 문맥을 읽지 못한다.
 * 그래도 부스에서 빈 영수증이 나오는 것보다는 낫다.
 */
const POSITIVE_LEXICON = [
  '좋', '행복', '기대', '재미', '편하', '설레', '감사', '즐겁', '뿌듯', '따뜻',
  '괜찮', '멋있', '대단', '희망', '자유', '평온', '웃',
];
const NEGATIVE_LEXICON = [
  '힘들', '싫', '불안', '무섭', '걱정', '외로', '지치', '답답', '아쉽', '슬프',
  '짜증', '괴로', '부담', '어렵', '막막', '후회', '화나',
];

export function ruleBasedValence(transcript: string): number {
  const t = transcript.trim();
  if (!t) return 0;
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE_LEXICON) if (t.includes(w)) pos++;
  for (const w of NEGATIVE_LEXICON) if (t.includes(w)) neg++;
  if (pos + neg === 0) return 0;
  return round(clamp((pos - neg) / (pos + neg), -1, 1));
}

/**
 * 서사 차원 코딩 (문항 4, LSI 준용).
 * 주도성 / 관계성 / 낙관을 각 1~3점으로. 어휘 기반 근사임을 숨기지 않는다.
 */
const AGENCY_WORDS = ['제가', '내가', '직접', '만들', '시작', '결정', '이끌', '해내', '도전', '주도'];
const COMMUNION_WORDS = ['사람', '함께', '같이', '팀', '가족', '친구', '동료', '나누', '돕', '우리'];
const OPTIMISM_WORDS = ['좋겠', '기대', '설레', '희망', '잘', '나아', '즐겁', '행복', '기다려'];

function tier(hits: number): number {
  return hits === 0 ? 1 : hits <= 2 ? 2 : 3;
}

export function narrativeDimensions(transcript: string): NarrativeDimensions | undefined {
  const t = transcript.trim();
  if (!t) return undefined;
  const count = (ws: string[]) => ws.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  return {
    주도성: tier(count(AGENCY_WORDS)),
    관계성: tier(count(COMMUNION_WORDS)),
    낙관: tier(count(OPTIMISM_WORDS)),
  };
}

export interface DialogueFeatureOptions {
  /** 문항별 내용 정서가. 별도 LLM 호출 결과. 없으면 규칙 기반으로 대체 */
  valences?: Map<number, number>;
}

/** 부록 C의 dialogue 블록을 만든다 */
export function buildDialogueBlocks(
  turns: DialogueTurn[],
  gsr: TimePoint[],
  hr: TimePoint[],
  opts: DialogueFeatureOptions = {},
): DialogueTurnBlock[] {
  const arousals = turns.map((t) => turnArousal(t, gsr, hr));
  const zs = arousalZScores(arousals);

  return turns.map((t) => {
    const words = wordCount(t.transcript);
    const arousal_z = zs.get(t.q) ?? 0;
    const valence = opts.valences?.get(t.q);
    const content_valence =
      t.noResponse || words === 0
        ? null
        : valence !== undefined
          ? round(clamp(valence, -1, 1))
          : ruleBasedValence(t.transcript);

    const latency_sec =
      t.speechStartT === null ? null : round(Math.max(0, t.speechStartT - t.readEndT) / 1000, 1);

    const block: DialogueTurnBlock = {
      q: t.q,
      topic: t.topic,
      transcript: t.transcript,
      latency_sec,
      words,
      content_valence,
      // 기준선 문항(q=0)은 해석에 쓰지 않는다
      arousal_z: t.q === 0 ? null : arousal_z,
      mismatch:
        t.q === 0 || content_valence === null ? null : round(Math.abs(content_valence - arousal_z)),
    };

    if (t.q === 4) {
      const nd = narrativeDimensions(t.transcript);
      if (nd) block.서사차원 = nd;
    }
    return block;
  });
}

/** 불일치가 가장 큰 문항. 임계 미만이면 null (없는 불일치를 만들지 않는다) */
export function topMismatch(blocks: DialogueTurnBlock[]): DialogueTurnBlock | null {
  let best: DialogueTurnBlock | null = null;
  for (const b of blocks) {
    if (b.mismatch === null) continue;
    if (best === null || b.mismatch > (best.mismatch ?? 0)) best = b;
  }
  return best && (best.mismatch ?? 0) >= MISMATCH_THRESHOLD ? best : null;
}
