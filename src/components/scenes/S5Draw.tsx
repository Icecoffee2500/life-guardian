'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import SceneShell from './SceneShell';
import Button from '@/components/ui/Button';
import TimeRing from '@/components/ui/TimeRing';
import { experienceBus } from '@/lib/sensors/bus';
import { sessionClock } from '@/lib/sensors/clock';
import { getPersona } from '@/lib/sensors/personas';
import { clamp } from '@/lib/sensors/random';
import { autoFuture, autoTree, type AutoStroke } from '@/lib/draw/auto-draw';
import { sessionRecorder, type DrawStroke } from '@/lib/session/recorder';
import { DRAW_TIMING } from '@/lib/session/scenes';
import { useSession } from '@/lib/session/store';

type TaskId = 'tree' | 'future';

const TASK_COPY: Record<TaskId, { title: string; hint: string }> = {
  tree: { title: '나무 한 그루를 그려주세요', hint: '잘 그릴 필요는 없습니다.' },
  future: {
    title: '10년 뒤, 당신의 하루를 그려주세요',
    hint: '떠오르는 장면 하나면 충분합니다.',
  },
};

interface LivePoint {
  t: number;
  x: number;
  y: number;
  p: number;
}

/**
 * S5 — 그림 세션.
 *
 * 어두운 화면에 밝은 선으로 그린다. 흰 종이를 흉내 내면 이 체험만 갑자기
 * 다른 앱이 되어버린다. 여기서 그림은 "빛으로 남기는 흔적"이다.
 *
 * 기록하는 것은 결과 이미지가 아니라 과정이다 — 착수 지연, 필압, 획 순서, 수정 횟수.
 * 그래서 모든 점에 세션 시각이 붙는다.
 */
export default function S5Draw({
  onDone,
  onProgress,
}: {
  onDone: () => void;
  onProgress: (p: number) => void;
}) {
  const mode = useSession((s) => s.mode);
  const signalMode = useSession((s) => s.signalMode);
  const personaId = useSession((s) => s.personaId);
  const sessionId = useSession((s) => s.sessionId);
  const paused = useSession((s) => s.status === 'paused');

  const timing = DRAW_TIMING[mode];
  const [task, setTask] = useState<TaskId>('tree');
  const [progress, setProgress] = useState(0);
  const [strokeCount, setStrokeCount] = useState(0);
  const [undos, setUndos] = useState(0);
  /** 이 과제에서 획이 한 번이라도 그어졌는가 — 안내 문구의 표시 조건 */
  const [hasInk, setHasInk] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<DrawStroke[]>([]);
  const currentRef = useRef<LivePoint[] | null>(null);
  const startedAtRef = useRef(0);
  const undosRef = useRef(0);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });
  const lastMoveRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const pressureSourceRef = useRef<'pen' | 'proxy' | 'auto'>('proxy');

  const taskRef = useRef<TaskId>('tree');
  const advanceRef = useRef<() => void>(() => {});
  const onProgressRef = useRef(onProgress);
  const pausedRef = useRef(paused);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // ── 캔버스 렌더링 ────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { w, h } = sizeRef.current;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const paint = (pts: LivePoint[], alpha: number) => {
      if (pts.length < 2) {
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x * w, pts[0].y * h, 1.2 + pts[0].p * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(236,233,227,${alpha})`;
          ctx.fill();
        }
        return;
      }
      // 필압이 구간마다 다르므로 선분 단위로 굵기를 바꾼다
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        ctx.lineWidth = 1 + ((a.p + b.p) / 2) * 4.2;
        ctx.strokeStyle = `rgba(236,233,227,${alpha})`;
        ctx.stroke();
      }
    };

    ctx.shadowColor = 'rgba(236,233,227,0.35)';
    ctx.shadowBlur = 6;
    for (const s of strokesRef.current) paint(s.points, 0.88);
    if (currentRef.current) paint(currentRef.current, 0.95);
    ctx.shadowBlur = 0;
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    sizeRef.current = { w: rect.width, h: rect.height, dpr };
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }, [redraw]);

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(resize);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [resize]);

  // ── 과제 전환 ────────────────────────────────────────────────────
  const commitTask = useCallback(() => {
    const { w, h } = sizeRef.current;
    sessionRecorder.drawTasks.push({
      id: taskRef.current,
      startedAt: startedAtRef.current,
      endedAt: sessionClock.now(),
      width: Math.round(w),
      height: Math.round(h),
      strokes: strokesRef.current,
      undos: undosRef.current,
      pressureSource: pressureSourceRef.current,
    });
    strokesRef.current = [];
    currentRef.current = null;
    undosRef.current = 0;
    setUndos(0);
    setStrokeCount(0);
    setHasInk(false);
    redraw();
  }, [redraw]);

  // ── 타임라인 ─────────────────────────────────────────────────────
  useEffect(() => {
    const totals: Record<TaskId, number> = { tree: timing.treeSec, future: timing.futureSec };
    const grand = timing.treeSec + timing.futureSec;

    let raf = 0;
    let acc = 0;
    let done = 0; // 완료된 과제들의 누적 시간
    let last = performance.now();
    let finished = false;
    let lastP = -1;

    const begin = (id: TaskId) => {
      taskRef.current = id;
      startedAtRef.current = sessionClock.now();
      experienceBus.emit('draw-start', { ref: id, t: startedAtRef.current });
      setTask(id);
    };

    const next = () => {
      commitTask();
      if (taskRef.current === 'tree') {
        done += totals.tree;
        acc = 0;
        begin('future');
      } else if (!finished) {
        finished = true;
        onProgressRef.current(1);
        onDone();
      }
    };
    advanceRef.current = next;

    begin('tree');

    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!pausedRef.current) acc += dt;
      const limit = totals[taskRef.current];
      // 60fps로 setState하면 씬 전체가 매 프레임 리렌더된다. 눈에 보일 만큼만 갱신한다.
      const p = Math.min(1, acc / limit);
      if (Math.abs(p - lastP) > 0.004 || p >= 1) {
        lastP = p;
        setProgress(p);
      }
      onProgressRef.current(Math.min(1, (done + Math.min(acc, limit)) / grand));
      if (acc >= limit) {
        next();
        if (finished) return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (!finished) commitTask();
    };
    // onDone은 부모에서 안정적으로 넘어온다 (useCallback)
  }, [commitTask, onDone, timing]);

  // ── 가상 참가자 자동 재현 ────────────────────────────────────────
  useEffect(() => {
    if (signalMode !== 'auto') return;
    const persona = getPersona(personaId);
    const plan: AutoStroke[] =
      task === 'tree' ? autoTree(persona, sessionId) : autoFuture(persona, sessionId);
    const limit = task === 'tree' ? timing.treeSec : timing.futureSec;
    const delay = Math.min(persona.drawing.onsetDelaySec, limit * 0.25) * 1000;
    const span = limit * 1000 - delay - 600;
    const totalPts = plan.reduce((n, s) => n + s.points.length, 0);
    const perPt = span / Math.max(1, totalPts);

    pressureSourceRef.current = 'auto';
    strokesRef.current = [];
    currentRef.current = null;
    redraw();

    let si = 0;
    let pi = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      if (si >= plan.length) return;
      const src = plan[si];
      if (pi === 0) currentRef.current = [];
      const pt = src.points[pi];
      currentRef.current?.push({ t: sessionClock.now(), x: pt.x, y: pt.y, p: pt.p });
      if (pi === 0 && si === 0) setHasInk(true);
      pi++;
      if (pi >= src.points.length) {
        if (currentRef.current) strokesRef.current.push({ points: currentRef.current });
        currentRef.current = null;
        setStrokeCount(strokesRef.current.length);
        experienceBus.emit('draw-stroke', { ref: `${task}-${si}` });
        si++;
        pi = 0;
      }
      redraw();
      timer = setTimeout(step, perPt);
    };
    timer = setTimeout(step, delay);
    return () => clearTimeout(timer);
  }, [personaId, redraw, sessionId, signalMode, task, timing]);

  // ── 포인터 입력 ──────────────────────────────────────────────────
  const pressureOf = (e: React.PointerEvent): number => {
    if (e.pointerType === 'pen' && e.pressure > 0) {
      pressureSourceRef.current = 'pen';
      return clamp(e.pressure, 0.05, 1);
    }
    // 마우스·손가락은 필압이 없다. 속도를 대체값으로 쓴다 —
    // 천천히 그은 선일수록 눌러 그린 것으로 본다. (해석에서 가중치를 낮춘다)
    const prev = lastMoveRef.current;
    const now = performance.now();
    if (!prev) return 0.55;
    const dist = Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
    const v = dist / Math.max(8, now - prev.t); // px/ms
    return clamp(0.82 - v * 0.42, 0.18, 0.9);
  };

  const toLocal = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (signalMode === 'auto') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastMoveRef.current = { t: performance.now(), x: e.clientX, y: e.clientY };
    const { x, y } = toLocal(e);
    currentRef.current = [{ t: sessionClock.now(), x, y, p: pressureOf(e) }];
    setHasInk(true);
    experienceBus.emit('draw-stroke', { ref: taskRef.current });
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentRef.current) return;
    const { x, y } = toLocal(e);
    currentRef.current.push({ t: sessionClock.now(), x, y, p: pressureOf(e) });
    lastMoveRef.current = { t: performance.now(), x: e.clientX, y: e.clientY };
    redraw();
  };

  const endStroke = () => {
    const cur = currentRef.current;
    currentRef.current = null;
    lastMoveRef.current = null;
    if (cur && cur.length > 1) {
      strokesRef.current.push({ points: cur });
      setStrokeCount(strokesRef.current.length);
    }
    redraw();
  };

  const undo = () => {
    if (!strokesRef.current.length) return;
    strokesRef.current.pop();
    undosRef.current += 1;
    setUndos(undosRef.current);
    setStrokeCount(strokesRef.current.length);
    redraw();
  };

  const copy = TASK_COPY[task];
  const limit = task === 'tree' ? timing.treeSec : timing.futureSec;
  const remaining = Math.max(0, Math.ceil(limit * (1 - progress)));

  return (
    <SceneShell align="stretch" className="px-5 sm:px-10">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col py-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={task}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
            className="shrink-0 text-center"
          >
            <h2 className="scene-title text-[clamp(1.15rem,2.6vw,1.7rem)] text-paper">
              {copy.title}
            </h2>
            <p className="mt-2 text-[12px] font-light text-paper-mute">{copy.hint}</p>
          </motion.div>
        </AnimatePresence>

        <div className="relative mt-7 min-h-0 flex-1 overflow-hidden rounded-2xl border border-paper/8 bg-ink-900">
          <canvas
            ref={canvasRef}
            className="h-full w-full touch-none"
            style={{ cursor: signalMode === 'auto' ? 'default' : 'crosshair' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={endStroke}
          />
          {!hasInk && (
            <motion.span
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] font-light tracking-[0.1em] text-paper-mute/60"
              animate={{ opacity: [0.4, 0.85, 0.4] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              {signalMode === 'auto' ? '가상 참가자가 그리는 중입니다' : '여기에 그려주세요'}
            </motion.span>
          )}
        </div>

        <div className="mt-5 flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-3">
            <TimeRing progress={progress} size={34} />
            <span className="tnum text-[11px] font-light text-paper-mute">{remaining}초</span>
            {undos > 0 && (
              <span className="text-[10px] tracking-[0.1em] text-paper-mute/70">
                수정 {undos}회
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" onClick={undo} disabled={!strokeCount}>
              되돌리기
            </Button>
            <Button variant="ghost" onClick={() => advanceRef.current()}>
              다 그렸어요
            </Button>
          </div>
        </div>
      </div>
    </SceneShell>
  );
}
