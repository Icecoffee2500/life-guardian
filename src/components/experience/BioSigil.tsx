'use client';

import { motion } from 'motion/react';
import { sigilPath, type Sigil } from '@/lib/interpret/sigil';

/**
 * 바이오 시길 렌더러.
 *
 * 화면(S8)과 영수증이 같은 컴포넌트를 쓴다. 두 곳의 모양이 다르면
 * "내 문양"이라는 감각이 깨진다.
 */
export default function BioSigil({
  sigil,
  size = 180,
  animate = false,
  mono = false,
  className = '',
}: {
  sigil: Sigil;
  size?: number;
  /** 화면에서는 그려지듯 나타난다. 인쇄에서는 정지. */
  animate?: boolean;
  /**
   * 감열지용 흑백. 영수증에는 회색조가 없어서 테마 색을 그대로 쓰면
   * 인쇄물에서 선이 사라진다.
   */
  mono?: boolean;
  className?: string;
}) {
  const d = sigilPath(sigil.radii);
  const n = sigil.radii.length;
  const ink = mono ? '#000' : 'var(--color-ink)';
  /*
    감열지에는 회색이 없다. rgba(0,0,0,0.35)로 그린 기준 원과 축선은 실기기에서
    성긴 점 얼룩이 되어 문양을 지저분하게 만들었다. 인쇄용은 순수 검정 점선으로
    긋는다 — 옅게 보이는 건 색이 아니라 점선의 몫이다.
  */
  const line = mono ? '#000' : 'var(--color-line)';
  /* 감열 헤드가 버리지 않을 최소 굵기. 화면보다 전반적으로 굵다. */
  const w = mono
    ? { grid: 0.016, axis: 0.012, body: 0.042, core: 0.05, dot: 0.038 }
    : { grid: 0.012, axis: 0.008, body: 0.028, core: 0.04, dot: 0.03 };

  return (
    <svg
      width={size}
      height={size}
      viewBox="-1.15 -1.15 2.3 2.3"
      className={className}
      role="img"
      aria-label={`측정값으로 만든 개인 문양. ${sigil.labels.join(', ')} 축의 반응 형태.`}
    >
      {/* 기준 원 — 모든 축이 중립일 때의 크기. 시길이 이보다 크면 강한 축이다. */}
      <circle
        cx="0"
        cy="0"
        r="0.625"
        fill="none"
        stroke={line}
        strokeWidth={w.grid}
        strokeDasharray={mono ? '0.05 0.05' : undefined}
      />

      {/*
        축 선.
        인쇄에서는 기준 원까지만 긋는다. 화면처럼 바깥까지 뻗으면 감열지에서
        문양 주위로 점이 흩뿌려져, 정작 읽어야 할 본체 윤곽이 묻힌다.
      */}
      {sigil.radii.map((_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const len = mono ? 0.625 : 1;
        return (
          <line
            key={i}
            x1="0"
            y1="0"
            x2={Math.cos(a) * len}
            y2={Math.sin(a) * len}
            stroke={line}
            strokeWidth={w.axis}
            strokeDasharray={mono ? '0.04 0.06' : undefined}
          />
        );
      })}

      {/* 본체 */}
      <motion.path
        d={d}
        /* 인쇄에서는 면을 채우지 않는다. 6% 검정은 종이에서 얼룩이지 회색이 아니다. */
        fill={mono ? 'none' : 'var(--color-hr)'}
        fillOpacity={mono ? 0 : 0.1}
        stroke={ink}
        strokeWidth={w.body}
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0, fillOpacity: 0 } : false}
        animate={animate ? { pathLength: 1, fillOpacity: mono ? 0 : 0.1 } : undefined}
        transition={{ duration: 1.6, ease: [0.22, 0.61, 0.36, 1] }}
      />

      {/* 꼭짓점 */}
      {sigil.radii.map((r, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return (
          <circle
            key={i}
            cx={Math.cos(a) * r}
            cy={Math.sin(a) * r}
            r={w.dot}
            fill={ink}
          />
        );
      })}

      {/*
        중심 — 안정까지 걸린 시간. 빨리 가라앉을수록 고리가 크다.
        예전에는 꽉 찬 원이었는데, 안정이 빠른 사람일수록 검은 덩어리가 문양을
        집어삼켜서 "잘 나온 결과"가 오히려 못생기게 나왔다. 고리로 바꾼다.
      */}
      <circle cx="0" cy="0" r={sigil.core} fill="none" stroke={ink} strokeWidth={w.core} />
      <circle cx="0" cy="0" r={mono ? 0.058 : 0.048} fill={ink} />
    </svg>
  );
}
