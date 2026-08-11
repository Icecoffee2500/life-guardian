'use client';

import { useCallback, useState } from 'react';
import { motion } from 'motion/react';
import SceneShell, { SceneCaption, SceneTitle } from './SceneShell';
import SignalCanvas from '@/components/SignalCanvas';
import Button from '@/components/ui/Button';
import {
  connectLiveSource,
  connectWebcamGaze,
  useSourceSnapshots,
  type LiveDeviceKind,
} from '@/hooks/useSensors';
import GazeCalibration from '@/components/experience/GazeCalibration';
import type { WebGazerSource } from '@/lib/sensors/webgazer';
import { useSession } from '@/lib/session/store';
import type { SourceSnapshot } from '@/lib/sensors/types';

const KIND_META: Record<string, { title: string; detail: string; color: string }> = {
  band: { title: '심박 · HRV', detail: '스마트밴드', color: 'var(--color-hr)' },
  gsr: { title: '피부 전기전도도', detail: 'Grove GSR', color: 'var(--color-gsr)' },
  gaze: { title: '시선', detail: '아이트래커', color: 'var(--color-hrv)' },
};

function StatusDot({ s }: { s: SourceSnapshot }) {
  const color = KIND_META[s.kind]?.color ?? 'var(--color-ink)';
  if (s.status === 'streaming') {
    return (
      <span className="relative flex h-1.5 w-1.5">
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-60"
          style={{ background: color, animation: 'pulse-ring 2.4s var(--ease-calm) infinite' }}
        />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      </span>
    );
  }
  if (s.status === 'error') return <span className="h-1.5 w-1.5 rounded-full bg-warn" />;
  return (
    <motion.span
      className="h-1.5 w-1.5 rounded-full bg-ink-3"
      animate={{ opacity: [0.25, 0.8, 0.25] }}
      transition={{ duration: 1.6, repeat: Infinity }}
    />
  );
}

function SourceRow({
  s,
  index,
  onLink,
  linking,
}: {
  s: SourceSnapshot;
  index: number;
  /** 실기기 모드에서만 넘어온다 */
  onLink?: (kind: LiveDeviceKind) => void;
  linking?: boolean;
}) {
  const meta = KIND_META[s.kind] ?? { title: s.kind, detail: '', color: 'var(--color-ink)' };
  const live = s.status === 'streaming';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.09 * index, duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
      className="flex items-center gap-4 px-5 py-4"
    >
      <StatusDot s={s} />
      <div className="min-w-0 flex-1">
        <div className="t-body-strong text-ink">{meta.title}</div>
        <div className="mt-0.5 truncate t-label">{s.label}</div>
      </div>

      {/* 연결되기 전에는 평탄선. 연결되는 순간 그 자리에서 신호가 살아난다. */}
      <div className="relative h-8 w-24 shrink-0 sm:w-32">
        {live && s.kind !== 'gaze' ? (
          <SignalCanvas
            variant="strip"
            channels={s.kind === 'band' ? ['hr'] : ['gsr']}
            className="h-full w-full"
            speed={46}
          />
        ) : (
          <div className="flex h-full items-center">
            <motion.div
              className="h-px w-full"
              style={{ background: live ? meta.color : 'var(--color-line)' }}
              animate={live ? { opacity: [0.3, 0.75, 0.3] } : { opacity: 0.5 }}
              transition={live ? { duration: 2.6, repeat: Infinity } : undefined}
            />
          </div>
        )}
      </div>

      {onLink && s.mode !== 'live' ? (
        /*
          실기기 연결은 반드시 이 버튼(=사용자 제스처)에서 시작해야 한다.
          Web Bluetooth·Web Serial의 선택 다이얼로그는 제스처 없이는 열리지 않는다.
          연결 전까지는 시뮬레이터가 붙어 있어 체험이 멈추지 않는다.

          t-label 대신 크기·굵기만 맞춰 직접 썼다 — t-label은 색을 ink-3로
          고정하는데(전역 CSS가 레이어 밖에 있어 유틸리티 색상 클래스로 덮어쓸 수 없다),
          이 버튼은 기본/호버 색이 달라야 해서 색은 별도로 지정한다.
        */
        <button
          onClick={() => onLink(s.kind as LiveDeviceKind)}
          disabled={linking}
          className="w-20 shrink-0 rounded-full border border-line-strong px-2 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors duration-300 hover:bg-surface-sunken hover:text-ink disabled:opacity-40"
        >
          {linking ? '연결 중' : '기기 연결'}
        </button>
      ) : (
        <span className="w-12 shrink-0 text-right t-label">
          {s.status === 'streaming'
            ? '수신'
            : s.status === 'connecting'
              ? '연결'
              : s.status === 'error'
                ? '실패'
                : '대기'}
        </span>
      )}
    </motion.div>
  );
}

/**
 * S1 — 장비 연결.
 *
 * 이 씬의 목적은 절차가 아니라 첫 번째 "와우"다.
 * 밴드가 붙는 순간 화면 전체에 참가자의 심박이 살아난다.
 */
export default function S1Connect({ onDone }: { onDone: () => void }) {
  const sources = useSourceSnapshots();
  const signalMode = useSession((s) => s.signalMode);
  const live = signalMode === 'live';
  const ready = sources.length > 0 && sources.every((s) => s.status === 'streaming');
  const heroIn = sources.some((s) => s.kind === 'band' && s.status === 'streaming');

  const [linking, setLinking] = useState<LiveDeviceKind | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const gazeMode = useSession((s) => s.gazeMode);
  const gazeCalibrated = useSession((s) => s.gazeCalibrated);
  const setGazeMode = useSession((s) => s.setGazeMode);
  const setGazeCalibrated = useSession((s) => s.setGazeCalibrated);
  /** 보정 오버레이를 띄우는 동안 붙잡아 두는 소스 */
  const [calibrating, setCalibrating] = useState<WebGazerSource | null>(null);
  const [gazeBusy, setGazeBusy] = useState(false);
  const [gazeError, setGazeError] = useState<string | null>(null);

  /**
   * 웹캠 시선 추적을 켠다.
   *
   * 여기가 이 프로젝트에서 시선이 **진짜**가 되는 유일한 지점이다.
   * 포인터 프록시는 커서를 한쪽에 세워두면 그 위치를 계속 응시로 기록하는데,
   * 그 데이터로 "어느 쪽을 오래 봤다"고 말하는 건 정직하지 않다.
   */
  const enableWebcamGaze = useCallback(async () => {
    setGazeError(null);
    setGazeBusy(true);
    const res = await connectWebcamGaze();
    setGazeBusy(false);
    if (!res.ok) {
      setGazeError('웹캠을 열 수 없습니다. 포인터로 계속 진행합니다.');
      return;
    }
    setGazeMode('webcam');
    setCalibrating(res.source);
  }, [setGazeMode]);

  const onLink = useCallback(async (kind: LiveDeviceKind) => {
    setLinkError(null);
    setLinking(kind);
    const res = await connectLiveSource(kind);
    setLinking(null);
    if (!res.ok) setLinkError(`${kind} 연결 실패 — 시뮬레이터로 계속합니다`);
  }, []);

  const webcamOn = gazeMode === 'webcam' && gazeCalibrated;

  if (calibrating) {
    return (
      <GazeCalibration
        source={calibrating}
        onDone={() => {
          setGazeCalibrated(true);
          setCalibrating(null);
        }}
        onCancel={() => {
          // 보정을 포기하면 시선 데이터를 믿을 수 없다. 포인터로 되돌린다.
          setGazeMode('pointer');
          setCalibrating(null);
        }}
      />
    );
  }

  return (
    <SceneShell className="px-6">
      {/* 밴드가 붙는 순간 배경 전체에 심박이 흐른다 */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: heroIn ? 0.5 : 0 }}
        transition={{ duration: 2.4, ease: 'easeOut' }}
      >
        <SignalCanvas variant="hero" channels={['hr']} className="h-full w-full" intensity={0.28} />
      </motion.div>

      <div className="relative z-10 w-full max-w-md">
        <SceneTitle className="!text-[clamp(1.4rem,3.2vw,2.1rem)]">신호를 연결합니다</SceneTitle>
        <SceneCaption className="mt-3">
          센서가 없어도 괜찮습니다. 시뮬레이션으로 그대로 진행됩니다.
        </SceneCaption>

        <div className="mt-9 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-raised">
          {sources.map((s, i) => (
            <SourceRow
              key={s.kind}
              s={s}
              index={i}
              onLink={live ? (k) => void onLink(k) : undefined}
              linking={linking === s.kind}
            />
          ))}
        </div>

        {linkError && (
          <p className="mt-4 text-center text-[13px] font-semibold text-warn">{linkError}</p>
        )}

        {/*
          웹캠 시선 추적 — 기기가 없어도 지금 켤 수 있는 유일한 '진짜' 센서다.
          기본값은 포인터지만, 이 버튼을 누르면 실제로 눈을 본다.
        */}
        <div className="mt-4 rounded-[4px] border border-line bg-surface-raised p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="t-body-strong text-ink">
                {webcamOn ? '웹캠으로 시선을 추적합니다' : '시선을 웹캠으로 측정할까요?'}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-ink-3">
                {webcamOn
                  ? '보정이 끝났습니다. 화면을 보는 방향이 그대로 기록됩니다.'
                  : '켜지 않으면 마우스 위치를 시선으로 간주합니다. 9점 보정에 30초쯤 걸립니다.'}
              </p>
            </div>
            {!webcamOn && (
              <Button
                variant="secondary"
                onClick={() => void enableWebcamGaze()}
                disabled={gazeBusy}
                className="shrink-0"
              >
                {gazeBusy ? '여는 중' : '웹캠 켜기'}
              </Button>
            )}
          </div>
          {gazeError && <p className="mt-3 text-[13px] font-semibold text-warn">{gazeError}</p>}
        </div>

        {/*
          자동으로 넘기지 않는다. 여기는 웹캠을 켤지 정하는 결정 지점이고,
          2.6초 뒤에 화면이 저절로 넘어가면 그 결정을 할 시간이 없다.
        */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <Button size="lg" onClick={onDone} disabled={!ready} className="w-full">
            {ready ? '측정 시작' : '연결하는 중입니다'}
          </Button>
          {live && (
            <p className="t-label text-center">연결하지 않은 채널은 시뮬레이터로 진행됩니다.</p>
          )}
        </div>
      </div>
    </SceneShell>
  );
}
