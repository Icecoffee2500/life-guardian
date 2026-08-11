'use client';

import { useCallback, useState } from 'react';
import { CALIBRATION_POINTS, CLICKS_PER_POINT, type WebGazerSource } from '@/lib/sensors/webgazer';
import Button from '@/components/ui/Button';
import GazeCursor from './GazeCursor';

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
      {/*
        보정 중에는 물방울을 항상 띄운다.
        여기가 "웹캠이 정말로 내 눈을 보고 있는가"에 답하는 유일한 자리이고,
        방울이 점 근처로 모여드는 걸 보면서 보정이 되고 있는지도 스스로 판단할 수 있다.
        측정 구간이 아니라서 시선을 오염시킬 걱정도 없다.
      */}
      <GazeCursor visible />
      {/*
        안내와 조작 버튼은 점 사이의 빈 띠(24% / 73%)에 놓는다.
        보정점은 회귀를 위해 화면 가장자리(y=0.1 / 0.9)에 있어야 하는데,
        예전처럼 안내를 top-0에, 버튼을 bottom-0에 두면 그 블록들이
        위아래 점 여섯 개를 그대로 덮어 클릭을 먹어버린다.

        위치를 옮겨도 짧은 화면에서는 다시 겹칠 수 있으므로,
        두 블록 모두 pointer-events-none으로 클릭을 통과시키고
        점을 z-20으로 올려 둔다. 겹쳐도 눌리는 쪽은 언제나 점이다.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-[24%] z-10 -translate-y-1/2 px-6 text-center">
        <h2 className="t-title text-ink">점을 보면서, 그 점을 눌러주세요</h2>
        <p className="t-body mx-auto mt-2 max-w-md text-ink-2">
          아홉 개의 점을 각각 다섯 번씩 누릅니다. 누를 때 시선도 그 점에 두어야 합니다.
          <span className="t-number ml-3 text-[15px] text-ink">
            {done} / {total}
          </span>
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
            /* z-20 — 안내 패널·버튼 바(z-10)보다 위에 있어야 겹친 자리에서도 눌린다 */
            className="absolute z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform duration-150 active:scale-90"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          >
            {/* 글자 위에 겹쳐도 점이 읽히도록 불투명한 바탕을 깐다 */}
            <span className="absolute inset-0 rounded-full bg-surface" />

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

      {/* 바는 클릭을 통과시키고 버튼만 살린다 */}
      <div className="pointer-events-none absolute inset-x-0 top-[73%] z-10 flex -translate-y-1/2 items-center justify-center gap-3 px-6">
        <Button onClick={onDone} disabled={!complete} size="lg" className="pointer-events-auto">
          {complete ? '보정 완료' : `${total - done}번 더`}
        </Button>
        <Button variant="quiet" onClick={onCancel} className="pointer-events-auto">
          건너뛰고 포인터로 진행
        </Button>
      </div>
    </div>
  );
}
