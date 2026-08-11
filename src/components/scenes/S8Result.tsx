'use client';

import { motion } from 'motion/react';
import SceneShell from './SceneShell';
import Button from '@/components/ui/Button';
import SignalCanvas from '@/components/SignalCanvas';
import { RECOMMENDATION_KEYS } from '@/lib/interpret/schema';
import { useSession } from '@/lib/session/store';

/**
 * S8 — 결과.
 *
 * 여기서 처음이자 마지막으로 브랜드 블루가 나온다. 10분 내내 무채색으로 참았기 때문에
 * 이 한 번이 힘을 갖는다. 색을 아껴 쓴다는 건 이럴 때 쓰려고 아끼는 것이다.
 *
 * 화면은 요약이고, 인쇄용 영수증은 /receipt/[sessionId]가 맡는다 (M4).
 */

const REVEAL = { duration: 0.9, ease: [0.22, 0.61, 0.36, 1] as const };

export default function S8Result() {
  const receipt = useSession((s) => s.receipt);
  const fallback = useSession((s) => s.receiptFallback);
  const sessionId = useSession((s) => s.sessionId);
  const nickname = useSession((s) => s.nickname);
  const reset = useSession((s) => s.reset);

  if (!receipt) {
    return (
      <SceneShell className="px-6">
        <motion.p
          className="text-[13px] font-light text-paper-dim"
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        >
          해석을 정리하고 있습니다
        </motion.p>
      </SceneShell>
    );
  }

  return (
    <SceneShell align="stretch" className="overflow-y-auto px-6 sm:px-10">
      <div className="mx-auto w-full max-w-2xl py-24">
        {/* 헤드라인 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={REVEAL}
          className="text-center"
        >
          <p className="text-[10px] tracking-[0.24em] text-paper-mute">
            {nickname ? `${nickname} 님의` : '오늘의'} BIO-RECEIPT
          </p>
          <h1
            className="scene-title mt-5 text-[clamp(1.9rem,5vw,3rem)]"
            style={{ color: 'var(--color-paper)' }}
          >
            {receipt.persona_name}
          </h1>
          <p className="mt-4 text-[clamp(0.95rem,2vw,1.15rem)] font-light text-brand">
            {receipt.one_liner}
          </p>
        </motion.div>

        {/* 심박 한 줄 — 이 결과가 몸에서 나왔다는 표시 */}
        <motion.div
          className="mx-auto mt-10 h-10 w-full max-w-sm opacity-70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ ...REVEAL, delay: 0.3 }}
        >
          <SignalCanvas variant="strip" channels={['hr']} className="h-full w-full" speed={44} />
        </motion.div>

        {/* 무의식 요약 */}
        <motion.ul
          className="mt-14 space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...REVEAL, delay: 0.45 }}
        >
          {receipt.unconscious_summary.map((s, i) => (
            <li key={s} className="flex gap-4">
              <span className="tnum mt-1 shrink-0 text-[10px] tracking-[0.1em] text-paper-mute">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-[14.5px] font-light leading-[1.75] text-paper">{s}</span>
            </li>
          ))}
        </motion.ul>

        {/* 숨은 발견 — 이 체험의 핵심. 있을 때만 나온다. */}
        {receipt.hidden_finding && (
          <motion.div
            className="mt-12 rounded-2xl border border-paper/10 bg-ink-900 p-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...REVEAL, delay: 0.6 }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] tracking-[0.2em] text-paper-mute">나도 몰랐던 나</span>
              <span className="text-[10px] tracking-[0.1em] text-paper-mute">
                확신 {receipt.hidden_finding.confidence}
              </span>
            </div>
            <p className="mt-4 text-[14.5px] font-light leading-[1.75] text-paper">
              {receipt.hidden_finding.observation}
            </p>
            <p className="mt-2 text-[13px] font-light leading-[1.75] text-paper-dim">
              {receipt.hidden_finding.reading}
            </p>
          </motion.div>
        )}

        {/* 추천 */}
        <motion.div
          className="mt-12 divide-y divide-paper/8 overflow-hidden rounded-2xl border border-paper/8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...REVEAL, delay: 0.75 }}
        >
          {RECOMMENDATION_KEYS.map((key) => {
            const items = receipt.recommendations[key];
            if (!items?.length) return null;
            return (
              <div key={key} className="flex gap-5 px-5 py-4">
                <span className="w-14 shrink-0 pt-0.5 text-[11px] tracking-[0.14em] text-paper-mute">
                  {key}
                </span>
                <div className="min-w-0 flex-1 space-y-2.5">
                  {items.map((it) => (
                    <div key={it.name}>
                      <div className="text-[14px] font-light text-paper">{it.name}</div>
                      <div className="mt-0.5 text-[11.5px] leading-relaxed text-paper-mute">
                        {it.why}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* 튜닝 퀘스트 */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...REVEAL, delay: 0.9 }}
        >
          <span className="text-[10px] tracking-[0.2em] text-paper-mute">오늘의 튜닝 퀘스트</span>
          <p className="mt-4 text-balance text-[clamp(1rem,2.2vw,1.3rem)] font-light leading-relaxed text-paper">
            {receipt.tuning_quest}
          </p>
        </motion.div>

        {/* 꼬리말 */}
        <motion.div
          className="mt-16 flex flex-col items-center gap-5 border-t border-paper/8 pt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...REVEAL, delay: 1.05 }}
        >
          <p className="text-center text-[11px] leading-relaxed text-paper-mute">
            {receipt.disclaimer}
          </p>
          <div className="flex items-center gap-3 text-[10px] tracking-[0.14em] text-paper-mute/70">
            <span className="tnum">{sessionId}</span>
            {fallback && <span>· 규칙 기반 해석</span>}
          </div>
          <Button variant="ghost" onClick={reset} className="mt-2">
            처음으로
          </Button>
        </motion.div>
      </div>
    </SceneShell>
  );
}
