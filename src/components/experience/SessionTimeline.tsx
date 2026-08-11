'use client';

import { useEffect, useRef } from 'react';
import { sessionRecorder } from '@/lib/session/recorder';
import { rgbGsr, rgbHr, rgbInk } from '@/lib/theme';
import { SCENES } from '@/lib/session/scenes';

/**
 * 세션 전체 타임라인.
 *
 * 실시간 파형(SignalCanvas)과 달리 여기서는 **이미 지나간 10분 전체**를 한 화면에 편다.
 * 참가자가 자기가 지나온 길을 처음으로 위에서 내려다보는 순간이다.
 *
 * 재생 헤드가 왼쪽에서 오른쪽으로 쓸고 지나가며, 지나간 구간만 밝아진다.
 */
export default function SessionTimeline({
  progress,
  className = '',
}: {
  /** 0~1. 재생 헤드 위치 */
  progress: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;

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

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const hr = sessionRecorder.hr;
      const gsr = sessionRecorder.gsr;
      if (hr.length < 2) return;

      const t0 = hr[0].t;
      const t1 = hr[hr.length - 1].t;
      const span = Math.max(1, t1 - t0);
      const p = progressRef.current;
      const headX = w * p;

      /*
        밝은 바탕용 색. 예전에는 흰색에 가까운 값(236,233,227)이 박혀 있었는데,
        라이트 테마로 바꾼 뒤로 눈금과 씬 이름이 바탕에 그대로 묻혀 보이지 않았다.
      */
      const INK = rgbInk();

      ctx.clearRect(0, 0, w, h);

      // 씬 경계 — 어디가 무엇이었는지
      ctx.font = '600 11px system-ui, sans-serif';
      for (const s of sessionRecorder.sceneSpans) {
        const x = ((s.start - t0) / span) * w;
        if (x < 0 || x > w) continue;
        const past = x <= headX;
        ctx.strokeStyle = past ? `rgba(${INK},0.24)` : `rgba(${INK},0.09)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 12);
        ctx.lineTo(x, h - 14);
        ctx.stroke();
        const def = SCENES.find((d) => d.id === s.scene);
        if (def) {
          ctx.fillStyle = past ? `rgba(${INK},0.62)` : `rgba(${INK},0.22)`;
          ctx.fillText(def.label, x + 4, h - 3);
        }
      }

      // 두 신호를 각자의 범위로 정규화해 겹쳐 그린다.
      // 절대값은 여기서 의미가 없다. 모양과 타이밍만 본다.
      const trace = (
        pts: { t: number; v: number }[],
        color: string,
        top: number,
        height: number,
        width: number,
      ) => {
        if (pts.length < 2) return;
        let lo = Infinity;
        let hi = -Infinity;
        for (const q of pts) {
          if (q.v < lo) lo = q.v;
          if (q.v > hi) hi = q.v;
        }
        const range = Math.max(1e-6, hi - lo);
        // 표본이 수만 개라 매 프레임 전부 그리면 낭비다. 픽셀당 하나면 충분하다.
        const step = Math.max(1, Math.floor(pts.length / w));

        const paint = (from: number, to: number, alpha: number) => {
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < pts.length; i += step) {
            const x = ((pts[i].t - t0) / span) * w;
            if (x < from || x > to) continue;
            const y = top + height - ((pts[i].v - lo) / range) * height;
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(${color}, ${alpha})`;
          ctx.lineWidth = width;
          ctx.lineJoin = 'round';
          ctx.stroke();
        };

        // 아직 오지 않은 구간도 흐릿하게 보여준다 — 전체 길이를 먼저 알려주기 위해
        paint(0, w, 0.17);
        paint(0, headX, 0.88);
      };

      trace(hr, rgbHr(), 14, h * 0.42, 1.3);
      trace(gsr, rgbGsr(), h * 0.5, h * 0.34, 1.3);

      // 재생 헤드
      if (p > 0 && p < 1) {
        ctx.strokeStyle = `rgba(${INK},0.7)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(headX, 8);
        ctx.lineTo(headX, h - 14);
        ctx.stroke();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
