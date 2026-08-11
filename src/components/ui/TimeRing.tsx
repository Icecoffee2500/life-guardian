'use client';

/**
 * 남은 시간 표시.
 *
 * 이전 버전은 얇은 호만 있어서 얼마나 남았는지 읽으려면 들여다봐야 했다.
 * 계측 장비의 게이지는 곁눈으로도 읽혀야 한다 — 굵기를 올리고 숫자를 함께 둔다.
 */
export default function TimeRing({
  progress,
  size = 44,
  stroke = 3,
  className = '',
  seconds,
}: {
  /** 0(시작) ~ 1(종료) */
  progress: number;
  size?: number;
  stroke?: number;
  className?: string;
  /** 남은 초. 주면 링 안에 숫자를 넣는다. */
  seconds?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const left = Math.max(0, 1 - progress);
  const urgent = left < 0.2;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? 'var(--color-hr)' : 'var(--color-ink)'}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - left)}
        />
      </svg>
      {seconds !== undefined && (
        <span className="t-number absolute text-[13px] text-ink">{Math.max(0, seconds)}</span>
      )}
    </div>
  );
}
