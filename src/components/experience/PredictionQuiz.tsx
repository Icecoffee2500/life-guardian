'use client';

import { AnimatePresence, motion } from 'motion/react';
import { quizVerdict, scoreQuiz, type QuizItem } from '@/lib/experience/quiz';

/**
 * 예측 퀴즈 화면.
 *
 * 장식은 없다. 질문 하나, 보기 몇 개, 그게 전부다.
 * 이 씬에서 참가자가 해야 할 일은 정확히 한 가지이고,
 * 화면에는 그 한 가지만 있어야 한다(Rams: so wenig Design wie möglich).
 */

const EASE = [0.22, 0.61, 0.36, 1] as const;

export function QuizAsk({
  items,
  picks,
  onPick,
}: {
  items: QuizItem[];
  picks: (number | null)[];
  onPick: (index: number, option: number) => void;
}) {
  // 아직 답하지 않은 첫 문항. 전부 답했으면 마지막 문항을 그대로 둔다.
  const cursor = picks.findIndex((p) => p === null);
  const i = cursor === -1 ? items.length - 1 : cursor;
  const item = items[i];
  const answeredAll = cursor === -1;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-baseline justify-between">
        <p className="t-label">당신은 당신을 얼마나 알고 있을까요</p>
        <p className="t-number text-[13px] text-ink-3">
          {Math.min(i + 1, items.length)} / {items.length}
        </p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.34, ease: EASE }}
          className="mt-5"
        >
          <h2 className="t-title text-balance text-ink">{item.question}</h2>

          <div className="mt-6 flex flex-col gap-2.5">
            {item.options.map((opt, o) => {
              const picked = picks[i] === o;
              return (
                <button
                  key={opt}
                  data-quiz-option
                  onClick={() => onPick(i, o)}
                  className={`flex min-h-[56px] items-center gap-4 rounded-[4px] border px-5 text-left transition-colors duration-200 ${
                    picked
                      ? 'border-ink bg-surface-inverse text-ink-on-inverse'
                      : 'border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken'
                  }`}
                >
                  <span
                    className={`t-number shrink-0 text-[13px] ${
                      picked ? 'opacity-70' : 'text-ink-3'
                    }`}
                  >
                    {String.fromCharCode(65 + o)}
                  </span>
                  <span className="t-body-strong">{opt}</span>
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      <p className="t-label mt-6 text-center">
        {answeredAll ? '곧 몸이 기록한 답을 보여드립니다' : '직감으로 고르세요. 정답은 곧 공개됩니다.'}
      </p>
    </div>
  );
}

export function QuizReveal({ items, picks }: { items: QuizItem[]; picks: (number | null)[] }) {
  const correct = scoreQuiz(items, picks);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <p className="t-label">기록이 말한 답</p>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="t-title mt-2 text-balance text-ink"
      >
        {quizVerdict(correct, items.length)}
      </motion.p>

      <div className="mt-6 divide-y divide-line overflow-hidden rounded-[4px] border border-line bg-surface-raised">
        {items.map((it, i) => {
          const hit = picks[i] === it.answer;
          return (
            <motion.div
              key={it.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.25 + i * 0.22, ease: EASE }}
              className="flex items-start gap-4 px-5 py-4"
            >
              {/* 맞고 틀림을 색이 아니라 글자로 쓴다 — 색맹 사용자와 흑백 인쇄를 위해 */}
              <span
                className="t-label mt-0.5 w-11 shrink-0"
                style={{
                  color:
                    picks[i] === null
                      ? 'var(--color-ink-3)'
                      : hit
                        ? 'var(--color-hrv)'
                        : 'var(--color-hr)',
                }}
              >
                {picks[i] === null ? '무응답' : hit ? '적중' : '빗나감'}
              </span>
              <div className="min-w-0">
                <p className="t-body-strong text-ink">{it.options[it.answer]}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{it.reveal}</p>
                {/* 내가 뭐라고 답했는지 같이 보여야 "빗나감"이 납득된다 */}
                {picks[i] !== null && !hit && (
                  <p className="mt-1 text-[13px] leading-snug text-ink-3">
                    당신의 답 · {it.options[picks[i] as number]}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
