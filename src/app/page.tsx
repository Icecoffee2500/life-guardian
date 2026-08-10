import Link from 'next/link';

/** M4에서 비전 스토리텔링 랜딩으로 교체된다. */
export default function Home() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-8 bg-ink-950 px-6">
      <p className="text-[10px] uppercase tracking-[0.28em] text-paper-mute">Life Guardian</p>
      <h1 className="scene-title text-center text-[clamp(1.8rem,5vw,3.2rem)]">
        당신의 몸은 이미 알고 있습니다
      </h1>
      <Link
        href="/experience"
        className="rounded-full border border-paper/20 px-8 py-3 text-[13px] tracking-[0.08em] text-paper transition-colors duration-500 hover:border-paper/45 hover:bg-paper/[0.06]"
      >
        체험 시작
      </Link>
    </main>
  );
}
