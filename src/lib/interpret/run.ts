'use client';

import { buildLlmInput, type BuildOptions } from '@/lib/features/build';
import { ruleBasedValence } from '@/lib/features/dialogue';
import type { LlmInput } from '@/lib/features/schema';
import { sessionRecorder } from '@/lib/session/recorder';
import { ruleBasedReceipt } from './fallback';
import { BioReceiptSchema, type BioReceipt } from './schema';

/**
 * 해석 실행 — 브라우저에서 서버 라우트를 거쳐 해석을 받아온다.
 *
 * 실패 경로가 세 겹이다:
 *   1) 정서가 호출 실패  → 규칙 기반 평정으로 대체하고 계속 간다
 *   2) 해석 호출 실패    → 서버가 규칙 기반 영수증을 돌려준다
 *   3) 네트워크 자체 실패 → 브라우저에서 규칙 기반 영수증을 만든다
 *
 * 어느 경로로도 "영수증이 없음"은 나오지 않는다. 부스에서 빈손으로 돌려보내지 않는다.
 */

export interface InterpretOutcome {
  input: LlmInput;
  receipt: BioReceipt;
  /** 규칙 기반으로 만들어졌는가 */
  fallback: boolean;
  reason?: string;
}

/** 발화 정서가 선평정. 실패는 조용히 규칙 기반으로 흡수된다. */
async function fetchValences(
  turns: { q: number; transcript: string }[],
  signal?: AbortSignal,
): Promise<Map<number, number>> {
  const withText = turns.filter((t) => t.transcript.trim().length > 0);
  const local = () =>
    new Map(withText.map((t) => [t.q, ruleBasedValence(t.transcript)] as const));
  if (withText.length === 0) return new Map();

  try {
    const res = await fetch('/api/valence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ turns: withText }),
      signal,
    });
    if (!res.ok) return local();
    const data = (await res.json()) as { ratings?: { q: number; content_valence: number }[] };
    if (!Array.isArray(data.ratings)) return local();
    return new Map(data.ratings.map((r) => [r.q, r.content_valence] as const));
  } catch {
    return local();
  }
}

export async function runInterpretation(
  opts: BuildOptions & { signal?: AbortSignal },
): Promise<InterpretOutcome> {
  const turns = sessionRecorder.dialogueTurns.map((t) => ({ q: t.q, transcript: t.transcript }));
  const valences = await fetchValences(turns, opts.signal);

  const { input } = buildLlmInput(sessionRecorder, { ...opts, valences });

  try {
    const res = await fetch('/api/interpret', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: opts.signal,
    });
    if (res.ok) {
      const data = (await res.json()) as { receipt: unknown; fallback: boolean; reason?: string };
      const parsed = BioReceiptSchema.safeParse(data.receipt);
      if (parsed.success) {
        return { input, receipt: parsed.data, fallback: data.fallback, reason: data.reason };
      }
    }
  } catch {
    // 아래의 로컬 폴백으로 떨어진다
  }

  return {
    input,
    receipt: ruleBasedReceipt(input),
    fallback: true,
    reason: '해석 서버에 닿지 못했습니다',
  };
}
