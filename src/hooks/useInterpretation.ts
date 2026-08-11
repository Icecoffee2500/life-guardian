'use client';

import { useEffect, useRef } from 'react';
import { sensorHub } from '@/lib/sensors/hub';
import { getPersona } from '@/lib/sensors/personas';
import { runInterpretation } from '@/lib/interpret/run';
import { sessionRecorder } from '@/lib/session/recorder';
import { saveSession } from '@/lib/storage/persist';
import { downsampleTrace } from '@/lib/storage/record';
import { useSession } from '@/lib/session/store';

/**
 * S7에 진입하는 순간 해석을 시작한다.
 *
 * 참가자가 리플레이를 보는 동안 뒤에서 조용히 돌고, 끝나면 S8에 결과가 준비되어 있다.
 * 그래서 로딩 화면이 필요 없다 — 대기 시간을 콘텐츠로 덮는 편이 언제나 낫다.
 *
 * 페이지 수준에서 한 번만 호출한다. 씬 안에서 호출하면 씬이 리마운트될 때마다
 * 해석이 다시 돈다.
 */
export function useInterpretation() {
  const scene = useSession((s) => s.scene);
  const sessionId = useSession((s) => s.sessionId);
  const signalMode = useSession((s) => s.signalMode);
  const personaId = useSession((s) => s.personaId);
  const setReceipt = useSession((s) => s.setReceipt);
  const setLlmInput = useSession((s) => s.setLlmInput);

  /** 이 세션에서 이미 해석을 시작했는가 (씬을 오가도 다시 돌지 않게) */
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    if (scene !== 'S7') return;
    if (startedFor.current === sessionId) return;
    startedFor.current = sessionId;

    const ac = new AbortController();
    const metrics = sensorHub.current();
    const persona = getPersona(personaId);
    const auto = signalMode === 'auto';

    void runInterpretation({
      sessionId,
      settled: metrics.settled,
      settleTimeSec: metrics.settleTimeSec,
      // 데모·시뮬레이션의 시선은 실기기가 아니다. 그 사실을 프롬프트가 알아야 한다.
      gazeDegraded: signalMode !== 'live',
      pressureTrusted: false,
      futureSketch: auto ? persona.drawing.futureSketch : null,
      speechTopOverride: auto ? persona.speechTopRiasec : undefined,
      signal: ac.signal,
    })
      .then((out) => {
        if (ac.signal.aborted) return;
        setLlmInput(out.input);
        setReceipt(out.receipt, out.fallback);

        // 영수증이 나오는 즉시 저장한다. 저장 실패는 체험을 막지 않는다.
        const hr = sessionRecorder.hr;
        void saveSession({
          session_id: sessionId,
          nickname: useSession.getState().nickname,
          mode: useSession.getState().mode,
          created_at: new Date().toISOString(),
          input: out.input,
          receipt: out.receipt,
          fallback: out.fallback,
          hr_trace: downsampleTrace(hr),
          duration_sec: Math.round((hr[hr.length - 1]?.t ?? 0) / 1000),
        });
      })
      .catch(() => {
        // runInterpretation은 자체 폴백을 갖고 있어 여기까지 오지 않는다.
        // 와도 세션을 막지는 않는다 — S8이 "정리하고 있습니다"를 계속 보여준다.
      });

    return () => ac.abort();
  }, [personaId, scene, sessionId, setLlmInput, setReceipt, signalMode]);
}
