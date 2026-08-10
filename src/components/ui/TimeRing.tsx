'use client';

/**
 * 남은 시간 링.
 *
 * 숫자 카운트다운은 압박을 만든다. 얇은 호가 조용히 줄어드는 편이 낫다.
 * 마지막 15%에서만 색이 살짝 따뜻해진다.
 */
export default function TimeRing({
  progress,
  size = 40,
  stroke = 1.5,
  className = '',
  label,
}: {
  /** 0(시작) ~ 1(종료) */
  progress: number;
  size?: number;
  stroke?: number;
  className?: string;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const left = Math.max(0, 1 - progress);
  const urgent = left < 0.15;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(236,233,227,0.10)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? 'var(--color-hr)' : 'rgba(236,233,227,0.5)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - left)}
          style={{ transition: 'stroke 900ms ease' }}
        />
      </svg>
      {label && (
        <span className="tnum absolute text-[10px] font-light text-paper-mute">{label}</span>
      )}
    </div>
  );
}
