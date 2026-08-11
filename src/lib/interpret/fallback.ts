import type { RiasecType, TraitKey } from '@/lib/stimuli/pairs';
import { MISMATCH_THRESHOLD, topMismatch } from '@/lib/features/dialogue';
import type { LlmInput } from '@/lib/features/schema';
import type { BioReceipt } from './schema';

/**
 * 규칙 기반 해석 — API 키가 없거나 두 번 실패했을 때의 폴백.
 *
 * "데모가 키에 인질로 잡히면 안 된다"(CLAUDE.md)를 코드로 지키는 자리다.
 * 심사위원이 키 없이 URL만 열어도 영수증은 끝까지 나온다.
 *
 * LLM판보다 문장이 뻣뻣하지만 **규칙은 똑같이 지킨다**:
 * 근거 없는 문장을 만들지 않고, 결측 축은 건너뛰고, 단정하지 않고,
 * mismatch가 임계 미만이면 hidden_finding을 null로 둔다.
 */

const RIASEC_LABEL: Record<RiasecType, string> = {
  R: '손으로 다루는 일',
  I: '파고들어 알아내는 일',
  A: '표현하고 만들어내는 일',
  S: '사람을 돌보고 가르치는 일',
  E: '설득하고 이끄는 일',
  C: '정리하고 체계를 세우는 일',
};

/** 유형별 추천 — 한국에서 실제로 접근 가능한 대상만 (부록 C 추천 규칙) */
const RECO: Record<RiasecType, { 직업: string; 커뮤니티: string; 활동: string; 취미: string }> = {
  R: { 직업: '제품 설계', 커뮤니티: '동네 목공방', 활동: '주말 자전거 라이딩', 취미: '가구 수리' },
  I: { 직업: '데이터 분석', 커뮤니티: '소규모 독서 모임', 활동: '이른 아침 산책', 취미: '필름 사진' },
  A: { 직업: '콘텐츠 기획', 커뮤니티: '드로잉 클래스', 활동: '동네 전시 관람', 취미: '수채 스케치' },
  S: { 직업: '교육 프로그램 운영', 커뮤니티: '지역 봉사 모임', 활동: '함께 걷는 러닝크루', 취미: '베이킹 나눔' },
  E: { 직업: '서비스 기획', 커뮤니티: '사이드 프로젝트 모임', 활동: '주 1회 발표 스터디', 취미: '팟캐스트 녹음' },
  C: { 직업: '운영 관리', 커뮤니티: '기록·정리 스터디', 활동: '주간 회고 30분', 취미: '노트 정리' },
};

const TRAIT_SENTENCE: Record<TraitKey, { pos: string; neg: string }> = {
  개방성: {
    pos: '익숙한 것보다 새로운 화면에 시선이 먼저 갔습니다.',
    neg: '낯선 것보다 익숙한 화면에 오래 머물렀습니다.',
  },
  사회적_에너지: {
    pos: '북적이는 장면 쪽에 시선이 더 오래 머물렀습니다.',
    neg: '군중보다 혼자만의 공간에 시선이 먼저 갔습니다.',
  },
  환경_가치: {
    pos: '도시보다 자연 쪽 화면에 오래 머물렀습니다.',
    neg: '자연보다 도시의 불빛 쪽에 시선이 갔습니다.',
  },
  모험_가치: {
    pos: '안정된 장면보다 위험이 있는 장면을 오래 봤습니다.',
    neg: '위험한 장면보다 아늑한 쪽에 시선이 머물렀습니다.',
  },
  소비_가치: {
    pos: '단순한 공간보다 화려한 쪽에 시선이 갔습니다.',
    neg: '화려한 공간보다 단순한 쪽에 시선이 갔습니다.',
  },
  무질서_회피: {
    pos: '어수선한 화면보다 정돈된 쪽을 오래 봤습니다.',
    neg: '정돈된 화면보다 어수선한 쪽에 시선이 갔습니다.',
  },
};

/** 이 값보다 약한 축은 "경향이 있었다"고 말할 근거가 없다 */
const TRAIT_MIN = 0.25;

function topTraits(traits: Record<TraitKey, number> | null, n: number): [TraitKey, number][] {
  if (!traits) return [];
  return (Object.entries(traits) as [TraitKey, number][])
    .filter(([, v]) => Math.abs(v) >= TRAIT_MIN)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, n);
}

function topTypes(riasec: Record<RiasecType, number> | null, n: number): RiasecType[] {
  if (!riasec) return [];
  return (Object.entries(riasec) as [RiasecType, number][])
    .filter(([, v]) => v > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t);
}

function personaName(types: RiasecType[], traits: [TraitKey, number][]): string {
  const social = traits.find(([k]) => k === '사회적_에너지');
  const prefix =
    social === undefined ? '' : social[1] < 0 ? '조용한 ' : '함께하는 ';
  const core: Record<RiasecType, string> = {
    R: '만드는 사람',
    I: '관찰자',
    A: '표현가',
    S: '동행자',
    E: '추진가',
    C: '설계자',
  };
  const base = types.length > 0 ? core[types[0]] : '관찰자';
  const name = `${prefix}${base}`;
  return name.length <= 12 ? name : base;
}

function cut(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * 규칙 기반 bio-receipt.
 * 반환값은 BioReceiptSchema를 그대로 만족한다 (호출부에서 다시 검증한다).
 */
export function ruleBasedReceipt(input: LlmInput): BioReceipt {
  const types = topTypes(input.gaze.riasec, 2);
  const traits = topTraits(input.gaze.traits, 3);
  const gazeUsable = input.gaze.quality !== 'missing';

  const evidence: BioReceipt['evidence'] = [];
  const summary: string[] = [];

  // ── 무의식 요약: 근거가 있는 축만 문장으로 만든다 ──
  if (gazeUsable) {
    for (const [key, v] of traits) {
      const s = v > 0 ? TRAIT_SENTENCE[key].pos : TRAIT_SENTENCE[key].neg;
      summary.push(cut(s, 48));
      evidence.push({ claim: s, source: `gaze.traits.${key}` });
    }
    if (types.length > 0) {
      const s = `${RIASEC_LABEL[types[0]]}에 시선이 가장 오래 머물렀습니다.`;
      summary.push(cut(s, 48));
      evidence.push({ claim: s, source: `gaze.riasec.${types[0]}` });
    }
  }

  if (input.calm_phase.reached && input.calm_phase.settle_time_sec !== null) {
    const s = `호흡을 맞추자 ${input.calm_phase.settle_time_sec}초 만에 신호가 가라앉았습니다.`;
    summary.push(cut(s, 48));
    evidence.push({ claim: s, source: 'calm_phase.settle_time_sec' });
  }

  if (summary.length < 2 && input.baseline.quality !== 'missing' && input.baseline.hr_mean !== null) {
    const s = `오늘의 평균 심박은 ${input.baseline.hr_mean}bpm이었습니다.`;
    summary.push(cut(s, 48));
    evidence.push({ claim: s, source: 'baseline.hr_mean' });
  }

  // 그래도 두 줄이 안 되면 측정 사실 자체만 말한다. 없는 성향을 지어내지 않는다.
  // 스키마가 최소 2줄을 요구하므로 서로 다른 문장이 두 개 필요하다 —
  // 같은 문장을 반복해 채우면 영수증이 고장 난 것처럼 보인다.
  const FILLERS = [
    '오늘 측정된 신호로는 뚜렷한 방향이 보이지 않았습니다.',
    '신호가 충분히 잡히지 않아 요약할 수 있는 반응이 적습니다.',
  ];
  for (const s of FILLERS) {
    if (summary.length >= 2) break;
    if (summary.includes(s)) continue;
    summary.push(s);
    evidence.push({ claim: s, source: 'gaze.quality' });
  }

  // ── 숨은 발견: 임계를 넘는 불일치가 있을 때만 ──
  const mismatchTurn = topMismatch(input.dialogue);
  const hidden_finding =
    mismatchTurn && mismatchTurn.mismatch !== null
      ? {
          observation: cut(`${mismatchTurn.topic} 이야기에서 말과 몸의 반응이 달랐습니다.`, 60),
          reading: cut('기대와 부담이 함께 있는 주제일 수 있습니다.', 60),
          confidence: (mismatchTurn.mismatch >= 1.2 ? '보통' : '낮음') as '낮음' | '보통',
        }
      : null;
  if (hidden_finding) {
    evidence.push({
      claim: hidden_finding.observation,
      source: `dialogue[q=${mismatchTurn!.q}].mismatch`,
    });
  }

  // ── 추천: 상위 유형 기반. 유형을 모르면 무난한 기본값을 쓰되 근거를 명시한다 ──
  const primary = types[0] ?? 'I';
  const secondary = types[1] ?? primary;
  const src = types.length > 0 ? `gaze.riasec.${primary}` : 'baseline.quality';
  const why = (t: RiasecType) =>
    types.length > 0
      ? cut(`${RIASEC_LABEL[t]}에 시선이 오래 머물렀습니다`, 60)
      : '측정된 축이 뚜렷하지 않아 무난한 쪽으로 제안합니다';

  const recommendations = {
    직업: [{ name: RECO[primary].직업, why: why(primary) }],
    커뮤니티: [{ name: RECO[secondary].커뮤니티, why: why(secondary) }],
    활동: [{ name: RECO[primary].활동, why: why(primary) }],
    취미: [{ name: RECO[secondary].취미, why: why(secondary) }],
  };
  evidence.push({ claim: `${RECO[primary].직업} 추천`, source: src });

  // ── 튜닝 퀘스트: 오늘 안에 할 수 있는 행동 하나 ──
  const socialTrait = input.gaze.traits?.사회적_에너지 ?? 0;
  const quest =
    !gazeUsable
      ? '오늘 저녁, 화면을 끄고 10분만 가만히 앉아보세요.'
      : socialTrait < -0.2
        ? '오늘 저녁, 알림을 끄고 30분만 혼자 걸어보세요.'
        : socialTrait > 0.2
          ? '오늘 안에 한 사람에게 안부 연락을 해보세요.'
          : '오늘 자기 전, 오늘 가장 편했던 순간을 한 줄 적어보세요.';

  const types2 = types.slice(0, 2);
  return {
    persona_name: personaName(types2, traits),
    one_liner: cut(
      types2.length > 0
        ? `${RIASEC_LABEL[types2[0]]}에 오래 머문 하루`
        : '오늘의 반응을 기록한 하루',
      32,
    ),
    unconscious_summary: summary.slice(0, 4),
    hidden_finding,
    recommendations,
    tuning_quest: cut(quest, 60),
    evidence,
    disclaimer: '이 결과는 오늘 측정된 반응의 요약이며 진단이 아닙니다.',
  };
}

/** 폴백 정서가 평정에서도 임계는 동일하게 적용된다 */
export { MISMATCH_THRESHOLD };
