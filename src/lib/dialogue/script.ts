/**
 * 상세기획안.md 부록 B — 대화 스크립트 템플릿
 * CCI(Career Construction Interview) + LSI(Life Story Interview II)를
 * 부스용(2분 30초)으로 축약한 5문항 구성.
 */

export interface DialogueQuestion {
  q: number; // 0~4
  topic: string; // '발화 baseline' | '역할모델' | '선호 매체' | '좌우명' | '다음 챕터'
  source: string; // '— (자체)' | 'CCI Q1 (역할모델)' 등 부록 B '출처' 열
  prompt: string; // 낭독 문항 (따옴표 없이 본문만)
  reads: string; // '읽어내는 것' 열
  bioPoint: string; // '생체 측정 포인트' 열
  /** q=0은 baseline이라 해석에 쓰지 않음 */
  isBaseline: boolean;
  /** LSI 서사차원 코딩 대상 여부 (q=4만 true) */
  narrative: boolean;
}

export const DIALOGUE_QUESTIONS: DialogueQuestion[] = [
  {
    q: 0,
    topic: '발화 baseline',
    source: '— (자체)',
    prompt: '오늘 여기까지 어떻게 오셨어요?',
    reads: '답변 내용은 해석하지 않음',
    bioPoint:
      '발화 baseline. 말하는 행위 자체가 심박·GSR을 올리므로, 이 구간을 기준선으로 삼아 1~4번의 반응에서 차감',
    isBaseline: true,
    narrative: false,
  },
  {
    q: 1,
    topic: '역할모델',
    source: 'CCI Q1 (역할모델)',
    prompt: '자라면서 닮고 싶었던 사람이 있나요? 누구였고, 어떤 점을 닮고 싶었나요?',
    reads: '자기개념(self-construct) — 되고 싶은 나를 형용사로 진술',
    bioPoint: '형용사 발화 시점의 SCR. 각성이 큰 형용사 = 핵심 자기상',
    isBaseline: false,
    narrative: false,
  },
  {
    q: 2,
    topic: '선호 매체',
    source: 'CCI Q2 (선호 매체)',
    prompt: '요즘 시간 가는 줄 모르고 보게 되는 콘텐츠나 채널이 있나요?',
    reads: '선호 환경 — RIASEC 환경 축',
    bioPoint:
      'Session 1 시선 RIASEC 결과와 교차검증. 말과 시선이 다른 유형을 가리키면 불일치 후보',
    isBaseline: false,
    narrative: false,
  },
  {
    q: 3,
    topic: '좌우명',
    source: 'CCI Q4 (좌우명)',
    prompt: '좋아하는 문장이나, 힘들 때 스스로에게 자주 하는 말이 있나요?',
    reads: '스트레스 대처 전략, 자기 조언',
    bioPoint: '문장 인출까지의 지연시간. 길수록 대처 자원이 언어화되어 있지 않음',
    isBaseline: false,
    narrative: false,
  },
  {
    q: 4,
    topic: '다음 챕터',
    source: 'LSI (다음 챕터)',
    prompt:
      '인생이 한 권의 책이라면, 다음 챕터의 제목은 무엇일까요? 10년 뒤 그 챕터에서 당신은 어떤 하루를 보내고 있나요?',
    reads: '서사 정체성 — 주도성 / 관계성 / 낙관',
    bioPoint:
      "대주제 \"더 기대되는 내일\"과 직결. Session 2의 '10년 뒤 나의 하루' 스케치와 대조",
    isBaseline: false,
    narrative: true,
  },
];

/** 문항당 타이밍(초). 부록 B '진행 타이밍': 낭독 5초 → 응답 20초 → 회복 5초 */
export interface DialogueTiming {
  read: number;
  answer: number;
  recover: number;
}
export const DIALOGUE_TIMING_FULL: DialogueTiming = { read: 5, answer: 20, recover: 5 };
/** 3분 압축 모드 */
export const DIALOGUE_TIMING_COMPACT: DialogueTiming = { read: 3, answer: 12, recover: 3 };
/** 압축 모드에서 쓸 문항 — 부록 B의 "시간이 부족하면 문항 3을 우선 생략" 규칙 준수 */
export const COMPACT_QUESTION_IDS = [0, 1, 2, 4] as const;

/** 부록 B 진행자 가이드 — 진행자 대시보드에 표시 */
export const OPERATOR_GUIDE: string[] = [
  '반응은 중립적으로만: "네", "그렇군요" 정도. 평가·조언·공감 과잉은 상대의 각성을 오염시킴',
  '추가 질문(프로브)은 문항당 1회만, 정해진 문장으로: "조금만 더 말씀해 주실 수 있나요?"',
  '답을 못 하면 10초 뒤 다음 문항으로. 무응답 자체를 `NR`로 기록',
  '낭독 속도·억양을 문항 간 동일하게 유지 (진행자가 바뀌면 낭독을 음성 AI로 통일하는 편이 낫다)',
];

/** 부록 B 윤리 가드레일 — 체험 전 고지 화면에 표시 */
export const ETHICS_GUARDRAILS: string[] = [
  '트라우마·상실·질병·가족 갈등을 직접 묻는 문항은 넣지 않는다 (AAI 등 임상 면담 문항 배제)',
  '체험 전 고지: 이 대화는 상담·진단이 아니며, 언제든 답을 건너뛰거나 중단할 수 있다',
  '중단 규칙: 참가자가 불편을 표현하거나, GSR이 급등한 뒤 30초간 회복되지 않으면 진행자가 즉시 다음 문항으로 넘기거나 세션을 종료',
  '발화 녹음은 텍스트 변환 후 즉시 파기, 원본 음성은 저장하지 않는다',
];
