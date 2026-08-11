'use client';

import { useLiveMetrics } from '@/hooks/useSensors';

/**
 * 계기판.
 *
 * 이전 버전은 10px 회색 글씨라 "측정되고 있다"는 사실조차 읽히지 않았다.
 * 계측 장비의 숫자는 곁눈으로 읽혀야 한다 — 값은 크게, 단위는 작게,
 * 라벨은 굵게. 색은 채널 구분에만 쓴다.
 */
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
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="t-label text-ink-3">{label}</span>
      <span className="t-number text-[19px] text-ink">{value}</span>
      <span className="text-[12px] font-medium text-ink-3">{unit}</span>
    </div>
  );
}

export default function VitalsReadout({ className = '' }: { className?: string }) {
  const m = useLiveMetrics();
  return (
    <div className={`flex flex-wrap items-center gap-x-7 gap-y-2 ${className}`}>
      <Metric
        label="심박"
        value={m.hr === null ? '—' : String(Math.round(m.hr))}
        unit="bpm"
        color="var(--color-hr)"
      />
      <Metric
        label="HRV"
        value={m.rmssd === null ? '—' : String(Math.round(m.rmssd))}
        unit="ms"
        color="var(--color-hrv)"
      />
      <Metric
        label="피부전도"
        value={m.gsr === null ? '—' : m.gsr.toFixed(2)}
        unit="µS"
        color="var(--color-gsr)"
      />
    </div>
  );
}
