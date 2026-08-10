'use client';

import { useEffect, useRef } from 'react';
import { sensorHub } from '@/lib/sensors/hub';
import { ScrollBuffer, ecgAt } from '@/lib/waveform';

type Variant = 'hero' | 'ambient' | 'strip';

interface Props {
  variant?: Variant;
  /** 어떤 채널을 그릴지 */
  channels?: ('hr' | 'gsr')[];
  className?: string;
  /** 픽셀/초 스크롤 속도 */
  speed?: number;
  /** 전체 불투명도 배율 */
  intensity?: number;
}

const HR_COLOR = '242, 112, 78';
const GSR_COLOR = '63, 175, 166';

/**
 * 실시간 파형 렌더러.
 *
 * 차트 라이브러리를 쓰지 않는다. 이 화면에서 파형은 데이터 시각화가 아니라
 * "내 몸이 저기 흐르고 있다"는 감각이고, 그 감각은 잔광과 스크롤 리듬에서 나온다.
 */
export default function SignalCanvas({
  variant = 'ambient',
  channels = ['hr'],
  className,
  speed,
  intensity = 1,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  // 배열 prop을 그대로 의존성에 넣으면 매 렌더마다 이펙트가 재실행된다
  const chanKey = channels.join(',');

  useEffect(() => {
    const chans = chanKey.split(',');
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pxPerSec = speed ?? (variant === 'strip' ? 64 : 96);
    const hrBuf = new ScrollBuffer(1);
    const gsrBuf = new ScrollBuffer(1);

    let w = 0;
    let h = 0;
    let dpr = 1;
    let phase = 0;
    let carry = 0;
    let last = performance.now();
    let raf = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      hrBuf.resize(w);
      gsrBuf.resize(w);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const opacity =
      variant === 'hero' ? 1 : variant === 'strip' ? 0.92 : 0.34;

    const drawTrace = (
      buf: ScrollBuffer,
      color: string,
      baseY: number,
      scale: number,
      lineWidth: number,
      glow: number,
    ) => {
      if (buf.length < 2) return;
      const n = buf.length;
      const x0 = w - n;

      // 잔광: 오래된 구간일수록 투명해지는 그라데이션 스트로크
      const grad = ctx.createLinearGradient(x0, 0, w, 0);
      grad.addColorStop(0, `rgba(${color}, 0)`);
      grad.addColorStop(0.35, `rgba(${color}, ${0.18 * opacity * intensity})`);
      grad.addColorStop(0.8, `rgba(${color}, ${0.72 * opacity * intensity})`);
      grad.addColorStop(1, `rgba(${color}, ${0.96 * opacity * intensity})`);

      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = x0 + i;
        const y = baseY - buf.at(i) * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = `rgba(${color}, ${0.55 * opacity * intensity})`;
      ctx.shadowBlur = glow;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 선단의 작은 광점 — 지금 이 순간이 어디인지
      if (variant !== 'ambient') {
        const y = baseY - buf.at(n - 1) * scale;
        ctx.beginPath();
        ctx.arc(w - 1, y, lineWidth * 1.15, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${0.95 * opacity * intensity})`;
        ctx.shadowColor = `rgba(${color}, 0.9)`;
        ctx.shadowBlur = glow * 1.6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    // GSR은 절대값이 아니라 최근 창 안에서의 상대 변화를 보여준다
    let gsrMin = Infinity;
    let gsrMax = -Infinity;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const m = sensorHub.current();
      const hr = m.hr ?? 0;
      const gsr = m.gsr ?? 0;

      // 흘러간 시간만큼 픽셀 열을 채운다
      carry += dt * pxPerSec;
      const steps = Math.floor(carry);
      carry -= steps;
      const dtPerStep = steps > 0 ? dt / steps : 0;

      for (let i = 0; i < steps; i++) {
        if (hr > 0) {
          phase = (phase + (hr / 60) * dtPerStep) % 1;
          hrBuf.push(ecgAt(phase, 1));
        } else {
          hrBuf.push(0);
        }
        gsrBuf.push(gsr);
      }

      ctx.clearRect(0, 0, w, h);

      const showBoth = chans.includes('hr') && chans.includes('gsr');
      if (chans.includes('gsr')) {
        // 최근 창의 최소/최대를 천천히 따라가며 자동 스케일
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < gsrBuf.length; i++) {
          const v = gsrBuf.at(i);
          if (v <= 0) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (isFinite(lo)) {
          gsrMin = isFinite(gsrMin) ? gsrMin + (lo - gsrMin) * 0.04 : lo;
          gsrMax = isFinite(gsrMax) ? gsrMax + (hi - gsrMax) * 0.04 : hi;
        }
        const span = Math.max(0.35, gsrMax - gsrMin);
        const baseY = showBoth ? h * 0.82 : h * 0.62;
        const scale = showBoth ? h * 0.22 : h * 0.32;
        if (gsrBuf.length > 2 && isFinite(gsrMin)) {
          const norm = new ScrollBuffer(gsrBuf.length);
          for (let i = 0; i < gsrBuf.length; i++) {
            norm.push(((gsrBuf.at(i) - gsrMin) / span) * 0.9);
          }
          drawTrace(norm, GSR_COLOR, baseY, scale, variant === 'hero' ? 1.6 : 1.2, 10);
        }
      }

      if (chans.includes('hr')) {
        const baseY = showBoth ? h * 0.42 : h * 0.55;
        const scale = showBoth ? h * 0.3 : h * 0.36;
        drawTrace(hrBuf, HR_COLOR, baseY, scale, variant === 'hero' ? 1.9 : 1.4, variant === 'ambient' ? 8 : 16);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [variant, chanKey, speed, intensity]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
