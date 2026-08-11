'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import VitalsReadout from '@/components/experience/VitalsReadout';
import { useSourceSnapshots } from '@/hooks/useSensors';
import { OPERATOR_GUIDE } from '@/lib/dialogue/script';
import { PERSONAS } from '@/lib/sensors/personas';
import { hasSupabase } from '@/lib/supabase/client';
import { listLocal } from '@/lib/storage/persist';
import type { SessionRecord } from '@/lib/storage/record';
import { SCENES } from '@/lib/session/scenes';
import { useSession, type SignalMode } from '@/lib/session/store';

/**
 * /operator — 진행자 화면.
 *
 * 체험 화면(/experience)과 **다른 창**에서 연다. 부스에서는 노트북이 이 화면을 띄우고
 * 참가자 앞의 모니터가 체험 화면을 띄운다.
 *
 * 여기에만 있는 것:
 * - evidence 배열 (부록 C: "영수증에 인쇄하지 않고 진행자 화면에만 띄운다")
 * - 부록 B 진행자 가이드
 * - 페르소나·신호 모드 전환
 *
 * 주의: 지금은 같은 브라우저 탭 안에서만 상태가 공유된다. 두 기기로 나누려면
 * Supabase Realtime 배선이 필요하다 (환경변수가 있을 때만 켜진다).
 */

const SIGNAL_MODES: { id: SignalMode; label: string; detail: string }[] = [
  { id: 'demo', label: '데모', detail: '생체는 시뮬레이터, 시선은 포인터' },
  { id: 'auto', label: '자동', detail: '가상 참가자가 전 과정을 스스로 수행' },
  { id: 'live', label: '실기기', detail: '밴드·GSR·아이트래커 (M5)' },
];

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-paper/8 bg-ink-900/60 p-5">
      <h2 className="text-[10px] tracking-[0.2em] text-paper-mute">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function OperatorPage() {
  const scene = useSession((s) => s.scene);
  const status = useSession((s) => s.status);
  const sessionId = useSession((s) => s.sessionId);
  const mode = useSession((s) => s.mode);
  const signalMode = useSession((s) => s.signalMode);
  const personaId = useSession((s) => s.personaId);
  const receipt = useSession((s) => s.receipt);
  const fallback = useSession((s) => s.receiptFallback);
  const setSignalMode = useSession((s) => s.setSignalMode);
  const setPersona = useSession((s) => s.setPersona);
  const pause = useSession((s) => s.pause);
  const resume = useSession((s) => s.resume);
  const abort = useSession((s) => s.abort);

  const sources = useSourceSnapshots();
  const [recent, setRecent] = useState<SessionRecord[]>([]);

  useEffect(() => {
    // 저장은 체험 창에서 일어나므로 주기적으로 다시 읽는다
    const read = () => setRecent(listLocal(8));
    read();
    const t = setInterval(read, 4000);
    return () => clearInterval(t);
  }, []);

  const sceneDefIdx = SCENES.findIndex((s) => s.id === scene);

  return (
    <main className="min-h-dvh bg-ink-950 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-[11px] tracking-[0.24em] text-paper-mute">OPERATOR</h1>
            <p className="tnum mt-2 text-[15px] font-light text-paper">{sessionId}</p>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-paper-mute">
            <span>
              {String(Math.max(1, sceneDefIdx + 1)).padStart(2, '0')} / {SCENES.length} ·{' '}
              {SCENES[Math.max(0, sceneDefIdx)]?.label}
            </span>
            <span>{status}</span>
            <span>{mode === 'full' ? '전체' : '압축'}</span>
            <Link href="/experience" className="underline-offset-4 hover:text-paper-dim hover:underline">
              체험 화면
            </Link>
          </div>
        </header>

        <div className="mt-6 rounded-2xl border border-paper/8 bg-ink-900/60 px-5 py-4">
          <VitalsReadout />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel title="신호 모드">
            <div className="space-y-1.5">
              {SIGNAL_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSignalMode(m.id)}
                  className={`flex w-full items-baseline gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-300 ${
                    signalMode === m.id ? 'bg-paper/[0.07]' : 'hover:bg-paper/[0.03]'
                  }`}
                >
                  <span
                    className={`text-[13px] ${signalMode === m.id ? 'text-paper' : 'text-paper-dim'}`}
                  >
                    {m.label}
                  </span>
                  <span className="text-[11px] text-paper-mute">{m.detail}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-paper-mute/70">
              모드를 바꾸면 센서가 다시 연결됩니다. 체험 중에는 바꾸지 마세요.
            </p>
          </Panel>

          <Panel title="가상 참가자">
            <div className="space-y-1.5">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPersona(p.id)}
                  className={`block w-full rounded-lg px-3 py-2.5 text-left transition-colors duration-300 ${
                    personaId === p.id ? 'bg-paper/[0.07]' : 'hover:bg-paper/[0.03]'
                  }`}
                >
                  <span
                    className={`text-[13px] ${personaId === p.id ? 'text-paper' : 'text-paper-dim'}`}
                  >
                    {p.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-paper-mute">
                    {p.blurb}
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="센서">
            {sources.length === 0 ? (
              <p className="text-[11.5px] text-paper-mute">
                연결된 소스가 없습니다. 체험 화면을 먼저 여세요.
              </p>
            ) : (
              <ul className="space-y-2">
                {sources.map((s) => (
                  <li key={s.kind} className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] text-paper-dim">{s.label}</span>
                    <span className="text-[11px] text-paper-mute">
                      {s.status} · {s.quality}
                      {s.error ? ` · ${s.error}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="진행 제어">
            <div className="flex flex-wrap gap-2">
              {[
                { label: '일시정지', fn: pause },
                { label: '재개', fn: resume },
                { label: '중단', fn: () => abort('진행자가 세션을 중단했습니다.') },
              ].map((b) => (
                <button
                  key={b.label}
                  onClick={b.fn}
                  className="rounded-full border border-paper/15 px-4 py-2 text-[11.5px] text-paper-dim transition-colors duration-300 hover:border-paper/35 hover:text-paper"
                >
                  {b.label}
                </button>
              ))}
            </div>
            <p className="mt-4 text-[10.5px] leading-relaxed text-paper-mute/70">
              씬 이동은 체험 화면에서 ← → 키로 합니다.
            </p>
          </Panel>
        </div>

        {/* 부록 C: evidence는 여기에만 뜬다 */}
        <div className="mt-5">
          <Panel title="해석 근거 (참가자에게 보이지 않음)">
            {!receipt ? (
              <p className="text-[11.5px] text-paper-mute">아직 해석 결과가 없습니다.</p>
            ) : (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="text-[14px] text-paper">{receipt.persona_name}</span>
                  <span className="text-[11.5px] text-paper-mute">{receipt.one_liner}</span>
                  {fallback && (
                    <span className="text-[10px] text-warn">규칙 기반</span>
                  )}
                </div>
                <ul className="mt-4 space-y-2">
                  {receipt.evidence.map((e, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[12px] text-paper-dim">{e.claim}</span>
                      <code className="rounded bg-paper/[0.06] px-1.5 py-0.5 text-[10.5px] text-paper-mute">
                        {e.source}
                      </code>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel title="최근 세션">
            {recent.length === 0 ? (
              <p className="text-[11.5px] text-paper-mute">저장된 세션이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-paper/6">
                {recent.map((r) => (
                  <li key={r.session_id} className="flex items-baseline justify-between gap-3 py-2.5">
                    <Link
                      href={`/receipt/${r.session_id}`}
                      className="tnum text-[12px] text-paper-dim underline-offset-4 hover:text-paper hover:underline"
                    >
                      {r.session_id}
                    </Link>
                    <span className="truncate text-[11px] text-paper-mute">
                      {r.receipt.persona_name}
                      {r.fallback ? ' · 규칙' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[10.5px] leading-relaxed text-paper-mute/70">
              저장소: 로컬{hasSupabase() ? ' + Supabase' : ' (Supabase 미설정)'}
            </p>
          </Panel>

          <Panel title="진행자 가이드 (부록 B)">
            <ul className="space-y-2.5">
              {OPERATOR_GUIDE.map((g) => (
                <li key={g} className="flex gap-2.5 text-[11.5px] leading-[1.7] text-paper-dim">
                  <span className="mt-2 h-px w-3 shrink-0 bg-paper/25" aria-hidden />
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </main>
  );
}
