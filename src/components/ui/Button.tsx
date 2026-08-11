'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'quiet';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

/**
 * 버튼.
 *
 * 채워진 밝은 버튼은 어두운 씬에서 너무 크게 소리친다.
 * 기본형은 헤어라인 아웃라인이고, 호버에서만 아주 옅은 면이 생긴다.
 */
export default function Button({ variant = 'primary', className = '', children, ...rest }: Props) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full text-[13px] font-normal tracking-[0.08em] transition-all duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] disabled:cursor-not-allowed disabled:opacity-35';
  const styles: Record<Variant, string> = {
    primary:
      'border border-paper/20 px-8 py-3 text-paper hover:border-paper/45 hover:bg-paper/[0.06] active:scale-[0.985]',
    ghost:
      'border border-transparent px-5 py-2 text-paper-dim hover:text-paper hover:bg-paper/[0.05]',
    quiet: 'px-2 py-1 text-[11px] tracking-[0.14em] text-paper-mute hover:text-paper-dim',
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
