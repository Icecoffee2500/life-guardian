'use client';

import { useSession } from '@/lib/session/store';

/**
 * 시선 표시 스위치.
 *
 * 웹캠 추적이 실제로 돌고 있을 때만 화면에 나온다 —
 * 포인터 프록시에서 이 스위치가 보이면 마우스를 눈이라고 부르는 셈이 된다.
 */
export default function GazeCursorToggle({ className = '' }: { className?: string }) {
  const on = useSession((s) => s.gazeCursor);
  const set = useSession((s) => s.setGazeCursor);

  return (
    <button
      onClick={() => set(!on)}
      aria-pressed={on}
      title="자극이 떠 있는 동안에는 측정을 지키기 위해 자동으로 사라집니다"
      className={`pointer-events-auto inline-flex min-h-[36px] items-center gap-2 rounded-full border border-line px-3.5 text-[13px] font-semibold transition-colors duration-200 ${
        on
          ? 'bg-surface-raised text-ink hover:bg-surface-sunken'
          : 'bg-transparent text-ink-3 hover:text-ink'
      } ${className}`}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-full"
        style={{
          background: on ? 'var(--color-hrv)' : 'transparent',
          border: on ? 'none' : '1.5px solid currentColor',
        }}
      />
      {on ? '시선 표시 켜짐' : '시선 표시 꺼짐'}
    </button>
  );
}
