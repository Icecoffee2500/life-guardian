'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import SceneShell from './SceneShell';
import Button from '@/components/ui/Button';
import BioSigil from '@/components/experience/BioSigil';
import { buildSigil } from '@/lib/interpret/sigil';
import { RECOMMENDATION_KEYS } from '@/lib/interpret/schema';
import { useSession } from '@/lib/session/store';

/**
 * S8 — 결과.
 *
 * 이전 버전은 세로로 긴 문서였다. 부스에서 참가자가 스크롤을 내리는 순간
 * "읽을거리"가 되고, 옆에서 기다리는 사람은 뭘 보고 있는지 알 수 없다.
 * 그래서 **한 화면에 전부 넣는다.** 스크롤 없음이 제약이자 편집 원칙이다.
 *
 * 대신 순서대로 나타난다. 이름 → 관측 → 숨은 신호 → 제안 → 퀘스트.
 * 한 번에 쏟지 않는 이유는 연출이 아니라 읽는 순서를 정해주기 위해서다.
 */

const EASE = [0.22, 0.61, 0.36, 1] as const;
/** 글자당 타이핑 간격(ms) */
const TYPE_MS = 85;

/**
 * 페르소나명 타이핑 (구현계획 3.2.1).
 * 이름은 이 체험이 참가자에게 돌려주는 첫 마디라서, 한 글자씩 나오는 몇 초가 의미를 만든다.
 */
function useTypewriter(text: string): { shown: string; done: boolean } {
  const [state, setState] = useState({ key: text, n: 0 });
  if (state.key !== text) setState({ key: text, n: 0 });

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      const t = setTimeout(
        () => setState((s) => (s.key === text ? { key: text, n: text.length } : s)),
        0,
      );
      return () => clearTimeout(t);
    }
    const timer = setInterval(() => {
      setState((s) => {
        if (s.key !== text || s.n >= text.length) return s;
        return { key: text, n: s.n + 1 };
      });
    }, TYPE_MS);
    return () => clearInterval(timer);
  }, [text]);

  const n = state.key === text ? state.n : 0;
  return { shown: text.slice(0, n), done: n >= text.length };
}

function Block({
  children,
  delay,
  className = '',
}: {
  children: React.ReactNode;
  delay: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function S8Result() {
  const receipt = useSession((s) => s.receipt);
  const fallback = useSession((s) => s.receiptFallback);
  const sessionId = useSession((s) => s.sessionId);
  const nickname = useSession((s) => s.nickname);
  const reset = useSession((s) => s.reset);
  const llmInput = useSession((s) => s.llmInput);
  const typed = useTypewriter(receipt?.persona_name ?? '');
  const sigil = llmInput ? buildSigil(llmInput) : null;

  if (!receipt) {
    return (
      <SceneShell className="px-6">
        <div className="flex flex-col items-center gap-4">
          <div className="h-1.5 w-40 overflow-hidden rounded-[1px] bg-surface-sunken">
            <motion.div
              className="h-full w-1/3 bg-ink"
              animate={{ x: ['-100%', '300%'] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
          <p className="t-body text-ink-2">해석을 정리하고 있습니다</p>
        </div>
      </SceneShell>
    );
  }

  const hf = receipt.hidden_finding;

  return (
    <SceneShell align="stretch" className="px-5 sm:px-8">
      {/* 한 화면 안에 다 들어가야 한다. 넘치면 줄이는 게 아니라 편집이 잘못된 것이다. */}
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center gap-5 py-20">
        {/* 이름 + 시길 */}
        <Block delay={0} className="flex shrink-0 items-center justify-center gap-6 sm:gap-10">
          {sigil?.measured && (
            <div className="hidden shrink-0 sm:block">
              <BioSigil sigil={sigil} size={132} animate />
            </div>
          )}
          <div className="min-w-0 text-center sm:text-left">
          <p className="t-label">{nickname ? `${nickname} 님의 관측` : '오늘의 관측'}</p>
          <h1 className="t-display mt-2 text-ink" aria-label={receipt.persona_name}>
            <span aria-hidden>{typed.shown}</span>
            {!typed.done && (
              <span
                aria-hidden
                className="ml-1 inline-block h-[0.85em] w-[3px] translate-y-[0.05em] bg-ink align-middle"
                style={{ animation: 'caret-blink 1s steps(1,end) infinite' }}
              />
            )}
          </h1>
          <motion.p
            className="t-title mt-2 text-brand"
            initial={{ opacity: 0 }}
            animate={{ opacity: typed.done ? 1 : 0 }}
            transition={{ duration: 0.5 }}
          >
            {receipt.one_liner}
          </motion.p>
          </div>
        </Block>

        {/* 관측 + 숨은 신호 */}
        <div className="grid min-h-0 shrink-0 gap-4 lg:grid-cols-[1.15fr_1fr]">
          <Block delay={0.5} className="panel p-5">
            <p className="t-label">몸이 먼저 말한 것</p>
            <ul className="mt-3 space-y-2.5">
              {receipt.unconscious_summary.map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="t-number shrink-0 text-[13px] text-ink-3">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="t-body text-ink">{s}</span>
                </li>
              ))}
            </ul>
          </Block>

          <Block delay={0.75} className="min-h-0">
            {hf ? (
              /* 이 체험의 이름값을 하는 자리. 반전 면으로 확실히 분리한다. */
              <div className="flex h-full flex-col rounded-[4px] bg-surface-inverse p-5 text-ink-on-inverse">
                <div className="flex items-baseline justify-between">
                  <p className="t-label" style={{ color: 'rgba(242,241,237,0.72)' }}>
                    나도 몰랐던 나
                  </p>
                  <span className="t-label" style={{ color: 'rgba(242,241,237,0.72)' }}>
                    확신 {hf.confidence}
                  </span>
                </div>
                <p className="t-body-strong mt-3">{hf.observation}</p>
                <p className="t-body mt-2" style={{ color: 'rgba(242,241,237,0.78)' }}>
                  {hf.reading}
                </p>
              </div>
            ) : (
              <div className="panel flex h-full flex-col justify-center p-5">
                <p className="t-label">나도 몰랐던 나</p>
                <p className="t-body mt-3 text-ink-2">
                  오늘은 말과 몸이 크게 어긋난 지점이 없었습니다. 없는 불일치를 만들어 말하지
                  않습니다.
                </p>
              </div>
            )}
          </Block>
        </div>

        {/* 제안 — 4칸 한 줄 */}
        <Block delay={1} className="shrink-0">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {RECOMMENDATION_KEYS.map((key) => {
              const it = receipt.recommendations[key]?.[0];
              if (!it) return null;
              return (
                <div key={key} className="panel p-4">
                  <p className="t-label">{key}</p>
                  <p className="t-body-strong mt-1.5 text-ink">{it.name}</p>
                  <p className="mt-1 text-[13px] leading-snug text-ink-3">{it.why}</p>
                </div>
              );
            })}
          </div>
        </Block>

        {/* 퀘스트 + 조작 */}
        <Block delay={1.25} className="shrink-0">
          <div className="flex flex-col items-center gap-4 border-t border-line pt-5 sm:flex-row sm:justify-between">
            <div className="min-w-0 text-center sm:text-left">
              <p className="t-label">오늘의 튜닝 퀘스트</p>
              <p className="t-title mt-1 text-ink">{receipt.tuning_quest}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href={`/receipt/${sessionId}`}>
                <Button size="lg">영수증 받기</Button>
              </Link>
              <Button variant="secondary" onClick={reset}>
                처음으로
              </Button>
            </div>
          </div>
          <p className="t-label mt-3 text-center sm:text-left">
            {receipt.disclaimer} · {sessionId}
            {fallback && ' · 규칙 기반 해석'}
          </p>
        </Block>
      </div>
    </SceneShell>
  );
}
