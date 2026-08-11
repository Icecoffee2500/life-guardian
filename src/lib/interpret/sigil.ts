import type { LlmInput } from '@/lib/features/schema';
import type { RiasecType, TraitKey } from '@/lib/stimuli/pairs';

/**
 * 바이오 시길 — 측정값으로 그리는 개인 문양.
 *
 * "재미"를 넣으라는 요구에 스티커나 이모지를 붙이는 건 이 제품에 어울리지 않는다.
 * 대신 **자기 숫자에서만 나오는 형태** 하나를 만든다.
 * 같은 사람이 같은 반응을 하면 같은 모양이 나오고, 다른 사람은 다른 모양이 나온다.
 * 장식이 아니라 측정 결과의 또 다른 표현이라서, 이 프로젝트의 원칙과 충돌하지 않는다.
 *
 * 읽는 법도 단순하다:
 * - 12개 꼭짓점 = RIASEC 6축 + 성향 6축
 * - 중심에서 먼 꼭짓점일수록 그 축이 강하게 나온 것
 * - 안쪽 원의 크기 = 안정까지 걸린 시간 (빨리 가라앉을수록 크다)
 */

const RIASEC_ORDER: RiasecType[] = ['R', 'I', 'A', 'S', 'E', 'C'];
const TRAIT_ORDER: TraitKey[] = [
  '개방성',
  '사회적_에너지',
  '환경_가치',
  '모험_가치',
  '소비_가치',
  '무질서_회피',
];

export interface Sigil {
  /** 12축의 반지름 (0~1). 축 값이 없으면 기준선인 0.5 */
  radii: number[];
  /** 각 축의 이름 — 진행자 화면·접근성 라벨용 */
  labels: string[];
  /** 안쪽 원 반지름 (0~1) */
  core: number;
  /** 측정된 축이 하나라도 있는가. 없으면 "그릴 것이 없다"고 말해야 한다. */
  measured: boolean;
}

/** 축 값 -1~+1 → 반지름 0.25~1 */
function toRadius(v: number | undefined | null): number {
  if (v === undefined || v === null || !Number.isFinite(v)) return 0.5;
  return 0.25 + ((v + 1) / 2) * 0.75;
}

export function buildSigil(input: LlmInput): Sigil {
  const riasec = input.gaze.riasec;
  const traits = input.gaze.traits;

  const radii = [
    ...RIASEC_ORDER.map((k) => toRadius(riasec?.[k])),
    ...TRAIT_ORDER.map((k) => toRadius(traits?.[k])),
  ];

  // 빨리 안정될수록 중심이 크다. 안정에 이르지 못했으면 작은 점만 남는다.
  const settle = input.calm_phase.settle_time_sec;
  const core =
    input.calm_phase.reached && settle !== null
      ? Math.max(0.12, Math.min(0.3, 0.3 - (settle / 120) * 0.18))
      : 0.1;

  return {
    radii,
    labels: [...RIASEC_ORDER, ...TRAIT_ORDER.map((t) => t.replace(/_/g, ' '))],
    core,
    measured: riasec !== null || traits !== null,
  };
}

/**
 * 시길을 SVG 경로로. 뷰박스는 -1~1 정사각형이라 어디에 놓든 크기만 정하면 된다.
 * 화면과 영수증(감열지)이 같은 함수를 쓴다 — 두 곳의 모양이 달라지면 안 된다.
 */
export function sigilPath(radii: number[]): string {
  const n = radii.length;
  if (n === 0) return '';
  const pt = (i: number) => {
    // 12시 방향에서 시작해 시계 방향
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = radii[i % n];
    return [Math.cos(a) * r, Math.sin(a) * r] as const;
  };
  return (
    radii
      .map((_, i) => {
        const [x, y] = pt(i);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(4)} ${y.toFixed(4)}`;
      })
      .join('') + 'Z'
  );
}
