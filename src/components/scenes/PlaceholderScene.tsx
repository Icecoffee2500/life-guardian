'use client';

import SceneShell, { SceneCaption, SceneTitle } from './SceneShell';
import TimeRing from '@/components/ui/TimeRing';
import type { SceneDef } from '@/lib/session/scenes';

/**
 * M2에서 실제 씬으로 교체되기 전까지 플로우를 잇는 임시 씬.
 * 정해진 시간이 지나면 자동으로 다음으로 넘어간다.
 */
export default function PlaceholderScene({
  def,
  progress,
  remaining,
}: {
  def: SceneDef;
  progress: number;
  remaining: number | null;
}) {
  return (
    <SceneShell className="px-6">
      <SceneTitle>{def.title}</SceneTitle>
      <SceneCaption className="mt-4">{def.caption}</SceneCaption>
      <div className="mt-12 flex items-center gap-4">
        <TimeRing progress={progress} size={44} />
        {remaining !== null && (
          <span className="tnum text-[12px] font-light text-paper-mute">
            {Math.ceil(remaining)}초
          </span>
        )}
      </div>
    </SceneShell>
  );
}
