import type { Persona } from '@/lib/sensors/personas';
import { clamp, gaussianFrom, hashSeed, mulberry32 } from '@/lib/sensors/random';

/** 정규 좌표(0~1)의 한 획 */
export interface AutoStroke {
  points: { x: number; y: number; p: number }[];
}

/**
 * 캔버스 밖으로 나간 점을 가장자리로 붙인다.
 * 사람이 그릴 때도 종이 밖으로는 못 나간다 — 큰 그림은 가장자리에서 잘린다.
 */
function fit(strokes: AutoStroke[]): AutoStroke[] {
  return strokes.map((s) => ({
    points: s.points.map((p) => ({
      x: clamp(p.x, 0.01, 0.99),
      y: clamp(p.y, 0.01, 0.99),
      p: p.p,
    })),
  }));
}

/**
 * 가상 참가자의 그림을 절차적으로 만든다.
 *
 * 무인 시연(signalMode='auto')에서 그림 씬이 빈 화면으로 30초를 버티면 곤란하다.
 * 페르소나의 drawing 프로필(크기·무게중심·필압·수정 횟수·세부 요소)을 그대로 반영해
 * "이 사람이라면 이렇게 그렸을 그림"을 만든다.
 *
 * 이 좌표는 실제 그림 씬과 같은 경로로 SessionRecorder에 들어가므로,
 * 특징 추출(M3)은 사람이 그린 것과 자동 재현을 구분하지 않는다.
 */
export function autoTree(persona: Persona, seed: string): AutoStroke[] {
  const d = persona.drawing;
  const rand = mulberry32(hashSeed(seed + persona.id));
  const g = gaussianFrom(rand);
  const out: AutoStroke[] = [];

  // sizeRatio는 면적비 → 선형 크기로 환산
  const s = clamp(Math.sqrt(d.sizeRatio), 0.15, 0.95);
  const cx = d.centroid.x;
  const cy = d.centroid.y;
  const bottom = clamp(cy + s * 0.5, 0.1, 0.96);
  const top = clamp(cy - s * 0.5, 0.04, 0.9);
  const trunkH = bottom - top;
  const trunkW = s * 0.09;
  const press = (k = 0) => clamp(d.pressure + g() * 0.06 + k, 0.08, 1);

  const jitter = (n: number) => g() * 0.006 * n;

  // 줄기 — 좌우 두 선. 위(수관 밑동)에서 아래(지면)로 긋는다.
  const trunkTop = top + trunkH * 0.42;
  for (const side of [-1, 1]) {
    const pts: { x: number; y: number; p: number }[] = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps; // 0 = 위, 1 = 아래
      // 아래로 갈수록 벌어진다
      const w = trunkW * (0.55 + 0.45 * k);
      pts.push({
        x: cx + side * w + jitter(1),
        y: trunkTop + (bottom - trunkTop) * k + jitter(0.6),
        p: press(),
      });
    }
    out.push({ points: pts });
  }

  // 수관 — 겹치는 호들. details가 많을수록 촘촘하다
  const lobes = clamp(Math.round(3 + d.details * 0.5), 3, 9);
  const crownR = s * (0.3 + d.details * 0.012);
  const crownY = top + trunkH * 0.24;
  for (let i = 0; i < lobes; i++) {
    const a0 = (i / lobes) * Math.PI * 2 + rand() * 0.4;
    const rr = crownR * (0.62 + rand() * 0.5);
    const ox = cx + Math.cos(a0) * crownR * 0.42;
    const oy = crownY + Math.sin(a0) * crownR * 0.3;
    const pts: { x: number; y: number; p: number }[] = [];
    const steps = 22;
    for (let j = 0; j <= steps; j++) {
      const a = a0 + (j / steps) * Math.PI * 2;
      pts.push({
        x: ox + Math.cos(a) * rr + jitter(1.4),
        y: oy + Math.sin(a) * rr * 0.82 + jitter(1.4),
        p: press(-0.08),
      });
    }
    out.push({ points: pts });
  }

  // 가지 — 줄기에서 수관으로
  const branches = clamp(Math.round(d.details * 0.6), 0, 6);
  for (let i = 0; i < branches; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const y0 = crownY + trunkH * (0.18 + rand() * 0.3);
    const len = s * (0.16 + rand() * 0.14);
    out.push({
      points: [
        { x: cx, y: y0, p: press() },
        { x: cx + side * len * 0.6, y: y0 - len * 0.35, p: press() },
        { x: cx + side * len, y: y0 - len * 0.75, p: press(-0.05) },
      ],
    });
  }

  // 뿌리
  if (d.structure.root) {
    for (const side of [-1, 1]) {
      const len = s * (0.14 + rand() * 0.08);
      out.push({
        points: [
          { x: cx + side * trunkW * 0.9, y: bottom, p: press() },
          { x: cx + side * (trunkW + len * 0.6), y: bottom + len * 0.22, p: press() },
          { x: cx + side * (trunkW + len), y: bottom + len * 0.36, p: press(-0.1) },
        ],
      });
    }
  }

  // 지면
  out.push({
    points: [
      { x: clamp(cx - s * 0.6, 0.04, 0.96), y: bottom + s * 0.02, p: press(-0.15) },
      { x: clamp(cx + s * 0.6, 0.04, 0.96), y: bottom + s * 0.02 + jitter(1), p: press(-0.15) },
    ],
  });

  return fit(out);
}

/** '10년 뒤 나의 하루' — 구체적 형상 대신 제스처 몇 개 */
export function autoFuture(persona: Persona, seed: string): AutoStroke[] {
  const d = persona.drawing;
  const rand = mulberry32(hashSeed(seed + persona.id + 'future'));
  const g = gaussianFrom(rand);
  const out: AutoStroke[] = [];
  const press = () => clamp(d.pressure + g() * 0.07, 0.08, 1);
  const n = clamp(Math.round(2 + d.details * 0.4), 3, 8);

  // 지평선
  const hy = 0.42 + g() * 0.05;
  out.push({
    points: [
      { x: 0.12, y: hy, p: press() },
      { x: 0.88, y: hy + g() * 0.01, p: press() },
    ],
  });

  for (let i = 0; i < n; i++) {
    const x0 = 0.18 + (0.64 * i) / Math.max(1, n - 1) + g() * 0.02;
    const h = 0.08 + rand() * 0.28 * Math.sqrt(d.sizeRatio);
    const w = 0.04 + rand() * 0.09;
    // 위/아래를 번갈아 — 사람·사물·창 같은 것들의 추상
    const up = i % 2 === 0;
    const y1 = up ? hy - h : hy + h * 0.6;
    out.push({
      points: [
        { x: x0 - w / 2, y: hy, p: press() },
        { x: x0 - w / 2 + g() * 0.006, y: y1, p: press() },
        { x: x0 + w / 2 + g() * 0.006, y: y1 + g() * 0.006, p: press() },
        { x: x0 + w / 2, y: hy, p: press() },
      ],
    });
  }
  return fit(out);
}
