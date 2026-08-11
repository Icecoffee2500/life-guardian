import Link from 'next/link';
import Reveal from '@/components/landing/Reveal';
import HeroPulse from '@/components/landing/HeroPulse';
import Button from '@/components/ui/Button';

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
    <main>
      {/* ── 히어로 ─────────────────────────────────────────── */}
      <section className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6">
        <HeroPulse />

        <div className="relative z-10 flex flex-col items-center">
          {/* "LIFE GUARDIAN"은 짧은 라틴 로고 라벨이라 t-label의 좁은 자간 대신
              넓은 자간을 그대로 유지한다 — 한글 본문과 달리 넓혀도 읽기가 나빠지지 않는다. */}
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.28em]"
            style={{ color: 'var(--color-brand)' }}
          >
            Life Guardian
          </p>

          {/* 제출 영상의 인상 그대로 — 흰 화면 위의 파란 한 문장 */}
          <h1
            className="t-hero mt-10 text-balance text-center"
            style={{ color: 'var(--color-brand)' }}
          >
            당신의 몸은
            <br />
            이미 알고 있습니다
          </h1>

          <p className="t-body mt-9 max-w-lg text-balance text-center text-ink-2">
            10분 동안 시선과 손과 목소리를 기록해,
            <br />
            스스로도 몰랐던 반응의 패턴을 돌려드립니다.
          </p>

          <Link href="/experience" className="mt-14">
            <Button variant="primary" size="lg">
              체험 시작
            </Button>
          </Link>

          {/* 자간을 벌린 한 줄 — 제출 영상의 캡션 처리 */}
          <p className="t-label t-spaced mt-8">센서가 없어도 됩니다. 시뮬레이션으로 전체가 진행됩니다.</p>
        </div>

        <div className="absolute inset-x-0 bottom-10 flex justify-center">
          <span className="text-[10px] font-semibold tracking-[0.28em] text-ink-3">SCROLL</span>
        </div>
      </section>

      {/* ── 문제 제기 ──────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-[18vh]">
        <Reveal>
          <p className="t-display text-balance text-center text-ink">
            보험은 사고가 난 뒤에 옵니다.
            <br />
            <span className="text-ink-3">그 전에 올 수는 없을까요.</span>
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <p className="t-body mx-auto mt-14 max-w-xl text-balance text-center text-ink-2">
            관계와 직업에서 오는 스트레스는 대부분 &lsquo;나와 맞지 않는 자리&rsquo;에서 시작됩니다.
            문제는 무엇이 맞지 않는지를 본인이 가장 늦게 안다는 것입니다. 몸은 훨씬 먼저 압니다.
          </p>
        </Reveal>
      </section>

      {/* ── 신호 ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-[14vh]">
        <Reveal>
          <p className="t-label text-center">읽는 신호</p>
        </Reveal>
        <div className="mt-10 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {SIGNALS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <div className="flex items-center gap-5 px-6 py-5">
                {/* 점은 채널 구분용 색 표식일 뿐이다 — 밝은 바탕에선 글로우가 얼룩으로 보여 뺀다 */}
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="t-body w-40 shrink-0 text-ink">{s.label}</span>
                <span className="t-label">{s.detail}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 흐름 ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-[18vh]">
        <Reveal>
          <p className="t-label text-center">10분의 흐름</p>
        </Reveal>

        <div className="mt-16 space-y-20">
          {PHASES.map((p, i) => (
            <Reveal key={p.n} delay={i * 0.05}>
              <div className="flex gap-7 sm:gap-12">
                <span className="tnum t-label shrink-0 pt-1">{p.n}</span>
                <div className="min-w-0">
                  <h2 className="t-title text-ink">{p.title}</h2>
                  <p className="t-body mt-4 max-w-lg text-ink-2">{p.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 원칙 ───────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface-raised">
        <div className="mx-auto max-w-3xl px-6 py-[12vh]">
          <Reveal>
            <p className="t-label text-center">지키는 것</p>
          </Reveal>
          <Reveal delay={0.1}>
            <ul className="mx-auto mt-12 max-w-xl space-y-5">
              {[
                '진단하지 않습니다. 오늘의 반응으로만 말합니다.',
                '근거 없는 문장을 쓰지 않습니다. 모든 해석에 참조한 지표가 남습니다.',
                '음성 원본은 저장하지 않습니다. 텍스트로 바꾼 뒤 파기합니다.',
                '언제든 답을 건너뛰거나 중단할 수 있습니다.',
              ].map((t) => (
                <li key={t} className="t-body flex gap-4 text-ink-2">
                  <span className="mt-2.5 h-px w-4 shrink-0 bg-line-strong" aria-hidden />
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
          <p className="t-display text-balance text-center text-ink">
            10분 뒤, 당신은
            <br />
            자신에 대해 한 가지를 더 알게 됩니다.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="mt-14 flex flex-col items-center">
            <Link href="/experience">
              <Button variant="primary" size="lg">
                체험 시작
              </Button>
            </Link>
            <p className="t-label mt-6">시간이 없다면 3분 압축 모드로도 완주할 수 있습니다.</p>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-line px-6 py-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3">
          <p className="t-label">LIFENOLOGY LAB 3기</p>
          <p className="t-label text-center">
            이 체험은 상담도 진단도 아니며, 결과는 오늘 측정된 반응의 요약입니다.
          </p>
        </div>
      </footer>
    </main>
  );
}
