'use client';

import { SCENES, type SceneId } from '@/lib/session/scenes';

interface Props {
  scene: SceneId;
  /** 현재 씬 내부 진행도 0~1 */
  sceneProgress: number;
}

const PHASES = [
  { phase: 1, name: '측정 준비' },
  { phase: 2, name: '이완' },
  { phase: 3, name: '무의식 측정' },
  { phase: 4, name: '해석' },
] as const;

/**
 * 상단 진행 레일.
 *
 * 숫자를 크게 띄우지 않는다. 지금 어디쯤인지 곁눈으로 알 수 있으면 충분하고,
 * 남은 시간을 강조하면 체험이 과제가 된다.
 */
export default function ProgressRail({ scene, sceneProgress }: Props) {
  const idx = SCENES.findIndex((s) => s.id === scene);
  const current = SCENES[Math.max(0, idx)];
  const overall = (Math.max(0, idx) + Math.min(1, sceneProgress)) / SCENES.length;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 select-none">
      <div className="flex items-center justify-between px-6 pt-5 pb-3 sm:px-10">
        <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-paper-mute">
          Life Guardian
        </span>
        <div className="flex items-center gap-4">
          {PHASES.map((p) => (
            <span
              key={p.phase}
              className={`hidden text-[10px] tracking-[0.16em] transition-colors duration-700 sm:inline ${
                p.phase === current.phase ? 'text-paper-dim' : 'text-paper-mute/45'
              }`}
            >
              {p.name}
            </span>
          ))}
          <span className="tnum text-[10px] tracking-[0.16em] text-paper-mute">
            {String(Math.max(1, idx + 1)).padStart(2, '0')} / {SCENES.length}
          </span>
        </div>
      </div>
      <div className="relative h-px w-full bg-paper/8">
        <div
          className="absolute inset-y-0 left-0 bg-paper/55 transition-[width] duration-300 ease-linear"
          style={{ width: `${overall * 100}%` }}
        />
        {SCENES.map((s, i) => (
          <span
            key={s.id}
            className={`absolute top-0 h-px w-px ${
              i <= idx ? 'bg-paper/55' : 'bg-paper/20'
            }`}
            style={{ left: `${(i / SCENES.length) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
