'use client';

import { useEffect, useRef } from 'react';
import { ecgAt } from '@/lib/waveform';

/**
 * 랜딩 히어로의 배경 심박.
 *
 * 체험 화면의 SignalCanvas와 달리 여기엔 센서가 없다. 그래서 이 파형은
 * 데이터가 아니라 **약속**이다 — 아주 느리게, 아주 흐리게 한 줄만 흐른다.
 *
 * 화면 전체를 덮는 그라데이션이나 파티클은 쓰지 않는다. 선 하나면 충분하다.
 */
export default function HeroPulse() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let w = 0;
    let h = 0;
    let raf = 0;
    let phase = 0;
    let last = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // 분당 62회 — 쉬고 있는 사람의 심박
    const BPM = 62;
    // 화면 폭에 박동이 20개씩 들어차면 배경이 아니라 소음이 된다.
    // 한 화면에 대여섯 박동만 보이도록 느리게 흘린다.
    const PX_PER_SEC = 165;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!reduced) phase = (phase + (BPM / 60) * dt) % 1;

      ctx.clearRect(0, 0, w, h);

      const baseY = h * 0.5;
      const amp = h * 0.3;
      // 밝은 바탕에서는 흐린 선이 묻힌다. 검은 배경용 저채도 값 대신
      // 심박 색(--color-hr)을 진하게 써서 알파를 올린다. 글로우는 어두운
      // 배경에서만 통하는 효과라 밝은 종이 위에서는 얼룩으로 보여 제거한다.
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgba(217,66,21,0)');
      grad.addColorStop(0.28, 'rgba(217,66,21,0.3)');
      grad.addColorStop(0.72, 'rgba(217,66,21,0.3)');
      grad.addColorStop(1, 'rgba(217,66,21,0)');

      ctx.beginPath();
      for (let x = 0; x <= w; x += 1) {
        // 화면 왼쪽이 과거, 오른쪽이 미래. 위상은 x에 비례해 흐른다.
        const p = (phase + ((w - x) / PX_PER_SEC) * (BPM / 60)) % 1;
        const y = baseY - ecgAt(p, 1) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // 제목 위를 지나가면 취소선처럼 읽힌다. 본문 아래 지평선 자리에 둔다.
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-[82%] h-24 w-full -translate-y-1/2"
    />
  );
}
