'use client';

import { useEffect, useState } from 'react';
import { useLiveMetrics } from '@/hooks/useSensors';

/**
 * 연출용 HRV. **측정값이 아니다.**
 *
 * Polar Verity Sense는 표준 BLE 심박 서비스로 RR 간격을 보내지 않아 HRV를 계산할
 * 수 없다. 그런데 계기판에서 그 칸만 비어 있으면 체험자에게는 고장으로 읽힌다.
 * 그래서 참가자 화면에 한해 그럴듯한 값을 흘려 보여준다.
 *
 * 이 값이 나가는 곳은 화면 한 곳뿐이다. 일부러 훅 안에서 만들고 바깥으로
 * 내보내지 않는다 — sensorHub나 recorder를 거치면 baseline.hrv_rmssd가 되어
 * 해석 입력과 **영수증에 인쇄**된다. 체험자가 집에 가져가는 종이에 측정하지 않은
 * 생체수치가 본인 것으로 찍히는 것은 화면 연출과 전혀 다른 이야기다.
 *
 * 진행자 화면에는 쓰지 않는다(cosmeticHrv 기본값 false). 운영하는 사람은
 * 무엇이 실측이고 무엇이 아닌지 알아야 하고, 진행자 화면의 센서 목록은
 * "RR 미수신"을 그대로 띄운다.
 */
function useCosmeticHrv(active: boolean): number | null {
  const [v, setV] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      setV(null);
      return;
    }
    // 사람마다 기저값이 다르게 보이도록 세션마다 한 번만 고른다
    const base = 38 + Math.random() * 18;
    let t = Math.random() * 100;
    const tick = () => {
      t += 1;
      // 호흡 주기쯤의 느린 흔들림에 작은 잡음을 얹는다.
      // 계기판처럼 살아 있되, 눈에 띄게 튀지는 않는 폭.
      const wander = Math.sin(t / 9) * 3.5 + Math.sin(t / 3.7) * 1.4;
      setV(Math.max(15, Math.round(base + wander)));
    };
    tick();
    const id = setInterval(tick, 1200);
    return () => clearInterval(id);
  }, [active]);

  return v;
}

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

export default function VitalsReadout({
  className = '',
  cosmeticHrv = false,
}: {
  className?: string;
  /** HRV를 측정할 수 없을 때 연출용 값을 흘릴지. 참가자 화면에서만 켠다. */
  cosmeticHrv?: boolean;
}) {
  const m = useLiveMetrics();

  /*
   * 심박은 오는데 HRV가 없다 = 이 기기가 RR을 주지 않는다.
   * (아직 아무 신호도 없는 시작 구간과는 구분해야 한다. 그때의 빈칸은
   *  '못 준다'가 아니라 '아직 안 왔다'이고, 셋 다 —로 떠 있는 게 맞다.)
   */
  const bandGivesNoHrv = m.hr !== null && m.rmssd === null;
  const faux = useCosmeticHrv(cosmeticHrv && bandGivesNoHrv);

  const hrv = m.rmssd ?? faux;

  return (
    <div className={`flex flex-wrap items-center gap-x-7 gap-y-2 ${className}`}>
      <Metric
        label="심박"
        value={m.hr === null ? '—' : String(Math.round(m.hr))}
        unit="bpm"
        color="var(--color-hr)"
      />
      {/* 연출값도 없이 비어 있을 바에는 칸을 감춘다 — 고장으로 읽히느니 없는 편이 낫다 */}
      {!(bandGivesNoHrv && hrv === null) && (
        <Metric
          label="HRV"
          value={hrv === null ? '—' : String(Math.round(hrv))}
          unit="ms"
          color="var(--color-hrv)"
        />
      )}
      <Metric
        label="피부전도"
        value={m.gsr === null ? '—' : m.gsr.toFixed(2)}
        unit="µS"
        color="var(--color-gsr)"
      />
    </div>
  );
}
