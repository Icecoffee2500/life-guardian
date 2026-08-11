'use client';

import { useEffect, useRef, useState } from 'react';
import { sensorHub } from '@/lib/sensors/hub';

/**
 * 시선 커서 — 물방울.
 *
 * "아이트래커가 진짜 돌고 있는가"는 말로 답할 게 아니라 보여줄 문제다.
 * 눈을 움직이면 화면의 방울이 따라온다. 그게 유일하게 정직한 증거다.
 *
 * 왜 canvas인가: 예측은 초당 20~30회 들어오고 잔상까지 그리려면
 * 매 프레임 여러 개의 도형이 움직인다. React 리렌더로 감당할 일이 아니다.
 *
 * 물방울처럼 보이게 하는 세 가지:
 *  1. **관성** — 좌표를 그대로 찍지 않고 스프링으로 뒤따라간다
 *  2. **찌그러짐** — 빠르게 움직일 때 진행 방향으로 늘어나고 직각으로 눌린다
 *  3. **잔상** — 조금씩 늦게 따라오는 작은 방울들이 꼬리를 만든다
 *
 * 색은 시선 채널 색(--color-hrv) 하나만 쓴다. 계측 장비의 표시등이지 장식이 아니다.
 */

/** 스프링 계수 — 클수록 빨리 따라붙는다 */
const FOLLOW = 0.16;
/** 감쇠 — 1에 가까울수록 오래 출렁인다 */
const DAMP = 0.76;
/** 꼬리 방울 개수 */
const TAIL = 5;
/** 본체 반지름(px) */
const R = 26;
/** 이 속도(px/frame)에서 찌그러짐이 최대가 된다 */
const MAX_SPEED = 26;

interface Blob {
  x: number;
  y: number;
}

export default function GazeCursor({ visible }: { visible: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // 나타나고 사라지는 것도 물방울처럼 — 갑자기 켜지면 계측기가 아니라 알림처럼 보인다
  const fadeRef = useRef(0);
  const visibleRef = useRef(visible);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setSupported(false);
      return;
    }

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // 물리 상태
    let px = w / 2;
    let py = h / 2;
    let vx = 0;
    let vy = 0;
    /** 꼬리 — 뒤로 갈수록 더 늦게 따라온다 */
    const tail: Blob[] = Array.from({ length: TAIL }, () => ({ x: px, y: py }));
    let lastSampleT = -1;
    let raf = 0;
    /** 방울이 향하는 목표점 */
    let tx = px;
    let ty = py;
    /** 마지막 표본이 들어온 실시각 — 얼굴이 프레임을 벗어나면 조용히 사라져야 한다 */
    let lastSeen = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);

      const g = sensorHub.current().gaze;
      const alive = g !== null && Date.now() - lastSeen < 1200;

      // 목표 지점 — 새 표본이 왔을 때만 갱신한다
      if (g && g.t !== lastSampleT) {
        lastSampleT = g.t;
        lastSeen = Date.now();
        tx = g.x * w;
        ty = g.y * h;
      }

      // 스프링: 목표를 향한 가속 + 감쇠. 이 두 줄이 '물방울 관성'의 전부다.
      vx = (vx + (tx - px) * FOLLOW) * DAMP;
      vy = (vy + (ty - py) * FOLLOW) * DAMP;
      px += vx;
      py += vy;

      for (let i = 0; i < tail.length; i++) {
        const lead = i === 0 ? { x: px, y: py } : tail[i - 1];
        const k = 0.34 - i * 0.04;
        tail[i].x += (lead.x - tail[i].x) * k;
        tail[i].y += (lead.y - tail[i].y) * k;
      }

      const want = visibleRef.current && alive ? 1 : 0;
      fadeRef.current += (want - fadeRef.current) * 0.09;
      const fade = fadeRef.current;

      ctx.clearRect(0, 0, w, h);
      if (fade < 0.01) return;

      const speed = Math.hypot(vx, vy);
      const stretch = Math.min(0.5, speed / MAX_SPEED);
      const angle = Math.atan2(vy, vx);
      // 멈춰 있을수록 또렷하게, 날아갈수록 흐리게 — 실제 물방울의 인상이다
      const settle = 1 - Math.min(1, speed / (MAX_SPEED * 0.6));

      /** 진행 방향으로 늘어난 타원 하나 */
      const drop = (x: number, y: number, r: number, alpha: number, s: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.scale(1 + s, 1 - s * 0.55);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        grad.addColorStop(0, `rgba(78, 107, 47, ${0.3 * alpha})`);
        grad.addColorStop(0.55, `rgba(78, 107, 47, ${0.16 * alpha})`);
        grad.addColorStop(1, 'rgba(78, 107, 47, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      };

      // 꼬리부터 — 뒤엣것이 아래로 깔린다
      for (let i = tail.length - 1; i >= 0; i--) {
        const t = 1 - i / tail.length;
        drop(tail[i].x, tail[i].y, R * (0.42 + t * 0.4), fade * t * 0.5, stretch * 0.7);
      }

      // 본체
      drop(px, py, R, fade, stretch);

      // 표면 — 물방울의 가장자리. 멈춰 있을 때만 또렷해진다.
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.scale(1 + stretch, 1 - stretch * 0.55);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(78, 107, 47, ${0.5 * fade * (0.35 + settle * 0.65)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 하이라이트 — 빛이 맺힌 자리. 이거 하나로 '물방울'로 읽힌다.
      ctx.beginPath();
      ctx.arc(-R * 0.2, -R * 0.22, R * 0.13, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * fade})`;
      ctx.fill();
      ctx.restore();
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  if (!supported) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
