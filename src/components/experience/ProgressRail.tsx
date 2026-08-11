'use client';

import { SCENES, type SceneId } from '@/lib/session/scenes';

interface Props {
  scene: SceneId;
  /** 현재 씬 내부 진행도 0~1 */
  sceneProgress: number;
}

/**
 * 상단 진행 표시.
 *
 * "지금 어디쯤이고 얼마나 남았나"는 부스에서 가장 자주 나오는 질문이다.
 * 이전 버전은 1px 선과 10px 글씨로 answered하는 척만 했다.
 * 단계를 눈금으로 세워 몇 개 중 몇 번째인지 세지 않고도 보이게 한다.
 */
export default function ProgressRail({ scene, sceneProgress }: Props) {
  const idx = SCENES.findIndex((s) => s.id === scene);
  const current = SCENES[Math.max(0, idx)];

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 select-none bg-surface/95 backdrop-blur-[2px]">
      <div className="flex items-center justify-between gap-4 px-6 pt-4 pb-3 sm:px-10">
        <span className="t-label" style={{ color: 'var(--color-brand)' }}>
          LIFE GUARDIAN
        </span>
        <div className="flex items-baseline gap-3">
          <span className="t-body-strong text-ink">{current.label}</span>
          <span className="t-number text-[13px] text-ink-3">
            {Math.max(1, idx + 1)} / {SCENES.length}
          </span>
        </div>
      </div>

      {/* 단계 눈금 — 지나온 칸은 채우고, 현재 칸만 진행도를 보여준다 */}
      <div className="flex gap-1 px-6 pb-3 sm:px-10">
        {SCENES.map((s, i) => (
          <div key={s.id} className="h-1.5 flex-1 overflow-hidden rounded-[1px] bg-surface-sunken">
            <div
              className="h-full bg-brand transition-[width] duration-200 ease-linear"
              style={{
                width: i < idx ? '100%' : i === idx ? `${Math.min(1, sceneProgress) * 100}%` : '0%',
              }}
            />
          </div>
        ))}
      </div>
    </header>
  );
}
