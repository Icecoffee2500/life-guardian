import type { RiasecType, TraitKey } from '@/lib/stimuli/pairs';

/**
 * 가상 페르소나 4종.
 *
 * 시뮬레이션 모드에서 "가상 참가자"를 고르면 이 프로필이 생리 신호·시선·그림·발화를
 * 전부 일관되게 만들어낸다. 페르소나마다 반응 패턴이 달라야 데모가 매번 같은 결과를
 * 뱉지 않는다. (구현계획.md 3.3절 시뮬레이션 패널)
 */

export type PersonaId = 'quiet-investigator' | 'stage-leader' | 'nature-artist' | 'orderly-architect';

/** 생리 파라미터 — SimulatedBioSource가 그대로 사용한다. */
export interface PersonaPhysiology {
  /** 안정 시 평균 심박(bpm) */
  hrBase: number;
  /** 체험 초반(입장 직후) 심박 상승분 — 시간이 지나며 hrBase로 수렴 */
  hrArrivalOffset: number;
  /** 호흡성 동성부정맥(RSA) 진폭(bpm). 클수록 HRV가 높다 */
  rsaAmp: number;
  /** 호흡 주파수(Hz). 0.25Hz = 분당 15회 */
  breathHz: number;
  /** 박동 간격 지터 표준편차(ms) — RMSSD의 주된 원천 */
  rrJitterSd: number;
  /** 토닉 피부전도 수준(µS) */
  sclBase: number;
  /** 세션 동안의 완만한 SCL 표류(µS/분) */
  sclDrift: number;
  /** 이벤트당 SCR 진폭 배율. 클수록 잘 놀란다 */
  scrGain: number;
  /** SCR 회복 시상수(초). 클수록 오래 남는다 */
  scrDecaySec: number;
  /** 각성 시 심박 상승 최대치(bpm) */
  hrReactivity: number;
  /** 베이스라인 수렴 속도 배율(1이 표준). 클수록 빨리 안정된다 */
  settleRate: number;
}

/** 그림 세션 자동 재현용 프로필 */
export interface PersonaDrawing {
  /** 캔버스 면적 대비 그림 비율(0~1) */
  sizeRatio: number;
  /** 무게중심 (0~1, 0.5가 중앙) */
  centroid: { x: number; y: number };
  /** 평균 필압(0~1) */
  pressure: number;
  /** 지움·덧칠 횟수 */
  corrections: number;
  /** 부가 세부 요소 수 */
  details: number;
  /** 착수까지의 지연(초) */
  onsetDelaySec: number;
  /** 뿌리/줄기/수관 표현 유무 */
  structure: { root: boolean; trunk: boolean; crown: boolean };
  /** '10년 뒤 나의 하루' 스케치 한 줄 요약 */
  futureSketch: string;
  /** 각성이 올라간 구간 서술 */
  arousalPeaks: string[];
}

/** 대화 세션 자동 재현용 응답 */
export interface PersonaAnswer {
  q: number;
  transcript: string;
  /** 낭독 종료 후 발화 시작까지(초) */
  latencySec: number;
  /** 이 문항에서 예상되는 생체 각성(0~1) — 시뮬레이터 SCR 입력 */
  arousal: number;
}

export interface Persona {
  id: PersonaId;
  name: string;
  /** 한 줄 소개 — 진행자 대시보드에 표시 */
  blurb: string;
  physiology: PersonaPhysiology;
  /** 시선 선호의 근거가 되는 RIASEC 성향 (-1~+1) */
  riasec: Record<RiasecType, number>;
  /** 시선 선호의 근거가 되는 성향 축 (-1~+1) */
  traits: Record<TraitKey, number>;
  /** 시선 판단의 흔들림(0~1). 클수록 선호와 다른 쪽도 자주 본다 */
  gazeNoise: number;
  drawing: PersonaDrawing;
  answers: PersonaAnswer[];
  /** 발화에서 드러나는 RIASEC 최상위 유형 — 교차검증(crosscheck)용 */
  speechTopRiasec: RiasecType;
}

export const PERSONAS: Persona[] = [
  {
    id: 'quiet-investigator',
    name: '조용한 탐구자',
    blurb: '혼자 있는 시간에 가장 선명해지는 사람. 낮은 기저 각성, 높은 HRV.',
    physiology: {
      hrBase: 67,
      hrArrivalOffset: 9,
      rsaAmp: 4.2,
      breathHz: 0.22,
      rrJitterSd: 38,
      sclBase: 4.4,
      sclDrift: 0.05,
      scrGain: 0.7,
      scrDecaySec: 5.5,
      hrReactivity: 7,
      settleRate: 1.2,
    },
    riasec: { R: -0.2, I: 0.85, A: 0.35, S: -0.45, E: -0.7, C: 0.2 },
    traits: {
      개방성: 0.5,
      사회적_에너지: -0.75,
      환경_가치: 0.5,
      모험_가치: -0.4,
      소비_가치: -0.6,
      무질서_회피: 0.55,
    },
    gazeNoise: 0.22,
    drawing: {
      sizeRatio: 0.17,
      centroid: { x: 0.38, y: 0.52 },
      pressure: 0.72,
      corrections: 4,
      details: 2,
      onsetDelaySec: 9,
      structure: { root: true, trunk: true, crown: true },
      futureSketch: '책상 앞에 혼자, 창밖에 나무',
      arousalPeaks: ['뿌리를 그리기 시작할 때'],
    },
    answers: [
      { q: 0, transcript: '지하철 타고 왔어요. 생각보다 금방 도착했습니다.', latencySec: 1.2, arousal: 0.2 },
      {
        q: 1,
        transcript:
          '중학교 때 과학 선생님이요. 모르는 걸 물어보면 같이 찾아봐 주셨어요. 답을 바로 알려주지 않고 기다려 주는 게 좋았습니다. 저도 그렇게 침착한 사람이 되고 싶었어요.',
        latencySec: 2.4,
        arousal: 0.35,
      },
      {
        q: 2,
        transcript:
          '요즘은 다큐멘터리를 자주 봐요. 심해 생물이나 우주 관련한 것들이요. 아무 말 없이 관찰만 하는 장면이 계속 나오는데 그게 편합니다.',
        latencySec: 1.6,
        arousal: 0.25,
      },
      {
        q: 3,
        transcript: '음... 급할수록 천천히, 라는 말을 자주 떠올려요.',
        latencySec: 6.9,
        arousal: 0.4,
      },
      {
        q: 4,
        transcript:
          '다음 챕터라면 조용한 실험실 정도일 것 같아요. 10년 뒤에는 제 이름으로 된 연구를 하나쯤 마무리하고 있으면 좋겠습니다. 사람은 많지 않아도 괜찮아요.',
        latencySec: 4.8,
        arousal: 0.85,
      },
    ],
    speechTopRiasec: 'I',
  },
  {
    id: 'stage-leader',
    name: '무대 위의 리더',
    blurb: '사람 앞에서 에너지가 올라가는 사람. 높은 기저 각성, 빠른 회복.',
    physiology: {
      hrBase: 78,
      hrArrivalOffset: 14,
      rsaAmp: 2.4,
      breathHz: 0.28,
      rrJitterSd: 22,
      sclBase: 6.9,
      sclDrift: 0.12,
      scrGain: 1.35,
      scrDecaySec: 3.2,
      hrReactivity: 13,
      settleRate: 0.85,
    },
    riasec: { R: -0.35, I: -0.2, A: 0.15, S: 0.5, E: 0.9, C: -0.3 },
    traits: {
      개방성: 0.25,
      사회적_에너지: 0.85,
      환경_가치: -0.3,
      모험_가치: 0.55,
      소비_가치: 0.45,
      무질서_회피: -0.15,
    },
    gazeNoise: 0.3,
    drawing: {
      sizeRatio: 0.64,
      centroid: { x: 0.56, y: 0.44 },
      pressure: 0.88,
      corrections: 1,
      details: 7,
      onsetDelaySec: 2,
      structure: { root: false, trunk: true, crown: true },
      futureSketch: '무대 위, 사람들 앞에서 이야기하는 장면',
      arousalPeaks: ['수관을 크게 넓힐 때'],
    },
    answers: [
      { q: 0, transcript: '차 가지고 왔어요. 오는 길에 회의 하나 하고 왔습니다.', latencySec: 0.7, arousal: 0.25 },
      {
        q: 1,
        transcript:
          '동아리 선배가 있었어요. 사람들 앞에서 말을 정말 잘했습니다. 분위기가 가라앉으면 항상 그 사람이 먼저 입을 열었어요. 그 자신감을 닮고 싶었습니다.',
        latencySec: 1.1,
        arousal: 0.45,
      },
      {
        q: 2,
        transcript:
          '창업가 인터뷰 채널을 자주 봅니다. 누가 어떤 결정을 왜 내렸는지 듣는 게 재미있어요. 라이브 방송도 챙겨 봅니다.',
        latencySec: 0.9,
        arousal: 0.3,
      },
      {
        q: 3,
        transcript: '일단 해보고 고치자. 이 말을 자주 합니다.',
        latencySec: 1.3,
        arousal: 0.2,
      },
      {
        q: 4,
        transcript:
          '다음 챕터 제목은 "내 이름을 건 팀" 정도일 것 같아요. 10년 뒤에는 제가 만든 팀이 잘 굴러가고 있으면 좋겠습니다. 아침에 사람들 만나고 저녁엔 좀 쉬고요.',
        latencySec: 1.8,
        arousal: 0.95,
      },
    ],
    speechTopRiasec: 'E',
  },
  {
    id: 'nature-artist',
    name: '자연을 그리는 사람',
    blurb: '새로움과 풍경에 반응하는 사람. 중간 각성, 느린 회복.',
    physiology: {
      hrBase: 72,
      hrArrivalOffset: 10,
      rsaAmp: 3.6,
      breathHz: 0.2,
      rrJitterSd: 33,
      sclBase: 5.6,
      sclDrift: 0.08,
      scrGain: 1.05,
      scrDecaySec: 7.5,
      hrReactivity: 10,
      settleRate: 1.0,
    },
    riasec: { R: 0.3, I: 0.1, A: 0.9, S: 0.2, E: -0.35, C: -0.65 },
    traits: {
      개방성: 0.85,
      사회적_에너지: -0.15,
      환경_가치: 0.8,
      모험_가치: 0.35,
      소비_가치: -0.7,
      무질서_회피: -0.5,
    },
    gazeNoise: 0.28,
    drawing: {
      sizeRatio: 0.48,
      centroid: { x: 0.47, y: 0.5 },
      pressure: 0.55,
      corrections: 2,
      details: 9,
      onsetDelaySec: 3,
      structure: { root: true, trunk: true, crown: true },
      futureSketch: '작업실 창가, 화분과 스케치북',
      arousalPeaks: ['잎을 하나씩 채워 넣을 때'],
    },
    answers: [
      { q: 0, transcript: '버스 타고 왔어요. 걸어오는 길에 나무를 좀 봤습니다.', latencySec: 1.4, arousal: 0.2 },
      {
        q: 1,
        transcript:
          '삼촌이 사진을 찍으셨어요. 같은 곳을 계절마다 다시 찍는 사람이었습니다. 뭔가를 오래 보는 태도가 좋아 보였어요.',
        latencySec: 2.0,
        arousal: 0.4,
      },
      {
        q: 2,
        transcript:
          '작업 과정을 그냥 보여주는 영상들을 좋아합니다. 도자기 만드는 거나 목공 같은 거요. 말이 없어도 계속 보게 돼요.',
        latencySec: 1.5,
        arousal: 0.3,
      },
      {
        q: 3,
        transcript: '완성보다 계속하는 게 낫다, 이런 말을 스스로 합니다.',
        latencySec: 3.6,
        arousal: 0.35,
      },
      {
        q: 4,
        transcript:
          '"다시 그리는 계절"이요. 10년 뒤에는 작은 작업실에서 아침에 그림 그리고 오후에는 사람들이랑 같이 뭘 만들고 있을 것 같아요.',
        latencySec: 3.1,
        arousal: 0.8,
      },
    ],
    speechTopRiasec: 'A',
  },
  {
    id: 'orderly-architect',
    name: '정돈된 설계자',
    blurb: '무질서에 민감한 사람. 낮은 반응성, 특정 자극에만 큰 SCR.',
    physiology: {
      hrBase: 70,
      hrArrivalOffset: 8,
      rsaAmp: 2.9,
      breathHz: 0.25,
      rrJitterSd: 26,
      sclBase: 5.9,
      sclDrift: 0.06,
      scrGain: 0.85,
      scrDecaySec: 6.0,
      hrReactivity: 8,
      settleRate: 1.1,
    },
    riasec: { R: 0.1, I: 0.45, A: -0.55, S: -0.15, E: -0.1, C: 0.9 },
    traits: {
      개방성: -0.4,
      사회적_에너지: -0.3,
      환경_가치: 0.15,
      모험_가치: -0.65,
      소비_가치: -0.2,
      무질서_회피: 0.9,
    },
    gazeNoise: 0.18,
    drawing: {
      sizeRatio: 0.33,
      centroid: { x: 0.5, y: 0.55 },
      pressure: 0.8,
      corrections: 6,
      details: 3,
      onsetDelaySec: 6,
      structure: { root: true, trunk: true, crown: true },
      futureSketch: '정리된 책상, 일정표가 붙은 벽',
      arousalPeaks: ['줄기의 좌우를 맞추려 다시 지울 때'],
    },
    answers: [
      { q: 0, transcript: '지하철로 왔습니다. 20분 정도 일찍 도착해서 좀 기다렸어요.', latencySec: 1.0, arousal: 0.2 },
      {
        q: 1,
        transcript:
          '아버지요. 뭘 하든 순서를 먼저 정하시는 분이었습니다. 급해 보이는 상황에서도 흔들리지 않는 게 대단해 보였어요.',
        latencySec: 1.9,
        arousal: 0.3,
      },
      {
        q: 2,
        transcript:
          '정리 관련한 영상을 자주 봅니다. 작업 환경 세팅하는 거나 일정 관리하는 방법 같은 거요.',
        latencySec: 1.3,
        arousal: 0.25,
      },
      {
        q: 3,
        transcript: '할 수 있는 것부터, 라고 자주 되뇝니다.',
        latencySec: 2.8,
        arousal: 0.3,
      },
      {
        q: 4,
        transcript:
          '"정리된 다음 장" 정도요. 10년 뒤에는 지금 벌여놓은 걸 하나씩 마무리하고 있을 것 같아요. 새로 벌이는 건 좀 줄이고요.',
        latencySec: 5.4,
        arousal: 0.75,
      },
    ],
    speechTopRiasec: 'C',
  },
];

export const DEFAULT_PERSONA_ID: PersonaId = 'quiet-investigator';

export function getPersona(id: PersonaId): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}
