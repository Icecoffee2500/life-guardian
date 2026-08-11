'use client';

import { useEffect, useRef } from 'react';

/**
 * 비단결 배경.
 *
 * 제출 영상의 화면은 흰 바탕에 아주 옅은 결이 흐른다. 그 결이 있어서
 * 흰 화면이 "비어 있는 것"이 아니라 "고요한 것"으로 읽힌다.
 *
 * 규칙은 하나뿐이다: **읽는 데 방해가 되면 실패다.**
 * 그래서 선은 바탕과 거의 같은 밝기이고, 움직임은 눈치채기 직전에서 멈춘다.
 * 화면을 캡처해 히스토그램을 보면 차이가 보이지만, 글을 읽는 동안에는 안 보인다.
 *
 * canvas인 이유는 성능이다. SVG 필터나 blur를 쌓으면 저사양 노트북에서
 * 파형·시선 커서와 같이 돌 때 프레임이 떨어진다. 여기선 선 몇 개만 긋는다.
 */

/** 결의 개수 */
const BANDS = 7;
/** 한 결이 화면을 가로지르는 데 걸리는 시간(초). 느릴수록 고요하다. */
const PERIOD_SEC = 46;

export default function SilkBackdrop({ className = '' }: { className?: string }) {
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
    let t = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!reduced) t += dt / PERIOD_SEC;

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';

      for (let i = 0; i < BANDS; i++) {
        const k = i / (BANDS - 1);
        // 결마다 조금씩 다른 높이·진폭·속도. 규칙적이면 결이 아니라 무늬가 된다.
        const baseY = h * (0.12 + k * 0.78);
        const amp = h * (0.035 + 0.05 * Math.sin(k * 5.1));
        const speed = 1 + k * 0.55;
        const phase = t * speed * Math.PI * 2 + k * 2.3;

        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const u = x / w;
          const y =
            baseY +
            Math.sin(u * 2.4 + phase) * amp +
            Math.sin(u * 5.7 - phase * 0.62) * amp * 0.34;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        // 가장자리에서 사라지는 그라데이션 — 선의 끝이 잘려 보이지 않게
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        const a = 0.05 + 0.03 * Math.sin(k * 3.7);
        grad.addColorStop(0, 'rgba(20, 40, 160, 0)');
        grad.addColorStop(0.5, `rgba(20, 40, 160, ${a})`);
        grad.addColorStop(1, 'rgba(20, 40, 160, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1 + k * 1.6;
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 h-full w-full ${className}`}
    />
  );
}
