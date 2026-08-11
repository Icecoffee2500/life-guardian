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
  const line = mono ? 'rgba(0,0,0,0.35)' : 'var(--color-line)';

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
      <circle cx="0" cy="0" r="0.625" fill="none" stroke={line} strokeWidth="0.012" />

      {/* 축 선 */}
      {sigil.radii.map((_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return (
          <line
            key={i}
            x1="0"
            y1="0"
            x2={Math.cos(a)}
            y2={Math.sin(a)}
            stroke={line}
            strokeWidth="0.008"
          />
        );
      })}

      {/* 본체 */}
      <motion.path
        d={d}
        fill={mono ? '#000' : 'var(--color-hr)'}
        fillOpacity={mono ? 0.06 : 0.1}
        stroke={ink}
        strokeWidth="0.028"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0, fillOpacity: 0 } : false}
        animate={animate ? { pathLength: 1, fillOpacity: mono ? 0.06 : 0.1 } : undefined}
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
            r="0.03"
            fill={ink}
          />
        );
      })}

      {/*
        중심 — 안정까지 걸린 시간. 빨리 가라앉을수록 고리가 크다.
        예전에는 꽉 찬 원이었는데, 안정이 빠른 사람일수록 검은 덩어리가 문양을
        집어삼켜서 "잘 나온 결과"가 오히려 못생기게 나왔다. 고리로 바꾼다.
      */}
      <circle cx="0" cy="0" r={sigil.core} fill="none" stroke={ink} strokeWidth="0.04" />
      <circle cx="0" cy="0" r="0.048" fill={ink} />
    </svg>
  );
}
