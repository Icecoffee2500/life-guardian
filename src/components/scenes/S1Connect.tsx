'use client';

import { useEffect } from 'react';
import { motion } from 'motion/react';
import SceneShell, { SceneCaption, SceneTitle } from './SceneShell';
import SignalCanvas from '@/components/SignalCanvas';
import { useSourceSnapshots } from '@/hooks/useSensors';
import type { SourceSnapshot } from '@/lib/sensors/types';

const KIND_META: Record<string, { title: string; detail: string; color: string }> = {
  band: { title: '심박 · HRV', detail: '스마트밴드', color: 'var(--color-hr)' },
  gsr: { title: '피부 전기전도도', detail: 'Grove GSR', color: 'var(--color-gsr)' },
  gaze: { title: '시선', detail: '아이트래커', color: 'var(--color-hrv)' },
};

function StatusDot({ s }: { s: SourceSnapshot }) {
  const color = KIND_META[s.kind]?.color ?? 'var(--color-paper)';
  if (s.status === 'streaming') {
    return (
      <span className="relative flex h-1.5 w-1.5">
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-60"
          style={{ background: color, animation: 'pulse-ring 2.4s var(--ease-calm) infinite' }}
        />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      </span>
    );
  }
  if (s.status === 'error') return <span className="h-1.5 w-1.5 rounded-full bg-warn" />;
  return (
    <motion.span
      className="h-1.5 w-1.5 rounded-full bg-paper/30"
      animate={{ opacity: [0.25, 0.8, 0.25] }}
      transition={{ duration: 1.6, repeat: Infinity }}
    />
  );
}

function SourceRow({ s, index }: { s: SourceSnapshot; index: number }) {
  const meta = KIND_META[s.kind] ?? { title: s.kind, detail: '', color: 'var(--color-paper)' };
  const live = s.status === 'streaming';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.09 * index, duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
      className="flex items-center gap-4 px-5 py-4"
    >
      <StatusDot s={s} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-light text-paper">{meta.title}</div>
        <div className="mt-0.5 truncate text-[11px] text-paper-mute">{s.label}</div>
      </div>

      {/* 연결되기 전에는 평탄선. 연결되는 순간 그 자리에서 신호가 살아난다. */}
      <div className="relative h-8 w-24 shrink-0 sm:w-32">
        {live && s.kind !== 'gaze' ? (
          <SignalCanvas
            variant="strip"
            channels={s.kind === 'band' ? ['hr'] : ['gsr']}
            className="h-full w-full"
            speed={46}
          />
        ) : (
          <div className="flex h-full items-center">
            <motion.div
              className="h-px w-full"
              style={{ background: live ? meta.color : 'rgba(236,233,227,0.14)' }}
              animate={live ? { opacity: [0.3, 0.75, 0.3] } : { opacity: 0.5 }}
              transition={live ? { duration: 2.6, repeat: Infinity } : undefined}
            />
          </div>
        )}
      </div>

      <span className="w-12 shrink-0 text-right text-[10px] tracking-[0.1em] text-paper-mute">
        {s.status === 'streaming'
          ? '수신'
          : s.status === 'connecting'
            ? '연결'
            : s.status === 'error'
              ? '실패'
              : '대기'}
      </span>
    </motion.div>
  );
}

/**
 * S1 — 장비 연결.
 *
 * 이 씬의 목적은 절차가 아니라 첫 번째 "와우"다.
 * 밴드가 붙는 순간 화면 전체에 참가자의 심박이 살아난다.
 */
export default function S1Connect({ onDone }: { onDone: () => void }) {
  const sources = useSourceSnapshots();
  const ready = sources.length > 0 && sources.every((s) => s.status === 'streaming');
  const heroIn = sources.some((s) => s.kind === 'band' && s.status === 'streaming');

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [ready, onDone]);

  return (
    <SceneShell className="px-6">
      {/* 밴드가 붙는 순간 배경 전체에 심박이 흐른다 */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: heroIn ? 1 : 0 }}
        transition={{ duration: 2.4, ease: 'easeOut' }}
      >
        <SignalCanvas variant="hero" channels={['hr']} className="h-full w-full" intensity={0.28} />
      </motion.div>

      <div className="relative z-10 w-full max-w-md">
        <SceneTitle className="!text-[clamp(1.4rem,3.2vw,2.1rem)]">신호를 연결합니다</SceneTitle>
        <SceneCaption className="mt-3">
          센서가 없어도 괜찮습니다. 시뮬레이션으로 그대로 진행됩니다.
        </SceneCaption>

        <div className="mt-9 divide-y divide-paper/8 overflow-hidden rounded-2xl border border-paper/8 bg-ink-900/70">
          {sources.map((s, i) => (
            <SourceRow key={s.kind} s={s} index={i} />
          ))}
        </div>

        <motion.p
          className="mt-8 text-center text-[11px] tracking-[0.14em] text-paper-mute"
          animate={{ opacity: ready ? 1 : 0.3 }}
          transition={{ duration: 0.8 }}
        >
          {ready ? '연결되었습니다' : '연결하는 중입니다'}
        </motion.p>
      </div>
    </SceneShell>
  );
}
