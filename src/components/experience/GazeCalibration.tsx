'use client';

import { useCallback, useState } from 'react';
import { CALIBRATION_POINTS, CLICKS_PER_POINT, type WebGazerSource } from '@/lib/sensors/webgazer';
import Button from '@/components/ui/Button';

/**
 * 9점 시선 보정.
 *
 * WebGazer는 "화면의 이 지점을 보고 있을 때 눈이 이렇게 생겼다"는 예시를 모아
 * 회귀 모델을 만든다. 보정 없이는 좌표가 화면 중앙 근처에서만 맴돌고,
 * 그러면 좌우 판정이 동전 던지기가 된다 — 즉 이 단계를 건너뛰면
 * 시선 데이터로 뭔가를 말할 자격이 없다.
 *
 * 참가자에게 요구하는 것은 하나뿐이다: **점을 보면서 점을 누르기.**
 * 보는 것과 누르는 것이 같은 지점이어야 학습이 성립한다.
 */
export default function GazeCalibration({
  source,
  onDone,
  onCancel,
}: {
  source: WebGazerSource;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [counts, setCounts] = useState<number[]>(() => CALIBRATION_POINTS.map(() => 0));

  const total = CALIBRATION_POINTS.length * CLICKS_PER_POINT;
  const done = counts.reduce((a, b) => a + b, 0);
  const complete = counts.every((c) => c >= CLICKS_PER_POINT);

  const hit = useCallback(
    (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
      // 실제로 클릭한 화면 좌표를 그대로 학습시킨다.
      // 점의 논리 좌표가 아니라 진짜 픽셀이어야 한다.
      source.calibrateAt(e.clientX, e.clientY);
      setCounts((prev) => {
        const next = [...prev];
        next[i] = Math.min(CLICKS_PER_POINT, next[i] + 1);
        return next;
      });
    },
    [source],
  );

  return (
    <div className="fixed inset-0 z-50 bg-surface">
      {/* 안내 — 화면 가운데 점과 겹치지 않게 위쪽에 */}
      <div className="absolute inset-x-0 top-0 z-10 px-6 pt-10 text-center">
        <h2 className="t-title text-ink">점을 보면서, 그 점을 눌러주세요</h2>
        <p className="t-body mx-auto mt-3 max-w-md text-ink-2">
          아홉 개의 점을 각각 다섯 번씩 누릅니다. 누를 때 시선도 그 점에 두어야 합니다.
        </p>
        <p className="t-number mt-4 text-[15px] text-ink">
          {done} / {total}
        </p>
      </div>

      {CALIBRATION_POINTS.map((p, i) => {
        const n = counts[i];
        const filled = n / CLICKS_PER_POINT;
        const isDone = n >= CLICKS_PER_POINT;
        return (
          <button
            key={i}
            onClick={(e) => hit(i, e)}
            aria-label={`보정점 ${i + 1}, ${n}/${CLICKS_PER_POINT}`}
            className="absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform duration-150 active:scale-90"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          >
            {/* 채워지는 정도가 곧 남은 횟수 — 숫자를 세지 않아도 보이게 */}
            <span
              className="absolute inset-0 rounded-full border-2"
              style={{
                borderColor: isDone ? 'var(--color-hrv)' : 'var(--color-line-strong)',
                background: isDone
                  ? 'var(--color-hrv)'
                  : `conic-gradient(var(--color-ink) ${filled * 360}deg, transparent 0deg)`,
                opacity: isDone ? 1 : 0.9,
              }}
            />
            <span
              className="relative h-3 w-3 rounded-full"
              style={{ background: isDone ? 'var(--color-surface)' : 'var(--color-ink)' }}
            />
          </button>
        );
      })}

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-3 px-6 pb-10">
        <Button onClick={onDone} disabled={!complete} size="lg">
          {complete ? '보정 완료' : `${total - done}번 더`}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          건너뛰고 포인터로 진행
        </Button>
      </div>
    </div>
  );
}
