import { hashSeed, mulberry32 } from '@/lib/sensors/random';
import type { StimulusMotif } from './pairs';

/**
 * 자극 플레이트의 생성 아트.
 *
 * 실제 사진(Unsplash/OASIS/VAPS)은 아직 확정되지 않았다. 그렇다고 어설픈 아이콘을
 * 24개 그려 넣으면 화면이 단번에 싸구려가 된다. 대신 모티프마다 결정적(seeded)인
 * 선 구성 하나를 만들어, 24장이 같은 조형 언어 안에서 서로 다르게 보이도록 한다.
 *
 * 규칙:
 * - 두 플레이트의 시각적 무게(선 개수·평균 알파)를 비슷하게 맞춘다.
 *   한쪽이 눈에 띄게 화려하면 시선 편향이 자극이 아니라 그림 탓이 된다.
 * - 색은 쓰지 않는다. 전부 종이색 단일 톤. 색이 붙는 순간 선호가 오염된다.
 * - 사진이 확정되면 StimulusImage.src만 채우면 되고 이 파일은 폴백으로 남는다.
 */

export type MotifPattern =
  | 'grid'
  | 'scatter'
  | 'arcs'
  | 'ridge'
  | 'bloom'
  | 'columns'
  | 'weave'
  | 'orbit'
  | 'room';

export interface MotifSpec {
  pattern: MotifPattern;
  /** 요소 밀도 배율 (1이 기준) */
  density: number;
  /** 불규칙도 0~1 */
  jitter: number;
}

/** 모티프 → 조형. 의미를 직역하지 않고 "그 장면의 리듬"으로 옮긴다. */
export const MOTIF_SPEC: Record<StimulusMotif, MotifSpec> = {
  workshop: { pattern: 'weave', density: 1.0, jitter: 0.35 },
  caregiving: { pattern: 'bloom', density: 0.9, jitter: 0.3 },
  laboratory: { pattern: 'orbit', density: 1.0, jitter: 0.18 },
  stage: { pattern: 'arcs', density: 1.0, jitter: 0.22 },
  'art-studio': { pattern: 'scatter', density: 1.15, jitter: 0.85 },
  spreadsheet: { pattern: 'grid', density: 1.2, jitter: 0.03 },
  woodworking: { pattern: 'weave', density: 0.75, jitter: 0.5 },
  clinic: { pattern: 'bloom', density: 1.1, jitter: 0.2 },
  whiteboard: { pattern: 'columns', density: 1.25, jitter: 0.55 },
  handshake: { pattern: 'arcs', density: 0.8, jitter: 0.35 },
  instrument: { pattern: 'arcs', density: 1.25, jitter: 0.12 },
  archive: { pattern: 'grid', density: 0.85, jitter: 0.1 },
  'abstract-painting': { pattern: 'scatter', density: 0.9, jitter: 0.95 },
  'classical-painting': { pattern: 'weave', density: 1.2, jitter: 0.12 },
  crowd: { pattern: 'scatter', density: 1.3, jitter: 0.6 },
  cabin: { pattern: 'room', density: 0.7, jitter: 0.2 },
  mountain: { pattern: 'ridge', density: 1.0, jitter: 0.45 },
  'city-night': { pattern: 'columns', density: 1.5, jitter: 0.3 },
  cliff: { pattern: 'ridge', density: 0.7, jitter: 0.8 },
  'living-room': { pattern: 'room', density: 1.0, jitter: 0.12 },
  luxury: { pattern: 'room', density: 1.3, jitter: 0.08 },
  minimal: { pattern: 'grid', density: 0.45, jitter: 0.02 },
  'messy-desk': { pattern: 'scatter', density: 1.35, jitter: 1 },
  'tidy-desk': { pattern: 'grid', density: 1.0, jitter: 0.04 },
};

export interface MotifStroke {
  d: string;
  alpha: number;
  width: number;
}

/** 뷰박스는 항상 이 크기. 렌더러가 preserveAspectRatio로 맞춘다. */
export const MOTIF_VIEWBOX = { w: 320, h: 240 };

type Rand = () => number;

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `M${r2(x1)} ${r2(y1)}L${r2(x2)} ${r2(y2)}`;
}

function r2(v: number): number {
  return Math.round(v * 10) / 10;
}

/** 점 목록을 부드러운 폴리라인으로 */
function poly(pts: [number, number][]): string {
  if (!pts.length) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${r2(p[0])} ${r2(p[1])}`).join('');
}

function arcPath(cx: number, cy: number, rad: number, a0: number, a1: number): string {
  const x0 = cx + rad * Math.cos(a0);
  const y0 = cy + rad * Math.sin(a0);
  const x1 = cx + rad * Math.cos(a1);
  const y1 = cy + rad * Math.sin(a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M${r2(x0)} ${r2(y0)}A${r2(rad)} ${r2(rad)} 0 ${large} 1 ${r2(x1)} ${r2(y1)}`;
}

const W = MOTIF_VIEWBOX.w;
const H = MOTIF_VIEWBOX.h;
const PAD = 26;

function buildGrid(rand: Rand, s: MotifSpec): MotifStroke[] {
  const cols = Math.round(6 * s.density);
  const rows = Math.round(5 * s.density);
  const out: MotifStroke[] = [];
  const iw = W - PAD * 2;
  const ih = H - PAD * 2;
  for (let i = 0; i <= cols; i++) {
    const x = PAD + (iw * i) / cols + (rand() - 0.5) * 40 * s.jitter;
    out.push({ d: line(x, PAD, x, H - PAD), alpha: 0.1 + rand() * 0.14, width: 1 });
  }
  for (let j = 0; j <= rows; j++) {
    const y = PAD + (ih * j) / rows + (rand() - 0.5) * 40 * s.jitter;
    out.push({ d: line(PAD, y, W - PAD, y), alpha: 0.1 + rand() * 0.14, width: 1 });
  }
  // 한 칸만 채워 시선의 착지점을 만든다
  const ci = Math.floor(rand() * cols);
  const cj = Math.floor(rand() * rows);
  const x0 = PAD + (iw * ci) / cols;
  const y0 = PAD + (ih * cj) / rows;
  out.push({
    d: `M${r2(x0)} ${r2(y0)}h${r2(iw / cols)}v${r2(ih / rows)}h${r2(-iw / cols)}Z`,
    alpha: 0.3,
    width: 1.4,
  });
  return out;
}

function buildScatter(rand: Rand, s: MotifSpec): MotifStroke[] {
  const n = Math.round(46 * s.density);
  const out: MotifStroke[] = [];
  for (let i = 0; i < n; i++) {
    const x = PAD + rand() * (W - PAD * 2);
    const y = PAD + rand() * (H - PAD * 2);
    const len = 6 + rand() * 26 * (0.4 + s.jitter);
    const ang = rand() * Math.PI * 2 * s.jitter + (1 - s.jitter) * 0.6;
    out.push({
      d: line(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len),
      alpha: 0.08 + rand() * 0.24,
      width: 0.9 + rand() * 1.4,
    });
  }
  return out;
}

function buildArcs(rand: Rand, s: MotifSpec): MotifStroke[] {
  const n = Math.round(9 * s.density);
  const cx = W * (0.42 + rand() * 0.16);
  const cy = H * (0.72 + (rand() - 0.5) * 0.1 * s.jitter);
  const out: MotifStroke[] = [];
  for (let i = 1; i <= n; i++) {
    const rad = (i / n) * (H * 0.78) + 8;
    const spread = 0.9 + rand() * 0.5 * s.jitter;
    out.push({
      d: arcPath(cx, cy, rad, Math.PI + 0.35 * spread, Math.PI * 2 - 0.35 * spread),
      alpha: 0.09 + (1 - i / n) * 0.2,
      width: 1 + (1 - i / n) * 1.2,
    });
  }
  out.push({ d: line(PAD, cy, W - PAD, cy), alpha: 0.22, width: 1 });
  return out;
}

function buildRidge(rand: Rand, s: MotifSpec): MotifStroke[] {
  const layers = Math.max(4, Math.round(5 * s.density)) + 1;
  const out: MotifStroke[] = [];
  for (let l = 0; l < layers; l++) {
    const baseY = H * (0.42 + (l / layers) * 0.46);
    const amp = (H * 0.3 * (1 - l / (layers + 1))) as number;
    const pts: [number, number][] = [];
    const steps = 9;
    let y = baseY;
    for (let i = 0; i <= steps; i++) {
      const x = PAD + ((W - PAD * 2) * i) / steps;
      const target = baseY - Math.abs(Math.sin((i / steps) * Math.PI * (1 + l * 0.4))) * amp;
      y += (target - y) * (0.5 + 0.4 * (1 - s.jitter));
      pts.push([x, y + (rand() - 0.5) * 14 * s.jitter]);
    }
    out.push({ d: poly(pts), alpha: 0.12 + (1 - l / layers) * 0.22, width: 1 + (1 - l / layers) * 1.1 });
  }
  return out;
}

function buildBloom(rand: Rand, s: MotifSpec): MotifStroke[] {
  const cx = W / 2;
  const cy = H * 0.54;
  const n = Math.round(16 * s.density);
  const out: MotifStroke[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.4 * s.jitter;
    const r0 = 16 + rand() * 10;
    // 화면을 채우는 다른 패턴들과 프레임 안 점유 면적을 맞춘다.
    // 한 쌍의 두 판 중 하나만 여백이 크면 그것도 편향이다.
    const r1 = r0 + 62 + rand() * 92 * (0.6 + s.jitter);
    out.push({
      d: `M${r2(cx + Math.cos(a) * r0)} ${r2(cy + Math.sin(a) * r0)}Q${r2(
        cx + Math.cos(a + 0.3) * r1 * 0.7,
      )} ${r2(cy + Math.sin(a + 0.3) * r1 * 0.7)} ${r2(cx + Math.cos(a) * r1)} ${r2(
        cy + Math.sin(a) * r1,
      )}`,
      alpha: 0.1 + rand() * 0.2,
      width: 0.9 + rand() * 1.1,
    });
  }
  out.push({ d: arcPath(cx, cy, 12, 0, Math.PI * 1.999), alpha: 0.32, width: 1.4 });
  return out;
}

function buildColumns(rand: Rand, s: MotifSpec): MotifStroke[] {
  const n = Math.round(18 * s.density);
  const out: MotifStroke[] = [];
  const iw = W - PAD * 2;
  for (let i = 0; i < n; i++) {
    const x = PAD + (iw * (i + 0.5)) / n;
    const h = H * (0.18 + rand() * 0.6 * (0.5 + s.jitter));
    out.push({ d: line(x, H - PAD, x, H - PAD - h), alpha: 0.1 + rand() * 0.22, width: 1.4 });
    if (rand() < 0.35) {
      out.push({
        d: line(x - 3, H - PAD - h, x + 3, H - PAD - h),
        alpha: 0.26,
        width: 1,
      });
    }
  }
  out.push({ d: line(PAD, H - PAD, W - PAD, H - PAD), alpha: 0.24, width: 1 });
  return out;
}

function buildWeave(rand: Rand, s: MotifSpec): MotifStroke[] {
  const n = Math.round(14 * s.density);
  const out: MotifStroke[] = [];
  for (let i = 0; i < n; i++) {
    const off = ((i + 0.5) / n) * (W + H) - H;
    const j = (rand() - 0.5) * 26 * s.jitter;
    out.push({ d: line(off + j, PAD, off + H - PAD + j, H - PAD), alpha: 0.09 + rand() * 0.16, width: 1 });
  }
  for (let i = 0; i < n; i++) {
    const off = ((i + 0.5) / n) * (W + H) - H;
    const j = (rand() - 0.5) * 26 * s.jitter;
    out.push({
      d: line(W - off + j, PAD, W - off - H + PAD + j, H - PAD),
      alpha: 0.07 + rand() * 0.14,
      width: 1,
    });
  }
  return out;
}

function buildOrbit(rand: Rand, s: MotifSpec): MotifStroke[] {
  const cx = W / 2;
  const cy = H / 2;
  const n = Math.round(5 * s.density) + 1;
  const out: MotifStroke[] = [];
  for (let i = 1; i <= n; i++) {
    const rx = (i / n) * (W * 0.5);
    const ry = rx * (0.34 + rand() * 0.3 * (1 + s.jitter));
    const rot = rand() * 180;
    out.push({
      d: `M${r2(cx - rx)} ${r2(cy)}a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(rx * 2)} 0a${r2(rx)} ${r2(
        ry,
      )} 0 1 0 ${r2(-rx * 2)} 0`,
      alpha: 0.1 + rand() * 0.16,
      width: 1,
    });
    // 회전은 렌더러에서 개별 transform으로 주기 어렵기에 살짝 기운 축을 하나 더 얹는다
    if (i % 2 === 0) {
      out.push({
        d: line(
          cx - rx * Math.cos((rot * Math.PI) / 180),
          cy - rx * Math.sin((rot * Math.PI) / 180) * 0.4,
          cx + rx * Math.cos((rot * Math.PI) / 180),
          cy + rx * Math.sin((rot * Math.PI) / 180) * 0.4,
        ),
        alpha: 0.1,
        width: 1,
      });
    }
  }
  out.push({ d: arcPath(cx, cy, 7, 0, Math.PI * 1.999), alpha: 0.34, width: 1.5 });
  return out;
}

function buildRoom(rand: Rand, s: MotifSpec): MotifStroke[] {
  const vx = W * (0.4 + rand() * 0.2);
  const vy = H * (0.46 + (rand() - 0.5) * 0.1);
  const out: MotifStroke[] = [];
  const corners: [number, number][] = [
    [PAD, PAD],
    [W - PAD, PAD],
    [W - PAD, H - PAD],
    [PAD, H - PAD],
  ];
  for (const [x, y] of corners) out.push({ d: line(x, y, vx, vy), alpha: 0.14, width: 1 });
  out.push({
    d: `M${PAD} ${PAD}H${W - PAD}V${H - PAD}H${PAD}Z`,
    alpha: 0.16,
    width: 1,
  });
  const n = Math.round(3 * s.density) + 1;
  for (let i = 1; i <= n; i++) {
    const k = 0.16 + (i / (n + 1)) * 0.62 + (rand() - 0.5) * 0.08 * s.jitter;
    const lerp = (a: number, b: number) => a + (b - a) * k;
    const pts: [number, number][] = corners.map(([x, y]) => [lerp(x, vx), lerp(y, vy)]);
    out.push({
      d: `${poly(pts)}Z`,
      alpha: 0.1 + (1 - k) * 0.16,
      width: 1,
    });
  }
  return out;
}

const BUILDERS: Record<MotifPattern, (rand: Rand, s: MotifSpec) => MotifStroke[]> = {
  grid: buildGrid,
  scatter: buildScatter,
  arcs: buildArcs,
  ridge: buildRidge,
  bloom: buildBloom,
  columns: buildColumns,
  weave: buildWeave,
  orbit: buildOrbit,
  room: buildRoom,
};

/**
 * 목표 잉크량. Σ(alpha × width)로 근사한 "이 판이 눈에 실어 나르는 무게"다.
 *
 * 패턴마다 요소 수가 10배까지 차이 나므로(성긴 격자 8개 vs 흩뿌림 74개),
 * 그대로 두면 한 쌍의 두 장 중 한쪽이 훨씬 화려해진다. 그러면 시선이 쏠린 이유가
 * 그 사람의 성향이 아니라 그림의 밀도가 된다. 그래서 밀도가 아니라 총량을 맞춘다 —
 * 요소가 많은 판은 그만큼 흐리게.
 */
const INK_TARGET = 4.2;
const ALPHA_MIN = 0.035;
const ALPHA_MAX = 0.5;

function inkOf(strokes: MotifStroke[]): number {
  return strokes.reduce((sum, s) => sum + s.alpha * s.width, 0);
}

function normalizeInk(strokes: MotifStroke[]): MotifStroke[] {
  let out = strokes;
  // 클램프 때문에 한 번에 맞지 않는다. 두 번이면 충분히 수렴한다.
  for (let pass = 0; pass < 2; pass++) {
    const ink = inkOf(out);
    if (ink <= 0) return out;
    const k = INK_TARGET / ink;
    if (Math.abs(k - 1) < 0.02) break;
    out = out.map((s) => ({
      ...s,
      alpha: Math.min(ALPHA_MAX, Math.max(ALPHA_MIN, s.alpha * k)),
    }));
  }
  return out;
}

const cache = new Map<StimulusMotif, MotifStroke[]>();

/** 모티프의 선 구성. 같은 모티프는 항상 같은 그림이다(세션 간 재현성). */
export function motifStrokes(motif: StimulusMotif): MotifStroke[] {
  const hit = cache.get(motif);
  if (hit) return hit;
  const spec = MOTIF_SPEC[motif] ?? { pattern: 'grid', density: 1, jitter: 0.2 };
  const strokes = normalizeInk(BUILDERS[spec.pattern](mulberry32(hashSeed(motif)), spec));
  cache.set(motif, strokes);
  return strokes;
}
