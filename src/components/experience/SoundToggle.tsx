'use client';

import { heartbeat } from '@/lib/audio/heartbeat';
import { useSession } from '@/lib/session/store';

/**
 * 심장 소리 스위치.
 *
 * 체험 내내 화면 구석에 있어야 한다 — 소리는 되돌릴 수 있어야 하는 종류의 결정이고,
 * 부스에서 옆 사람이 신경 쓰이면 즉시 끌 수 있어야 한다.
 */
export default function SoundToggle({ className = '' }: { className?: string }) {
  const soundOn = useSession((s) => s.soundOn);
  const setSoundOn = useSession((s) => s.setSoundOn);

  const toggle = () => {
    const next = !soundOn;
    setSoundOn(next);
    // enable()은 클릭 핸들러 안에서 불러야 브라우저가 오디오를 허용한다
    if (next) void heartbeat.enable();
    else heartbeat.disable();
  };

  return (
    <button
      onClick={toggle}
      aria-pressed={soundOn}
      className={`pointer-events-auto inline-flex min-h-[36px] items-center gap-2 rounded-full border border-line px-3.5 text-[13px] font-semibold transition-colors duration-200 ${
        soundOn
          ? 'bg-surface-raised text-ink hover:bg-surface-sunken'
          : 'bg-transparent text-ink-3 hover:text-ink'
      } ${className}`}
    >
      <span aria-hidden style={{ color: soundOn ? 'var(--color-hr)' : 'currentColor' }}>
        {soundOn ? '♥' : '♡'}
      </span>
      {soundOn ? '심장 소리 켜짐' : '심장 소리 꺼짐'}
    </button>
  );
}
