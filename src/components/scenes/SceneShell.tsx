'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * 씬 공통 껍데기.
 *
 * 전환은 짧고 단정하게. 계측 장비의 화면이 바뀌는 느낌이지,
 * 무언가가 떠오르거나 흩어지는 연출이 아니다(Rams: unaufdringlich).
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 0.61, 0.36, 1] } }}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      className={`absolute inset-0 flex flex-col ${
        align === 'center' ? 'items-center justify-center' : ''
      } ${className}`}
    >
      {children}
    </motion.section>
  );
}

/** 씬 제목 — 지금 무엇을 해야 하는지 한 문장 */
export function SceneTitle({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h1 className={`t-display text-balance text-center text-ink ${className}`}>{children}</h1>;
}

/** 씬 보조 설명 — 제목만으로 부족할 때만 */
export function SceneCaption({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`t-body text-center text-ink-2 ${className}`}>{children}</p>;
}
