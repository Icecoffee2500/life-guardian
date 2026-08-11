'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import Button from '@/components/ui/Button';
import SceneShell from './SceneShell';
import { useSession } from '@/lib/session/store';
import { ETHICS_GUARDRAILS } from '@/lib/dialogue/script';
import { totalDurationSec } from '@/lib/session/scenes';

/**
 * S0 — 인트로.
 *
 * 첫 화면이 이 제품의 주장을 대신한다.
 * 문장 하나가 심장 리듬으로 아주 미세하게 밝아졌다 어두워진다.
 * 로딩 스피너도, 설명 문단도 없다.
 */
export default function S0Intro({ onStart }: { onStart: () => void }) {
  const nickname = useSession((s) => s.nickname);
  const setNickname = useSession((s) => s.setNickname);
  const mode = useSession((s) => s.mode);
  const setMode = useSession((s) => s.setMode);
  const [showEthics, setShowEthics] = useState(false);

  const minutes = Math.round(totalDurationSec(mode) / 60);
  const modeLabel = (m: typeof mode) =>
    `${m === 'full' ? '전체' : '압축'} 체험 · ${Math.round(totalDurationSec(m) / 60)}분`;

  return (
    <SceneShell className="px-6">
      <div className="flex w-full max-w-xl flex-col items-center">
        <motion.div
          className="mb-10 h-1.5 w-1.5 rounded-full bg-hr"
          style={{ boxShadow: '0 0 18px var(--color-hr)' }}
          animate={{ opacity: [0.35, 1, 0.5, 0.35], scale: [1, 1.55, 1.05, 1] }}
          transition={{ duration: 1.15, repeat: Infinity, ease: 'easeOut', times: [0, 0.12, 0.3, 1] }}
        />

        <motion.h1
          className="t-display text-balance text-center text-ink text-[clamp(2rem,5.4vw,3.9rem)]"
          animate={{ opacity: [0.82, 1, 0.86, 0.82] }}
          transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
        >
          당신의 몸은
          <br />
          이미 알고 있습니다
        </motion.h1>

        <motion.p
          className="t-body mt-7 max-w-md text-center text-ink-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 1.2 }}
        >
          약 {minutes}분 동안 시선과 손과 목소리를 기록합니다.
          <br />
          답을 고르지 않아도 됩니다. 반응하기만 하면 됩니다.
        </motion.p>

        <motion.div
          className="mt-12 w-full max-w-[19rem]"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.4, duration: 1 }}
        >
          {/*
            밑줄만 있던 입력창은 "여기 누를 수 있다"는 신호가 약했다.
            테두리를 있는 그대로 그려서 입력 가능한 영역임을 명확히 하고,
            글자는 16px 이상으로 — 모바일 사파리는 16px 미만 입력창에 포커스가 가면 확대를 건다.
          */}
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 12))}
            placeholder="닉네임 (선택)"
            className="w-full rounded-[4px] border border-line-strong bg-surface-raised px-4 py-3 text-center text-base text-ink placeholder:text-ink-3 focus:outline-none"
            aria-label="닉네임"
          />

          {/*
            토글은 지금 선택된 쪽이 눈에 보여야 조작 가능한 통제로 읽힌다.
            선택됨 = 반전 면(bg-surface-inverse), 선택 안 됨 = 테두리만 — 둘 다 버튼처럼 생기게 한다.
          */}
          <div className="mt-8 flex items-center justify-center gap-2">
            {(['full', 'compact'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-full px-4 py-2.5 text-[13px] font-semibold tracking-[0.01em] transition-colors duration-300 ${
                  mode === m
                    ? 'bg-surface-inverse text-ink-on-inverse'
                    : 'border border-line-strong text-ink-2 hover:bg-surface-sunken'
                }`}
              >
                {modeLabel(m)}
              </button>
            ))}
          </div>

          <Button className="mt-8 w-full" onClick={onStart}>
            시작하기
          </Button>
        </motion.div>

        <motion.div
          className="mt-10 flex flex-col items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}
        >
          <button
            onClick={() => setShowEthics((v) => !v)}
            className="t-label underline-offset-4 hover:underline"
          >
            이 체험은 상담도 진단도 아닙니다
          </button>
          {showEthics && (
            <motion.ul
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="t-body mt-4 max-w-md space-y-1.5 overflow-hidden text-ink-2"
            >
              {ETHICS_GUARDRAILS.map((g) => (
                <li key={g} className="flex gap-2">
                  <span aria-hidden>·</span>
                  <span>{g}</span>
                </li>
              ))}
            </motion.ul>
          )}
        </motion.div>
      </div>
    </SceneShell>
  );
}
