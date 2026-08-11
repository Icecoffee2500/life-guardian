'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet';
type Size = 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

/**
 * 버튼.
 *
 * 조작할 수 있는 것은 조작할 수 있게 생겨야 한다(Rams: verständlich).
 * 이전 버전은 테두리만 있는 유령 버튼이라 부스에서 처음 보는 사람이
 * 누를 수 있는 건지 알아보기 어려웠다. 기본형은 채운 면으로 바꾼다.
 *
 * 크기도 화면용이 아니라 손가락용이다 — 최소 44px 높이.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: Props) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-[4px] font-medium tracking-[-0.005em] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40';

  const sizes: Record<Size, string> = {
    md: 'min-h-[44px] px-6 text-[15px]',
    lg: 'min-h-[52px] px-8 text-[17px]',
  };

  const styles: Record<Variant, string> = {
    // 이 화면에서 다음으로 할 일 — 화면에 하나만 둔다
    primary:
      'bg-surface-inverse text-ink-on-inverse hover:bg-[#2a2a30] active:bg-[#000]',
    // 부차적 선택지 — 눌러도 되지만 주된 길은 아니다
    secondary:
      'border border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken',
    // 텍스트 링크에 가까운 조작 (건너뛰기 등)
    quiet: 'min-h-[40px] px-3 text-[14px] text-ink-2 underline underline-offset-4 hover:text-ink',
  };

  return (
    <button
      className={`${base} ${variant === 'quiet' ? '' : sizes[size]} ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
