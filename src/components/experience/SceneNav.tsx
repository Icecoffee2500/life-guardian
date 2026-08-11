'use client';

import { motion } from 'motion/react';

/**
 * 씬 이동 조작.
 *
 * 체험이 시간에 쫓기면 안 된다. 예정된 시간이 지나도 화면은 그대로 있고,
 * 넘어가는 것은 언제나 사람이 정한다. 타이머는 재촉이 아니라 안내다.
 *
 * 되돌아가는 길도 함께 둔다 — 앞으로만 갈 수 있는 화면은
 * 잘못 눌렀을 때 세션 전체를 다시 시작하게 만든다.
 *
 * 준비가 되면(예정 시간을 채우면) '다음'이 채운 면으로 바뀐다.
 * 그 전에도 누를 수 있다 — 다 봤으면 기다릴 이유가 없다.
 */
export default function SceneNav({
  onBack,
  onNext,
  canBack,
  canNext,
  ready,
  nextLabel = '다음',
}: {
  onBack: () => void;
  onNext: () => void;
  canBack: boolean;
  canNext: boolean;
  /** 이 씬이 예정한 시간·시퀀스를 마쳤는가 */
  ready: boolean;
  nextLabel?: string;
}) {
  const base =
    'pointer-events-auto inline-flex min-h-[44px] items-center justify-center rounded-[4px] px-5 text-[15px] font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onBack}
        disabled={!canBack}
        className={`${base} border border-line-strong bg-surface-raised text-ink-2 hover:bg-surface-sunken hover:text-ink`}
      >
        이전
      </button>

      <motion.button
        onClick={onNext}
        disabled={!canNext}
        /* 스크린샷 하네스가 "이 씬이 제 할 일을 마쳤는가"를 보는 자리 */
        data-scene-next
        data-ready={ready}
        className={`${base} ${
          ready
            ? 'bg-surface-inverse text-ink-on-inverse hover:bg-[#2a2a30]'
            : 'border border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken'
        }`}
        /* 준비가 됐을 때 한 번만 조용히 알린다. 계속 깜빡이면 그게 또 재촉이다. */
        animate={ready ? { scale: [1, 1.035, 1] } : { scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
      >
        {nextLabel}
      </motion.button>
    </div>
  );
}
