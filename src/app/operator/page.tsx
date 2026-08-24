'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import VitalsReadout from '@/components/experience/VitalsReadout';
import { connectLiveSource, useSourceSnapshots, type LiveDeviceKind } from '@/hooks/useSensors';
import { OPERATOR_GUIDE } from '@/lib/dialogue/script';
import { PERSONAS } from '@/lib/sensors/personas';
import { hasSupabase } from '@/lib/supabase/client';
import { listLocal } from '@/lib/storage/persist';
import type { SessionRecord } from '@/lib/storage/record';
import { SCENES } from '@/lib/session/scenes';
import {
  SessionReceiver,
  STALE_MS,
  type LiveSessionState,
  type SessionCommand,
} from '@/lib/session/channel';
import { useSession, type SignalMode } from '@/lib/session/store';
import type { HealthResponse } from '@/app/api/health/route';

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
 * 체험 화면과는 채널로 이어져 있다. 같은 기기의 다른 창은 BroadcastChannel로,
 * 다른 기기는 Supabase Realtime broadcast로 (환경변수가 있을 때만).
 * 실황이 들어오면 헤더에 '실황 연결됨'이 뜨고, 그때는 이 화면의 값이
 * 체험 화면의 것이다. 실황이 없으면 이 탭의 스토어를 그대로 보여준다.
 */

const SIGNAL_MODES: { id: SignalMode; label: string; detail: string }[] = [
  { id: 'demo', label: '데모', detail: '생체는 시뮬레이터, 시선은 포인터' },
  { id: 'auto', label: '자동', detail: '가상 참가자가 전 과정을 스스로 수행' },
  { id: 'live', label: '실기기', detail: '밴드·GSR·아이트래커 (M5)' },
];

function LiveMetric({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number | null;
  unit: string;
  color: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="mb-px inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="t-label">{label}</span>
      <span className="t-number text-ink">{value ?? '—'}</span>
      <span className="t-label">{unit}</span>
    </div>
  );
}

function CtlButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="t-body-strong rounded-[4px] border border-line-strong px-4 py-2 text-ink-2 transition-colors duration-200 hover:bg-surface-sunken hover:text-ink"
    >
      {children}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface-raised p-5">
      <h2 className="t-label">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * 서버 진단.
 *
 * 영수증에 "규칙 기반 해석"이 찍히는 이유는 두 가지로 갈린다:
 * 키가 서버에 안 보이거나(환경변수 스코프·재배포 누락), 호출이 실패했거나.
 * 이 둘을 구분하지 못하면 부스에서 손쓸 방법이 없다.
 *
 * 키 값은 절대 받아오지 않는다 — 있는지 여부와 길이만 본다.
 */
async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

function HealthPanel() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const apply = useCallback((data: HealthResponse | null) => {
    setHealth(data);
    setFailed(data === null);
  }, []);

  useEffect(() => {
    // 상태 갱신은 콜백 안에서만 한다. 이펙트 본문에서 동기 setState를 하면
    // 렌더가 연쇄로 다시 돈다 (react-hooks/set-state-in-effect).
    let alive = true;
    void fetchHealth().then((data) => {
      if (alive) apply(data);
    });
    return () => {
      alive = false;
    };
  }, [apply]);

  const row = (label: string, value: string, warn = false) => (
    <li className="flex items-baseline justify-between gap-3 py-2.5">
      <span className="t-label">{label}</span>
      <span
        className="t-body-strong text-[14px]"
        style={{ color: warn ? 'var(--color-warn)' : 'var(--color-ink)' }}
      >
        {value}
      </span>
    </li>
  );

  return (
    <Panel title="서버 진단">
      {failed || !health ? (
        <p className="t-body text-ink-2">
          {failed ? '진단 정보를 가져오지 못했습니다.' : '확인하는 중입니다.'}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {row(
            '해석 API 키',
            health.interpretKey ? `있음 (${health.interpretKeyLength}자)` : '없음',
            !health.interpretKey,
          )}
          {row('해석 모델', health.interpretModel)}
          {row('세션 저장소', health.supabase ? 'Supabase 연결됨' : '로컬만')}
          {row('환경', health.env)}
        </ul>
      )}
      <div className="mt-4 flex flex-col items-start gap-3">
        {health && !health.interpretKey && (
          <p className="text-[13px] leading-snug text-ink-3">
            키를 넣었는데도 &lsquo;없음&rsquo;이면 해당 환경(Production/Preview)에 체크가 빠졌거나,
            키를 추가한 뒤 재배포를 하지 않은 것입니다.
          </p>
        )}
        <button
          onClick={() => void fetchHealth().then(apply)}
          className="t-label underline underline-offset-4 hover:text-ink"
        >
          다시 확인
        </button>
      </div>
    </Panel>
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
  const reason = useSession((s) => s.receiptReason);
  const setSignalMode = useSession((s) => s.setSignalMode);
  const setPersona = useSession((s) => s.setPersona);
  const pause = useSession((s) => s.pause);
  const resume = useSession((s) => s.resume);
  const abort = useSession((s) => s.abort);
  const advance = useSession((s) => s.advance);
  const back = useSession((s) => s.back);
  const reset = useSession((s) => s.reset);

  // 1초마다 다시 읽는다 — 실효 Hz는 상태가 '수신'인 채로 변하기 때문이다
  const localSources = useSourceSnapshots(1000);
  const [recent, setRecent] = useState<SessionRecord[]>([]);

  useEffect(() => {
    // 저장은 체험 창에서 일어나므로 주기적으로 다시 읽는다
    const read = () => setRecent(listLocal(8));
    read();
    const t = setInterval(read, 4000);
    return () => clearInterval(t);
  }, []);

  // 체험 화면의 실황. 같은 기기의 다른 창이면 BroadcastChannel로,
  // 다른 기기면 Supabase Realtime으로 들어온다.
  const [live, setLive] = useState<LiveSessionState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const rxRef = useRef<SessionReceiver | null>(null);
  useEffect(() => {
    const rx = new SessionReceiver();
    rxRef.current = rx;
    const stop = rx.start(setLive);
    // 실황이 끊긴 것을 알아채려면 시계가 돌아야 한다
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop();
      clearInterval(t);
      rxRef.current = null;
    };
  }, []);

  /**
   * 진행자 조작은 두 곳에 동시에 건다:
   * 이 탭의 스토어(단일 창 운영)와 채널(창·기기가 나뉜 운영).
   * 어느 구성이든 버튼 하나로 동작해야 한다.
   */
  // 실기기 연결 상태 (이 창에 센서가 붙어 있을 때만 의미가 있다)
  const [linking, setLinking] = useState<LiveDeviceKind | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const liveHere = localSources.length > 0;

  const linkDevice = useCallback(async (kind: LiveDeviceKind) => {
    setLinkError(null);
    setLinking(kind);
    const res = await connectLiveSource(kind);
    setLinking(null);
    if (!res.ok) setLinkError(`${kind} 연결 실패: ${res.error}`);
  }, []);

  const command = useCallback((c: SessionCommand, local: () => void) => {
    local();
    rxRef.current?.send(c);
  }, []);

  const fresh = live !== null && now - live.at < STALE_MS;
  // 실황이 살아 있으면 그쪽이 진실이다. 없으면 이 탭의 스토어를 쓴다(단일 창 운영).
  const shownScene = fresh ? live.scene : scene;
  const shownStatus = fresh ? live.status : status;
  const shownSessionId = fresh ? live.sessionId : sessionId;
  const sources = fresh ? live.sources : localSources;

  const sceneDefIdx = SCENES.findIndex((s) => s.id === shownScene);

  return (
    <main className="min-h-dvh px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="t-label">OPERATOR</h1>
            <p className="t-number mt-2 text-[17px] text-ink">{shownSessionId}</p>
          </div>
          <div className="t-label flex items-center gap-4">
            <span>
              {String(Math.max(1, sceneDefIdx + 1)).padStart(2, '0')} / {SCENES.length} ·{' '}
              {SCENES[Math.max(0, sceneDefIdx)]?.label}
            </span>
            <span>{shownStatus}</span>
            <span>{mode === 'full' ? '전체' : '압축'}</span>
            <span
              className={fresh ? 'text-hrv' : 'text-ink-3'}
              title={fresh ? '체험 화면과 연결됨' : '체험 화면의 실황이 들어오지 않습니다'}
            >
              {fresh ? '실황 연결됨' : '실황 없음'}
            </span>
            <Link href="/experience" className="underline-offset-4 hover:text-ink hover:underline">
              체험 화면
            </Link>
          </div>
        </header>

        <div className="mt-6 rounded-2xl border border-line bg-surface-raised px-5 py-4">
          {fresh ? (
            // 다른 기기의 체험 화면을 볼 때는 이 탭에 센서가 없다. 실황 값을 그대로 보여준다.
            <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
              <LiveMetric label="HR" value={live!.hr} unit="bpm" color="var(--color-hr)" />
              <LiveMetric label="HRV" value={live!.rmssd} unit="ms" color="var(--color-hrv)" />
              <LiveMetric label="GSR" value={live!.gsr} unit="µS" color="var(--color-gsr)" />
              {live!.settled && <span className="t-label text-hrv">안정</span>}
            </div>
          ) : (
            <VitalsReadout />
          )}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel title="신호 모드">
            <div className="space-y-1.5">
              {SIGNAL_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => command({ kind: 'signal-mode', value: m.id }, () => setSignalMode(m.id))}
                  className={`flex w-full items-baseline gap-3 rounded-[4px] px-3 py-2.5 text-left transition-colors duration-200 ${
                    signalMode === m.id
                      ? 'bg-brand text-white'
                      : 'border border-line hover:bg-surface-sunken'
                  }`}
                >
                  <span className="t-body-strong">{m.label}</span>
                  <span className={`t-label ${signalMode === m.id ? 'text-ink-on-inverse opacity-70' : ''}`}>
                    {m.detail}
                  </span>
                </button>
              ))}
            </div>
            <p className="t-label mt-3">모드를 바꾸면 센서가 다시 연결됩니다. 체험 중에는 바꾸지 마세요.</p>
          </Panel>

          <Panel title="가상 참가자">
            <div className="space-y-1.5">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => command({ kind: 'persona', value: p.id }, () => setPersona(p.id))}
                  className={`block w-full rounded-[4px] px-3 py-2.5 text-left transition-colors duration-200 ${
                    personaId === p.id
                      ? 'bg-brand text-white'
                      : 'border border-line hover:bg-surface-sunken'
                  }`}
                >
                  <span className="t-body-strong block">{p.name}</span>
                  <span className={`t-label mt-0.5 block leading-snug ${personaId === p.id ? 'text-ink-on-inverse opacity-70' : ''}`}>
                    {p.blurb}
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="센서">
            {sources.length === 0 ? (
              <p className="t-body text-ink-2">연결된 소스가 없습니다. 체험 화면을 먼저 여세요.</p>
            ) : (
              <ul className="space-y-2.5">
                {sources.map((s) => (
                  <li key={s.kind} className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <span className="t-body-strong text-ink">{s.label}</span>
                      <span className="t-label ml-2">
                        {s.status} · {s.quality}
                        {s.hz !== undefined && ` · ${s.hz.toFixed(0)}Hz`}
                      </span>
                      {s.error && <span className="t-label mt-0.5 block text-warn">{s.error}</span>}
                    </div>
                    {/*
                      실기기 연결은 반드시 이 버튼(=사용자 제스처)에서 시작해야 한다.
                      requestDevice/requestPort는 제스처 없이는 거부되고,
                      셋을 한꺼번에 부르면 선택 다이얼로그가 겹쳐 두 번째부터 실패한다.
                      진행자는 이 화면에서 기기를 하나씩 붙인다.
                    */}
                    {s.mode !== 'live' && (
                      <button
                        onClick={() => linkDevice(s.kind as LiveDeviceKind)}
                        disabled={linking === s.kind || !liveHere}
                        title={
                          liveHere
                            ? '이 기기를 실기기로 교체합니다'
                            : '실기기 연결은 체험 화면이 열려 있는 창에서 눌러야 합니다'
                        }
                        className="t-label shrink-0 rounded-[4px] border border-line-strong px-3 py-1.5 text-ink-2 transition-colors duration-200 hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {linking === s.kind ? '연결 중' : '실기기 연결'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {linkError && <p className="t-label mt-3 text-warn">{linkError}</p>}
            {!liveHere && sources.length > 0 && (
              <p className="t-label mt-3">
                실기기 연결은 센서가 붙어 있는 창에서만 됩니다. 체험 화면을 이 창에서 열거나,
                체험 화면 쪽에서 연결하세요.
              </p>
            )}
          </Panel>

          <Panel title="진행 제어">
            <div className="flex flex-wrap gap-2">
              <CtlButton onClick={() => command({ kind: 'pause' }, pause)}>일시정지</CtlButton>
              <CtlButton onClick={() => command({ kind: 'resume' }, resume)}>재개</CtlButton>
              <CtlButton
                onClick={() =>
                  command({ kind: 'abort' }, () => abort('진행자가 세션을 중단했습니다.'))
                }
              >
                중단
              </CtlButton>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <CtlButton onClick={() => command({ kind: 'back' }, back)}>← 이전 씬</CtlButton>
              <CtlButton onClick={() => command({ kind: 'advance' }, advance)}>다음 씬 →</CtlButton>
              <CtlButton onClick={() => command({ kind: 'reset' }, reset)}>처음으로</CtlButton>
            </div>
            <p className="t-label mt-4">체험 화면에서 ← → 키로도 이동합니다.</p>
          </Panel>
        </div>

        {/* 부록 C: evidence는 여기에만 뜬다 */}
        <div className="mt-5">
          <Panel title="해석 근거 (참가자에게 보이지 않음)">
            {!receipt ? (
              <p className="t-body text-ink-2">아직 해석 결과가 없습니다.</p>
            ) : (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="t-body-strong text-ink">{receipt.persona_name}</span>
                  <span className="t-body text-ink-2">{receipt.one_liner}</span>
                  {fallback && <span className="t-label text-warn">규칙 기반</span>}
                </div>
                {fallback && (
                  <p className="mt-2 text-[13px] font-semibold text-warn">
                    폴백 사유: {reason ?? '알 수 없음'}
                  </p>
                )}
                <ul className="mt-4 space-y-2">
                  {receipt.evidence.map((e, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="t-body text-ink-2">{e.claim}</span>
                      <code className="t-label rounded-[2px] bg-surface-sunken px-1.5 py-0.5">
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
              <p className="t-body text-ink-2">저장된 세션이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((r) => (
                  <li key={r.session_id} className="flex items-baseline justify-between gap-3 py-2.5">
                    <Link
                      href={`/receipt/${r.session_id}`}
                      className="t-number text-ink-2 underline-offset-4 hover:text-ink hover:underline"
                    >
                      {r.session_id}
                    </Link>
                    <span className="t-label truncate">
                      {r.receipt.persona_name}
                      {r.fallback ? ' · 규칙' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="t-label mt-4">
              저장소: 로컬{hasSupabase() ? ' + Supabase' : ' (Supabase 미설정)'}
            </p>
          </Panel>

          <HealthPanel />

          <Panel title="진행자 가이드 (부록 B)">
            <ul className="space-y-2.5">
              {OPERATOR_GUIDE.map((g) => (
                <li key={g} className="t-body flex gap-2.5 text-ink-2">
                  <span className="mt-2.5 h-px w-3 shrink-0 bg-line-strong" aria-hidden />
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
