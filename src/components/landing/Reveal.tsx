'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * 스크롤에 맞춰 한 번만 떠오르는 블록.
 *
 * 랜딩의 모든 등장은 같은 리듬을 쓴다 — 아래에서 조금 올라오며 밝아진다.
 * 좌우로 날아오거나 튕기는 모션은 쓰지 않는다. 이 제품의 주제는 진정이다.
 */
export default function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 1, delay, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
