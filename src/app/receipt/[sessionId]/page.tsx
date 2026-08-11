'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import ReceiptSheet from '@/components/receipt/ReceiptSheet';
import { loadSession } from '@/lib/storage/persist';
import type { SessionRecord } from '@/lib/storage/record';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; record: SessionRecord }
  | { kind: 'missing' };

/**
 * /receipt/[sessionId] — 영수증 한 장.
 *
 * 인쇄하면 80mm 감열지 그대로 나오고, 화면에서 보면 그 종이의 사진처럼 보인다.
 * QR로 다시 열리는 주소이기도 하다.
 */
export default function ReceiptPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    void loadSession(sessionId).then((record) => {
      if (!alive) return;
      setState(record ? { kind: 'ready', record } : { kind: 'missing' });
    });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  return (
    <main className="min-h-dvh bg-ink-950 py-10 print:bg-white print:py-0">
      {state.kind === 'loading' && (
        <p className="pt-20 text-center text-[12px] text-paper-mute">불러오는 중입니다</p>
      )}

      {state.kind === 'missing' && (
        <div className="mx-auto max-w-sm px-6 pt-20 text-center">
          <p className="text-[14px] font-light text-paper">이 세션을 찾지 못했습니다</p>
          <p className="mt-3 text-[12px] leading-relaxed text-paper-mute">
            영수증은 체험한 기기에 저장됩니다. 다른 기기에서 열었다면 보이지 않을 수 있습니다.
          </p>
          <Link
            href="/experience"
            className="mt-8 inline-block text-[12px] tracking-[0.1em] text-paper-dim underline-offset-4 hover:underline"
          >
            체험 시작하기
          </Link>
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          {/* 종이 한 장이 어두운 바닥 위에 놓인 것처럼 */}
          <div className="print:shadow-none mx-auto w-fit shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]">
            <ReceiptSheet record={state.record} />
          </div>

          <div className="no-print mt-8 flex items-center justify-center gap-5">
            <button
              onClick={() => window.print()}
              className="rounded-full border border-paper/20 px-6 py-2.5 text-[12px] tracking-[0.08em] text-paper transition-colors duration-500 hover:border-paper/45 hover:bg-paper/[0.06]"
            >
              인쇄하기
            </button>
            <Link
              href="/experience"
              className="text-[11px] tracking-[0.1em] text-paper-mute underline-offset-4 hover:text-paper-dim hover:underline"
            >
              다시 체험하기
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
