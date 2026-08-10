'use client';

import { useEffect, useRef, useState } from 'react';

interface TimerState {
  progress: number;
  elapsed: number;
}

const ZERO: TimerState = { progress: 0, elapsed: 0 };

/**
 * 씬 자동 진행 타이머.
 *
 * 0~1 진행도를 rAF로 매끄럽게 돌려주고, 끝나면 onDone을 한 번만 호출한다.
 * durationSec이 null이면 타이머를 돌리지 않는다(사용자 행동으로 넘어가는 씬).
 */
export function useSceneTimer(
  durationSec: number | null,
  onDone: () => void,
  opts: { paused?: boolean; key?: string | number } = {},
) {
  const { paused = false, key } = opts;
  const [state, setState] = useState<TimerState>(ZERO);
  const [lastKey, setLastKey] = useState(key);
  const onDoneRef = useRef(onDone);

  // 씬이 바뀌면 진행도를 즉시 0으로 되돌린다 (한 프레임 100% 잔상 방지).
  // React가 권장하는 "렌더 중 상태 조정" 패턴.
  if (key !== lastKey) {
    setLastKey(key);
    setState(ZERO);
  }
  const pausedRef = useRef(paused);

  // 콜백과 일시정지 상태는 렌더 중이 아니라 이펙트에서 동기화한다
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (durationSec === null) return;

    let raf = 0;
    let acc = 0;
    let done = false;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!pausedRef.current) acc += dt;
      const p = Math.min(1, acc / durationSec);
      setState({ progress: p, elapsed: acc });
      if (p >= 1) {
        if (!done) {
          done = true;
          onDoneRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // key가 바뀌면(같은 씬 재진입 포함) 타이머를 처음부터 다시 돌린다
  }, [durationSec, key]);

  const remaining = durationSec === null ? null : Math.max(0, durationSec - state.elapsed);
  return { progress: state.progress, elapsed: state.elapsed, remaining };
}
