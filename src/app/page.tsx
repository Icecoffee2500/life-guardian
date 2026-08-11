import Link from 'next/link';
import Reveal from '@/components/landing/Reveal';
import HeroPulse from '@/components/landing/HeroPulse';

/**
 * 랜딩 — 심사위원이 URL을 열었을 때 처음 보는 화면.
 *
 * 이 페이지가 해야 할 일은 딱 하나다: **10분을 쓸 이유를 주는 것.**
 * 기능 목록도, 기술 스택도, 팀 소개도 여기 오지 않는다.
 * 주장을 한 문장씩 내려놓고, 마지막에 시작 버튼 하나만 남긴다.
 */

const PHASES = [
  {
    n: '01',
    title: '평상시의 당신을 기록합니다',
    body: '호흡을 맞추는 1분 동안 심박·HRV·피부전도의 기준선을 잡습니다. 이후의 모든 반응은 이 값 대비로만 읽습니다.',
  },
  {
    n: '02',
    title: '말 대신 몸이 답하게 둡니다',
    body: '사진 두 장 중 무엇을 먼저, 더 오래 보는지. 나무를 그릴 때 어디서 손이 멈추는지. 고르지 않아도 답은 남습니다.',
  },
  {
    n: '03',
    title: '말과 몸이 어긋난 지점을 찾습니다',
    body: '밝게 말했는데 심박이 크게 오른 순간. 그 불일치가 이 체험의 핵심 산출물입니다.',
  },
  {
    n: '04',
    title: '오늘의 관측을 한 장으로 돌려드립니다',
    body: '진단이 아닙니다. 오늘 당신의 몸이 이렇게 반응했다는 기록과, 오늘 안에 해볼 수 있는 행동 하나입니다.',
  },
];

const SIGNALS = [
  { label: '심박 · HRV', detail: '스마트밴드 · RR 간격', color: 'var(--color-hr)' },
  { label: '피부 전기전도도', detail: 'Grove GSR · SCR 진폭', color: 'var(--color-gsr)' },
  { label: '시선', detail: '첫 응시 · 체류 시간', color: 'var(--color-hrv)' },
];

export default function Home() {
  return (
    <main className="bg-ink-950">
      {/* ── 히어로 ─────────────────────────────────────────── */}
      <section className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6">
        <HeroPulse />

        <div className="relative z-10 flex flex-col items-center">
          <p className="text-[10px] uppercase tracking-[0.32em] text-paper-mute">Life Guardian</p>

          <h1 className="scene-title mt-10 text-balance text-center text-[clamp(2.1rem,6.4vw,4.6rem)]">
            당신의 몸은
            <br />
            이미 알고 있습니다
          </h1>

          <p className="mt-9 max-w-lg text-balance text-center text-[clamp(0.9rem,1.7vw,1.05rem)] font-light leading-[1.9] text-paper-dim">
            10분 동안 시선과 손과 목소리를 기록해,
            <br />
            스스로도 몰랐던 반응의 패턴을 돌려드립니다.
          </p>

          <Link
            href="/experience"
            className="mt-14 rounded-full border border-paper/20 px-9 py-3.5 text-[13px] tracking-[0.1em] text-paper transition-all duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] hover:border-paper/45 hover:bg-paper/[0.06]"
          >
            체험 시작
          </Link>

          <p className="mt-7 text-[11px] tracking-[0.08em] text-paper-mute">
            센서가 없어도 됩니다. 시뮬레이션으로 전체가 진행됩니다.
          </p>
        </div>

        <div className="absolute inset-x-0 bottom-10 flex justify-center">
          <span className="text-[10px] tracking-[0.24em] text-paper-mute/50">SCROLL</span>
        </div>
      </section>

      {/* ── 문제 제기 ──────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-[18vh]">
        <Reveal>
          <p className="text-balance text-center text-[clamp(1.3rem,3.4vw,2.3rem)] font-light leading-[1.6] tracking-[-0.02em] text-paper">
            보험은 사고가 난 뒤에 옵니다.
            <br />
            <span className="text-paper-mute">그 전에 올 수는 없을까요.</span>
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <p className="mx-auto mt-14 max-w-xl text-balance text-center text-[14px] font-light leading-[2] text-paper-dim">
            관계와 직업에서 오는 스트레스는 대부분 &lsquo;나와 맞지 않는 자리&rsquo;에서 시작됩니다.
            문제는 무엇이 맞지 않는지를 본인이 가장 늦게 안다는 것입니다. 몸은 훨씬 먼저 압니다.
          </p>
        </Reveal>
      </section>

      {/* ── 신호 ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-[14vh]">
        <Reveal>
          <p className="text-center text-[10px] tracking-[0.24em] text-paper-mute">읽는 신호</p>
        </Reveal>
        <div className="mt-10 divide-y divide-paper/8 overflow-hidden rounded-2xl border border-paper/8">
          {SIGNALS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <div className="flex items-center gap-5 px-6 py-5">
                <span
                  className="h-1 w-1 shrink-0 rounded-full"
                  style={{ background: s.color, boxShadow: `0 0 10px ${s.color}` }}
                />
                <span className="w-40 shrink-0 text-[13.5px] font-light text-paper">{s.label}</span>
                <span className="text-[11.5px] text-paper-mute">{s.detail}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 흐름 ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-[18vh]">
        <Reveal>
          <p className="text-center text-[10px] tracking-[0.24em] text-paper-mute">10분의 흐름</p>
        </Reveal>

        <div className="mt-16 space-y-20">
          {PHASES.map((p, i) => (
            <Reveal key={p.n} delay={i * 0.05}>
              <div className="flex gap-7 sm:gap-12">
                <span className="tnum shrink-0 pt-1 text-[11px] tracking-[0.1em] text-paper-mute">
                  {p.n}
                </span>
                <div className="min-w-0">
                  <h2 className="text-[clamp(1.05rem,2.4vw,1.5rem)] font-light leading-snug tracking-[-0.02em] text-paper">
                    {p.title}
                  </h2>
                  <p className="mt-4 max-w-lg text-[13.5px] font-light leading-[1.95] text-paper-dim">
                    {p.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 원칙 ───────────────────────────────────────────── */}
      <section className="border-y border-paper/8 bg-ink-900/40">
        <div className="mx-auto max-w-3xl px-6 py-[12vh]">
          <Reveal>
            <p className="text-center text-[10px] tracking-[0.24em] text-paper-mute">지키는 것</p>
          </Reveal>
          <Reveal delay={0.1}>
            <ul className="mx-auto mt-12 max-w-xl space-y-5">
              {[
                '진단하지 않습니다. 오늘의 반응으로만 말합니다.',
                '근거 없는 문장을 쓰지 않습니다. 모든 해석에 참조한 지표가 남습니다.',
                '음성 원본은 저장하지 않습니다. 텍스트로 바꾼 뒤 파기합니다.',
                '언제든 답을 건너뛰거나 중단할 수 있습니다.',
              ].map((t) => (
                <li key={t} className="flex gap-4 text-[13.5px] font-light leading-[1.8] text-paper-dim">
                  <span className="mt-2.5 h-px w-4 shrink-0 bg-paper/25" aria-hidden />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── 닫는 말 ────────────────────────────────────────── */}
      <section className="flex min-h-[70vh] flex-col items-center justify-center px-6">
        <Reveal>
          <p className="text-balance text-center text-[clamp(1.4rem,3.6vw,2.4rem)] font-light leading-[1.55] tracking-[-0.025em] text-paper">
            10분 뒤, 당신은
            <br />
            자신에 대해 한 가지를 더 알게 됩니다.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="mt-14 flex flex-col items-center">
            <Link
              href="/experience"
              className="rounded-full border border-paper/20 px-9 py-3.5 text-[13px] tracking-[0.1em] text-paper transition-all duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] hover:border-paper/45 hover:bg-paper/[0.06]"
            >
              체험 시작
            </Link>
            <p className="mt-6 text-[11px] tracking-[0.08em] text-paper-mute">
              시간이 없다면 3분 압축 모드로도 완주할 수 있습니다.
            </p>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-paper/8 px-6 py-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3">
          <p className="text-[10px] tracking-[0.24em] text-paper-mute">LIFENOLOGY LAB 3기</p>
          <p className="text-center text-[10.5px] leading-relaxed text-paper-mute/70">
            이 체험은 상담도 진단도 아니며, 결과는 오늘 측정된 반응의 요약입니다.
          </p>
        </div>
      </footer>
    </main>
  );
}
