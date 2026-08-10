'use client';

import { useLiveMetrics } from '@/hooks/useSensors';

function Metric({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="mb-px inline-block h-1 w-1 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      <span className="text-[10px] tracking-[0.14em] text-paper-mute">{label}</span>
      <span className="tnum text-[13px] font-light text-paper-dim">{value}</span>
      <span className="text-[10px] text-paper-mute">{unit}</span>
    </div>
  );
}

/**
 * 화면 구석의 조용한 계기판.
 * 체험을 방해하지 않을 만큼 작게, 그러나 "지금 측정되고 있다"는 사실은 분명하게.
 */
export default function VitalsReadout({ className = '' }: { className?: string }) {
  const m = useLiveMetrics();
  return (
    <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 ${className}`}>
      <Metric
        label="HR"
        value={m.hr ? m.hr.toFixed(0) : '—'}
        unit="bpm"
        color="var(--color-hr)"
      />
      <Metric
        label="HRV"
        value={m.rmssd ? m.rmssd.toFixed(0) : '—'}
        unit="ms"
        color="var(--color-hrv)"
      />
      <Metric
        label="GSR"
        value={m.gsr ? m.gsr.toFixed(2) : '—'}
        unit="µS"
        color="var(--color-gsr)"
      />
    </div>
  );
}
