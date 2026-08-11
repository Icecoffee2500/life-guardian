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
  className = '',
}: {
  sigil: Sigil;
  size?: number;
  /** 화면에서는 그려지듯 나타난다. 인쇄에서는 정지. */
  animate?: boolean;
  className?: string;
}) {
  const d = sigilPath(sigil.radii);
  const n = sigil.radii.length;

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
      <circle cx="0" cy="0" r="0.625" fill="none" stroke="var(--color-line)" strokeWidth="0.012" />

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
            stroke="var(--color-line)"
            strokeWidth="0.008"
          />
        );
      })}

      {/* 본체 */}
      <motion.path
        d={d}
        fill="var(--color-hr)"
        fillOpacity={0.1}
        stroke="var(--color-ink)"
        strokeWidth="0.028"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0, fillOpacity: 0 } : false}
        animate={animate ? { pathLength: 1, fillOpacity: 0.1 } : undefined}
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
            fill="var(--color-ink)"
          />
        );
      })}

      {/* 중심 — 안정까지 걸린 시간 */}
      <circle cx="0" cy="0" r={sigil.core} fill="var(--color-ink)" />
    </svg>
  );
}
