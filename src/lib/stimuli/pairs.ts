/**
 * 상세기획안.md 부록 A — 자극 사진쌍 리스트 (총 12쌍)
 * Group 1: 직업 성향 축 (RIASEC, 1~6번) / Group 2: 성향·가치 축 (7~12번)
 * 실제 사진은 미확정이므로 src는 전부 null, 플레이스홀더 렌더링에는 motif/keyword를 쓴다.
 */

/** 자극쌍이 기여하는 축 */
export type StimulusAxis =
  | { kind: 'riasec'; a: RiasecType; b: RiasecType } // A를 보면 a유형 +, B를 보면 b유형 +
  | { kind: 'trait'; trait: TraitKey; positive: 'a' | 'b' }; // positive 쪽을 보면 해당 축 +

export type RiasecType = 'R' | 'I' | 'A' | 'S' | 'E' | 'C';

export type TraitKey =
  | '개방성'
  | '사회적_에너지'
  | '환경_가치'
  | '모험_가치'
  | '소비_가치'
  | '무질서_회피';

export interface StimulusImage {
  /** 화면에 표시할 한국어 라벨 (기획안 표의 '이미지 A/B' 문구 그대로) */
  label: string;
  /** 이미지 파일 경로. 실제 사진 확정 전이므로 지금은 null */
  src: string | null;
  /** 플레이스홀더 렌더링용 검색 키워드 (기획안 '후보 검색 키워드') */
  keyword: string;
  /** 플레이스홀더 일러스트 모티프 식별자 */
  motif: StimulusMotif;
}

export type StimulusMotif =
  | 'workshop'
  | 'caregiving'
  | 'laboratory'
  | 'stage'
  | 'art-studio'
  | 'spreadsheet'
  | 'woodworking'
  | 'clinic'
  | 'whiteboard'
  | 'handshake'
  | 'instrument'
  | 'archive'
  | 'abstract-painting'
  | 'classical-painting'
  | 'crowd'
  | 'cabin'
  | 'mountain'
  | 'city-night'
  | 'cliff'
  | 'living-room'
  | 'luxury'
  | 'minimal'
  | 'messy-desk'
  | 'tidy-desk';

export interface StimulusPair {
  id: number; // 1~12, 부록 A의 # 그대로
  group: 1 | 2; // Group 1 직업(RIASEC) / Group 2 성향·가치
  axisLabel: string; // 부록 A '축' 열 그대로 (예: 'R ↔ S', '개방성')
  a: StimulusImage;
  b: StimulusImage;
  axis: StimulusAxis;
  source: string; // 부록 A '출처' 열
  intent: string; // 부록 A '측정 의도' 열
}

export const STIMULUS_PAIRS: StimulusPair[] = [
  // ── Group 1: 직업 성향 축 (RIASEC) ──
  {
    id: 1,
    group: 1,
    axisLabel: 'R ↔ S',
    a: {
      label: '공구를 다루는 정비 작업장',
      src: null,
      keyword: 'mechanic workshop tools',
      motif: 'workshop',
    },
    b: {
      label: '아이를 돌보는 교사',
      src: null,
      keyword: 'teacher helping child',
      motif: 'caregiving',
    },
    axis: { kind: 'riasec', a: 'R', b: 'S' },
    source: 'Unsplash / Pexels',
    intent: '사물 지향 vs 사람 지향',
  },
  {
    id: 2,
    group: 1,
    axisLabel: 'I ↔ E',
    a: {
      label: '현미경을 들여다보는 실험실',
      src: null,
      keyword: 'laboratory microscope',
      motif: 'laboratory',
    },
    b: {
      label: '무대에서 발표하는 리더',
      src: null,
      keyword: 'keynote stage presentation',
      motif: 'stage',
    },
    axis: { kind: 'riasec', a: 'I', b: 'E' },
    source: 'Unsplash / Pexels',
    intent: '탐구 vs 설득·주도',
  },
  {
    id: 3,
    group: 1,
    axisLabel: 'A ↔ C',
    a: {
      label: '물감이 널린 작업실',
      src: null,
      keyword: 'messy art studio paint',
      motif: 'art-studio',
    },
    b: {
      label: '정돈된 사무·데이터 화면',
      src: null,
      keyword: 'organized desk spreadsheet',
      motif: 'spreadsheet',
    },
    axis: { kind: 'riasec', a: 'A', b: 'C' },
    source: 'Unsplash / Pexels',
    intent: '표현 vs 체계',
  },
  {
    id: 4,
    group: 1,
    axisLabel: 'R ↔ S',
    a: {
      label: '목공 작업대에서 손으로 만드는 장면',
      src: null,
      keyword: 'woodworking hands',
      motif: 'woodworking',
    },
    b: {
      label: '환자를 돌보는 의료·상담 장면',
      src: null,
      keyword: 'nurse caring patient',
      motif: 'clinic',
    },
    axis: { kind: 'riasec', a: 'R', b: 'S' },
    source: 'Unsplash / Pexels',
    intent: '1번의 반복 측정',
  },
  {
    id: 5,
    group: 1,
    axisLabel: 'I ↔ E',
    a: {
      label: '수식이 가득한 화이트보드',
      src: null,
      keyword: 'whiteboard equations',
      motif: 'whiteboard',
    },
    b: {
      label: '계약·협상 회의',
      src: null,
      keyword: 'business negotiation handshake',
      motif: 'handshake',
    },
    axis: { kind: 'riasec', a: 'I', b: 'E' },
    source: 'Unsplash / Pexels',
    intent: '2번의 반복 측정',
  },
  {
    id: 6,
    group: 1,
    axisLabel: 'A ↔ C',
    a: {
      label: '악기를 연주하는 장면',
      src: null,
      keyword: 'playing instrument',
      motif: 'instrument',
    },
    b: {
      label: '서류·장부를 정리하는 장면',
      src: null,
      keyword: 'filing documents archive',
      motif: 'archive',
    },
    axis: { kind: 'riasec', a: 'A', b: 'C' },
    source: 'Unsplash / Pexels',
    intent: '3번의 반복 측정',
  },

  // ── Group 2: 성향·가치 축 ──
  {
    id: 7,
    group: 2,
    axisLabel: '개방성',
    a: {
      label: '추상 회화',
      src: null,
      keyword: '추상화 등급 상위',
      motif: 'abstract-painting',
    },
    b: {
      label: '고전 사실주의 회화',
      src: null,
      keyword: 'Realism·Baroque 사조',
      motif: 'classical-painting',
    },
    axis: { kind: 'trait', trait: '개방성', positive: 'a' },
    source: 'VAPS',
    intent: '새로움 추구 vs 익숙함 선호',
  },
  {
    id: 8,
    group: 2,
    axisLabel: '사회적 에너지',
    a: {
      label: '북적이는 축제·군중',
      src: null,
      keyword: 'Crowd, Party',
      motif: 'crowd',
    },
    b: {
      label: '혼자만의 조용한 공간',
      src: null,
      keyword: 'Lake, Cabin',
      motif: 'cabin',
    },
    axis: { kind: 'trait', trait: '사회적_에너지', positive: 'a' },
    source: 'OASIS',
    intent: '외향 vs 내향 에너지원',
  },
  {
    id: 9,
    group: 2,
    axisLabel: '가치관(환경)',
    a: {
      label: '산·숲의 자연',
      src: null,
      keyword: 'Mountain, Forest',
      motif: 'mountain',
    },
    b: {
      label: '네온 도시 야경',
      src: null,
      keyword: 'City night',
      motif: 'city-night',
    },
    axis: { kind: 'trait', trait: '환경_가치', positive: 'a' },
    source: 'OASIS',
    intent: '자연 회복 vs 도시 자극',
  },
  {
    id: 10,
    group: 2,
    axisLabel: '가치관(모험)',
    a: {
      label: '절벽 끝·암벽등반',
      src: null,
      keyword: 'Cliff, Climbing',
      motif: 'cliff',
    },
    b: {
      label: '아늑한 집 거실',
      src: null,
      keyword: 'Living room',
      motif: 'living-room',
    },
    axis: { kind: 'trait', trait: '모험_가치', positive: 'a' },
    source: 'OASIS',
    intent: '위험 감수 vs 안정 지향',
  },
  {
    id: 11,
    group: 2,
    axisLabel: '가치관(소비)',
    a: {
      label: '럭셔리 인테리어·고급차',
      src: null,
      keyword: 'luxury interior',
      motif: 'luxury',
    },
    b: {
      label: '미니멀 화이트 공간',
      src: null,
      keyword: 'minimal white room',
      motif: 'minimal',
    },
    axis: { kind: 'trait', trait: '소비_가치', positive: 'a' },
    source: 'Unsplash / Pexels',
    intent: '과시·성취 vs 절제·단순',
  },
  {
    id: 12,
    group: 2,
    axisLabel: '스트레스 반응',
    a: {
      label: '어수선한 책상',
      src: null,
      keyword: '동일 공간·동일 조명에서 상태만 변경',
      motif: 'messy-desk',
    },
    b: {
      label: '정돈된 책상',
      src: null,
      keyword: '동일 공간·동일 조명에서 상태만 변경',
      motif: 'tidy-desk',
    },
    axis: { kind: 'trait', trait: '무질서_회피', positive: 'b' },
    source: '직접 촬영 권장',
    intent: '무질서 회피 강도',
  },
];

/** 3분 압축 모드에서 쓸 6쌍 — 각 RIASEC 대각쌍 1개씩(1,2,3)과 성향축 3개(8,9,12) */
export const COMPACT_PAIR_IDS = [1, 2, 3, 8, 9, 12] as const;
