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
 * 실기기(80mm 감열 프린터)로 뽑아 보고 전면 수정한 판이다. 감열 인쇄에는
 * **회색이 없다.** 화면에서 opacity 60%로 조용히 뒤로 물러나 있던 글자들은
 * 종이에서 전부 점 찍힌 얼룩이 되어 읽히지 않았다 — 구획 제목, 추천 분류,
 * 추천 이유, 하단 고지문이 통째로 사라졌다.
 *
 * 그래서 이 종이의 규칙은 셋뿐이다.
 *  1. 회색을 쓰지 않는다. 모든 획은 순수한 검정이다.
 *  2. 위계는 **크기와 굵기와 선**으로만 만든다 (투명도로 만들지 않는다).
 *  3. 10px보다 작은 글자를 두지 않는다. 감열 헤드가 획을 통째로 날린다.
 *
 * 화면에서도 이 페이지를 그대로 보여준다 — 인쇄 미리보기가 곧 결과 화면이다.
 */

/** 실선 — 큰 단락의 경계 */
function Rule() {
  return <div className="receipt-rule my-2" />;
}

/** 점선 — 같은 단락 안의 숨 고르기. 감열지에서도 살아남도록 순수 검정. */
function DashRule() {
  return <div className="receipt-rule-dash my-2" />;
}

/**
 * 구획 제목.
 * 감열지에서 작은 글씨는 굵기로만 읽힌다. 제목 오른쪽을 점선으로 채워
 * "여기서부터 새 항목"임을 선으로도 알린다 (영수증의 오래된 문법).
 */
function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h2 className="shrink-0 text-[10.5px] font-bold tracking-[0.16em]">{title}</h2>
      <div className="receipt-rule-dash min-w-3 flex-1" />
      {note && <span className="shrink-0 text-[10px] font-semibold">{note}</span>}
    </div>
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
      {/* 감열 헤드는 1px 미만의 획을 통째로 버린다. 화면보다 굵게 그린다. */}
      <path d={d} fill="none" stroke="#000" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** 측정 요약 한 줄 — 왼쪽 항목명도 값과 같은 검기로 찍는다 */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-[10.5px] font-semibold leading-[1.75]">
      <span className="shrink-0">{label}</span>
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
      width: 320,
      // 감열 인쇄는 점이 번진다. 여유를 크게 잡아야 부스에서 한 번에 찍힌다.
      errorCorrectionLevel: 'Q',
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
      className="receipt mx-auto bg-white px-[4.5mm] py-5 text-black"
      style={{ width: '80mm', fontFeatureSettings: '"tnum"' }}
    >
      {/* 머리 */}
      <header className="text-center">
        <div className="text-[11px] font-bold tracking-[0.3em]">LIFE GUARDIAN</div>
        <div className="mt-1 text-[9.5px] font-semibold tracking-[0.2em]">BIO-RECEIPT</div>
      </header>

      <Rule />

      <div className="text-center">
        {/* 개인 문양 — 이 종이를 사진 찍게 만드는 유일한 그림.
            화면(S8)과 같은 컴포넌트를 쓴다. 두 곳의 모양이 다르면 "내 문양"이 깨진다. */}
        {sigil?.measured && (
          <div className="mb-2.5 flex justify-center">
            <BioSigil sigil={sigil} size={112} mono />
          </div>
        )}
        <div className="text-[10px] font-bold tracking-[0.16em]">
          {record.nickname ? `${record.nickname} 님` : '오늘의 관측'}
        </div>
        <h1 className="mt-2 text-[22px] font-bold leading-tight tracking-[-0.02em]">
          {r.persona_name}
        </h1>
        <p className="mt-2 text-[12px] font-medium leading-snug">{r.one_liner}</p>
      </div>

      <div className="mt-3">
        <TraceLine trace={record.hr_trace} />
      </div>

      <DashRule />

      {/* 무의식 요약 */}
      <section>
        <SectionHead title="나도 몰랐던 나" />
        <ul className="space-y-2">
          {r.unconscious_summary.map((s, i) => (
            <li key={s} className="flex gap-2 text-[11.5px] font-medium leading-[1.6]">
              <span className="shrink-0 font-bold tabular-nums">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </section>

      {r.hidden_finding && (
        <>
          <DashRule />
          <section>
            <SectionHead title="숨은 신호" note={`확신 ${r.hidden_finding.confidence}`} />
            <p className="text-[11.5px] font-medium leading-[1.6]">
              {r.hidden_finding.observation}
            </p>
            <p className="mt-1.5 text-[11px] font-medium leading-[1.6]">
              {r.hidden_finding.reading}
            </p>
          </section>
        </>
      )}

      <DashRule />

      {/*
        오늘의 제안.
        원래는 분류명을 왼쪽 11px 폭 칸에 넣었는데, 감열지에서 그 칸의 작은
        회색 글씨가 통째로 날아가 항목이 어디에 속하는지 알 수 없었다.
        분류를 제 줄로 올리고 검게 찍는다. 종이는 세로로 길어도 된다.
      */}
      <section>
        <SectionHead title="오늘의 제안" />
        <div className="space-y-2">
          {RECOMMENDATION_KEYS.map((key) => {
            const items = r.recommendations[key];
            if (!items?.length) return null;
            return (
              <div key={key}>
                <div className="text-[10.5px] font-bold tracking-[0.14em]">{key}</div>
                <div className="mt-1 space-y-1.5">
                  {items.map((it) => (
                    <div key={it.name} className="flex gap-1.5">
                      <span className="shrink-0 text-[11.5px] font-bold leading-[1.45]">·</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] font-bold leading-[1.45]">{it.name}</div>
                        <div className="text-[10.5px] font-medium leading-[1.55]">{it.why}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <DashRule />

      {/* 튜닝 퀘스트 — 이 종이에서 유일하게 테두리를 두르는 항목 */}
      <section className="border-2 border-black px-3 py-3 text-center">
        <div className="text-[9.5px] font-bold tracking-[0.18em]">오늘의 튜닝 퀘스트</div>
        <p className="mt-2 text-[12px] font-bold leading-[1.55]">{r.tuning_quest}</p>
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

      {/*
        QR과 고지문을 나란히 두면 고지문 칸이 45mm로 좁아져 한 줄에 서너 글자만
        들어가고, 감열지에서 그만큼 잘게 쪼개진 문장은 읽히지 않는다.
        QR은 가운데, 글은 아래 전체 폭으로 내린다.
      */}
      <footer className="text-center">
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="세션 링크 QR" className="mx-auto h-[18mm] w-[18mm]" />
        )}
        <p className="mt-1.5 text-[10px] font-bold tracking-[0.1em]">
          QR로 이 결과를 다시 볼 수 있습니다
        </p>
        <p className="mt-2 text-[10px] font-medium leading-[1.55]">
          {r.disclaimer} 음성 원본은 저장하지 않습니다.
        </p>
        {/*
          해석이 규칙 기반이었는지는 영수증에 찍지 않는다.
          체험자에게는 아무 의미도 없는 내부 사정이고, 받아 든 결과를 괜히
          덜 믿게 만든다. 그 사실이 필요한 사람은 진행자뿐이고, 진행자 화면의
          서버 진단 패널이 이미 더 정확하게 알려준다 (키 유무·호출 실패 구분).
          record.fallback 자체는 세션 기록에 그대로 남는다.
        */}
      </footer>

      <Rule />

      <div className="text-center text-[9.5px] font-bold tracking-[0.22em]">LIFENOLOGY LAB 3기</div>

      {/* 커터 아래 여백 — 마지막 줄이 칼날에 물려 잘려 나오지 않게 한다.
          종이에만 필요한 여백이라 화면에서는 두지 않는다. */}
      <div className="hidden h-10 print:block" aria-hidden />
    </article>
  );
}
