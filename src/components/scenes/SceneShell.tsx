'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * 씬 공통 껍데기.
 *
 * 모든 씬은 같은 리듬으로 들어오고 나간다 — 놀라게 하는 모션은 쓰지 않는다.
 * 위로 아주 조금 떠오르며 밝아지고, 나갈 때는 그 자리에서 조용히 사라진다.
 * 들어오는 씬과 나가는 씬이 겹치게 두어 검은 공백이 생기지 않게 한다.
 */
export default function SceneShell({
  children,
  className = '',
  align = 'center',
}: {
  children: ReactNode;
  className?: string;
  align?: 'center' | 'stretch';
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
      animate={{
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        transition: { duration: 0.8, delay: 0.12, ease: [0.22, 0.61, 0.36, 1] },
      }}
      exit={{
        opacity: 0,
        y: -6,
        filter: 'blur(5px)',
        transition: { duration: 0.45, ease: [0.65, 0, 0.35, 1] },
      }}
      className={`absolute inset-0 flex flex-col ${
        align === 'center' ? 'items-center justify-center' : ''
      } ${className}`}
    >
      {children}
    </motion.section>
  );
}

/** 씬 타이틀 — 크고 얇게 */
export function SceneTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={`scene-title text-balance text-center text-[clamp(1.75rem,4.6vw,3.4rem)] text-paper ${className}`}
    >
      {children}
    </h1>
  );
}

/** 씬 캡션 — 한 줄 안내 */
export function SceneCaption({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-center text-[clamp(0.82rem,1.35vw,1rem)] font-light text-paper-dim ${className}`}>
      {children}
    </p>
  );
}
