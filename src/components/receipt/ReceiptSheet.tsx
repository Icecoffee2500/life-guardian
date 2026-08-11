'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import BioSigil from '@/components/experience/BioSigil';
import { buildSigil } from '@/lib/interpret/sigil';
import { RECOMMENDATION_KEYS } from '@/lib/interpret/schema';
import type { SessionRecord } from '@/lib/storage/record';

/**
 * bio-receipt — 80mm 감열지 한 장 (부록 D).
 *
 * 화면의 S8과 같은 내용이지만 완전히 다른 물건이다. 이건 **손에 남는 것**이고,
 * 감열지에는 회색이 없다. 그래서 여기만 라이트 테마이고, 모든 계조를 버리고
 * 검정 선과 흰 여백으로만 구성한다. 폰트도 굵기 두 종만 쓴다.
 *
 * 화면에서도 이 페이지를 그대로 보여준다 — 인쇄 미리보기가 곧 결과 화면이다.
 */

function Rule({ dashed = false }: { dashed?: boolean }) {
  return (
    <div
      className="my-3"
      style={{ borderTop: `1px ${dashed ? 'dashed' : 'solid'} #000`, opacity: dashed ? 0.35 : 0.8 }}
    />
  );
}

/** 심박 파형 — 이 종이가 몸에서 나왔다는 증거 */
function TraceLine({ trace }: { trace: number[] }) {
  if (trace.length < 4) return null;
  const w = 260;
  const h = 34;
  const lo = Math.min(...trace);
  const hi = Math.max(...trace);
  const range = Math.max(1e-6, hi - lo);
  const d = trace
    .map((v, i) => {
      const x = (i / (trace.length - 1)) * w;
      const y = h - ((v - lo) / range) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" aria-hidden>
      <path d={d} fill="none" stroke="#000" strokeWidth={1} strokeLinejoin="round" />
    </svg>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-[10px] leading-relaxed">
      <span className="shrink-0 opacity-60">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

export default function ReceiptSheet({ record }: { record: SessionRecord }) {
  const r = record.receipt;
  const sigil = buildSigil(record.input);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    const url = `${window.location.origin}/receipt/${record.session_id}`;
    QRCode.toDataURL(url, {
      margin: 0,
      width: 240,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [record.session_id]);

  const date = new Date(record.created_at);
  const stamp = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;

  return (
    <article
      className="receipt mx-auto bg-white px-5 py-7 text-black"
      style={{ width: '80mm', fontFeatureSettings: '"tnum"' }}
    >
      {/* 머리 */}
      <header className="text-center">
        <div className="text-[9px] font-medium tracking-[0.3em]">LIFE GUARDIAN</div>
        <div className="mt-1 text-[8px] tracking-[0.18em] opacity-60">BIO-RECEIPT</div>
      </header>

      <Rule />

      <div className="text-center">
        {/* 개인 문양 — 이 종이를 사진 찍게 만드는 유일한 그림.
            화면(S8)과 같은 컴포넌트를 쓴다. 두 곳의 모양이 다르면 "내 문양"이 깨진다. */}
        {sigil?.measured && (
          <div className="mb-2 flex justify-center">
            <BioSigil sigil={sigil} size={104} mono />
          </div>
        )}
        <div className="text-[9px] tracking-[0.14em] opacity-60">
          {record.nickname ? `${record.nickname} 님` : '오늘의 관측'}
        </div>
        <h1 className="mt-2 text-[19px] font-semibold leading-tight tracking-tight">
          {r.persona_name}
        </h1>
        <p className="mt-1.5 text-[11px] leading-snug">{r.one_liner}</p>
      </div>

      <div className="mt-3">
        <TraceLine trace={record.hr_trace} />
      </div>

      <Rule dashed />

      {/* 무의식 요약 */}
      <section>
        <h2 className="text-[9px] tracking-[0.2em] opacity-60">나도 몰랐던 나</h2>
        <ul className="mt-2 space-y-1.5">
          {r.unconscious_summary.map((s, i) => (
            <li key={s} className="flex gap-2 text-[10.5px] leading-[1.55]">
              <span className="shrink-0 tabular-nums opacity-50">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </section>

      {r.hidden_finding && (
        <>
          <Rule dashed />
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-[9px] tracking-[0.2em] opacity-60">숨은 신호</h2>
              <span className="text-[8px] opacity-50">확신 {r.hidden_finding.confidence}</span>
            </div>
            <p className="mt-2 text-[10.5px] leading-[1.55]">{r.hidden_finding.observation}</p>
            <p className="mt-1 text-[10px] leading-[1.55] opacity-70">{r.hidden_finding.reading}</p>
          </section>
        </>
      )}

      <Rule dashed />

      {/* 추천 */}
      <section>
        <h2 className="text-[9px] tracking-[0.2em] opacity-60">오늘의 제안</h2>
        <div className="mt-2 space-y-2">
          {RECOMMENDATION_KEYS.map((key) => {
            const items = r.recommendations[key];
            if (!items?.length) return null;
            return (
              <div key={key} className="flex gap-2.5">
                <span className="w-11 shrink-0 text-[9px] leading-[1.6] opacity-60">{key}</span>
                <div className="min-w-0 flex-1">
                  {items.map((it) => (
                    <div key={it.name} className="mb-1 last:mb-0">
                      <div className="text-[10.5px] font-medium leading-tight">{it.name}</div>
                      <div className="text-[9px] leading-snug opacity-65">{it.why}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Rule dashed />

      {/* 튜닝 퀘스트 — 이 종이에서 유일하게 테두리를 두르는 항목 */}
      <section className="border border-black/70 px-3 py-2.5 text-center">
        <div className="text-[8px] tracking-[0.2em] opacity-60">오늘의 튜닝 퀘스트</div>
        <p className="mt-1.5 text-[11px] font-medium leading-snug">{r.tuning_quest}</p>
      </section>

      <Rule />

      {/* 측정 요약 */}
      <section className="space-y-0.5">
        <Row label="세션" value={record.session_id} />
        <Row label="측정" value={stamp} />
        <Row
          label="소요"
          value={`${Math.floor(record.duration_sec / 60)}분 ${record.duration_sec % 60}초`}
        />
        {record.input.baseline.hr_mean !== null && (
          <Row label="기준 심박" value={`${record.input.baseline.hr_mean} bpm`} />
        )}
        {record.input.baseline.hrv_rmssd !== null && (
          <Row label="HRV (RMSSD)" value={`${record.input.baseline.hrv_rmssd} ms`} />
        )}
        {record.input.calm_phase.settle_time_sec !== null && (
          <Row label="안정까지" value={`${record.input.calm_phase.settle_time_sec} 초`} />
        )}
      </section>

      <Rule />

      <footer className="flex items-end gap-3">
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="세션 링크 QR" className="h-16 w-16 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[8.5px] leading-[1.5] opacity-70">{r.disclaimer}</p>
          <p className="mt-1.5 text-[8px] leading-[1.5] opacity-55">
            음성 원본은 저장하지 않습니다. QR로 언제든 이 결과를 다시 볼 수 있습니다.
          </p>
          {record.fallback && (
            <p className="mt-1 text-[8px] opacity-50">규칙 기반 해석으로 작성되었습니다.</p>
          )}
        </div>
      </footer>

      <div className="mt-5 text-center text-[8px] tracking-[0.24em] opacity-45">
        LIFENOLOGY LAB 3기
      </div>
    </article>
  );
}
