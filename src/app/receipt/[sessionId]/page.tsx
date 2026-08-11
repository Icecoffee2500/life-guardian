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
    <main className="min-h-dvh bg-surface py-10 print:bg-white print:py-0">
      {state.kind === 'loading' && (
        <p className="t-label pt-20 text-center">불러오는 중입니다</p>
      )}

      {state.kind === 'missing' && (
        <div className="mx-auto max-w-sm px-6 pt-20 text-center">
          <p className="t-body text-ink">이 세션을 찾지 못했습니다</p>
          <p className="t-label mt-3">
            영수증은 체험한 기기에 저장됩니다. 다른 기기에서 열었다면 보이지 않을 수 있습니다.
          </p>
          <Link href="/experience" className="t-label mt-8 inline-block underline-offset-4 hover:underline">
            체험 시작하기
          </Link>
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          {/* 밝은 바탕에서는 그림자를 두껍게 쌓지 않는다. 종이가 아니라
              얇은 테두리와 낮은 그림자만으로 면이 떠 있음을 알려준다. */}
          <div className="print:shadow-none mx-auto w-fit border border-line bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <ReceiptSheet record={state.record} />
          </div>

          {/*
            t-label은 색을 ink-3로 고정하는 클래스라 hover 시 색이 바뀌어야 하는
            버튼·링크에는 쓰지 않는다(호버로 강조되는 조작 가능한 요소이므로
            라벨과 같은 크기·자간만 가져오고 색은 유틸리티로 직접 제어한다).
          */}
          <div className="no-print mt-8 flex items-center justify-center gap-5">
            <button
              onClick={() => window.print()}
              className="rounded-full border border-line-strong px-6 py-2.5 text-[13px] font-semibold tracking-[0.04em] text-ink transition-colors duration-500 hover:bg-surface-sunken"
            >
              인쇄하기
            </button>
            <Link
              href="/experience"
              className="text-[13px] font-semibold tracking-[0.04em] text-ink-3 underline-offset-4 hover:text-ink hover:underline"
            >
              다시 체험하기
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
