'use client';

import { useEffect, useRef } from 'react';
import { sensorHub } from '@/lib/sensors/hub';
import { SessionBroadcaster, type LiveSessionState } from '@/lib/session/channel';
import { useSession } from '@/lib/session/store';

/** 방송 주기 — 진행자가 상황을 읽기에 충분하고, Realtime 쿼터를 축내지 않을 만큼 */
const SEND_INTERVAL_MS = 500;

/**
 * 체험 화면의 실황을 진행자 화면으로 내보낸다.
 *
 * 페이지 수준에서 한 번만 호출한다. 씬 안에서 호출하면 씬이 바뀔 때마다
 * 채널이 다시 열린다.
 */
export function useSessionBroadcast(progress: number) {
  const scene = useSession((s) => s.scene);
  const status = useSession((s) => s.status);
  const sessionId = useSession((s) => s.sessionId);
  const nickname = useSession((s) => s.nickname);

  // 렌더마다 바뀌는 값은 ref로 넘긴다 — 타이머를 다시 걸 이유가 없다.
  // 쓰기는 렌더 중이 아니라 이펙트에서 한다(한 프레임 늦어도 2Hz 방송에는 무관하다).
  const snapshot = useRef({ scene, status, sessionId, nickname, progress });
  useEffect(() => {
    snapshot.current = { scene, status, sessionId, nickname, progress };
  }, [scene, status, sessionId, nickname, progress]);

  useEffect(() => {
    const caster = new SessionBroadcaster();

    // 진행자 화면의 버튼이 이 창에 실제로 닿게 한다.
    // 스토어를 직접 집어 쓴다(구독하지 않는다) — 이 이펙트는 한 번만 걸려야 한다.
    caster.start((c) => {
      const st = useSession.getState();
      switch (c.kind) {
        case 'signal-mode':
          st.setSignalMode(c.value);
          break;
        case 'persona':
          st.setPersona(c.value as Parameters<typeof st.setPersona>[0]);
          break;
        case 'mode':
          st.setMode(c.value);
          break;
        case 'pause':
          st.pause();
          break;
        case 'resume':
          st.resume();
          break;
        case 'abort':
          st.abort('진행자가 세션을 중단했습니다.');
          break;
        case 'advance':
          st.advance();
          break;
        case 'back':
          st.back();
          break;
        case 'reset':
          st.reset();
          break;
      }
    });

    const timer = setInterval(() => {
      const m = sensorHub.current();
      const s = snapshot.current;
      const state: LiveSessionState = {
        sessionId: s.sessionId,
        scene: s.scene,
        status: s.status,
        nickname: s.nickname,
        progress: Math.round(s.progress * 100) / 100,
        hr: m.hr === null ? null : Math.round(m.hr),
        rmssd: m.rmssd === null ? null : Math.round(m.rmssd),
        gsr: m.gsr === null ? null : Math.round(m.gsr * 100) / 100,
        settled: m.settled,
        sources: sensorHub.sources(),
        at: Date.now(),
      };
      caster.send(state);
    }, SEND_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      caster.stop();
    };
  }, []);
}
