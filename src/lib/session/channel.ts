'use client';

import { supabase } from '@/lib/supabase/client';
import type { SourceSnapshot } from '@/lib/sensors/types';
import type { SceneId } from './scenes';
import type { SessionStatus } from './store';

/**
 * 세션 실황 채널 — 체험 화면이 방송하고 진행자 화면이 듣는다.
 *
 * 두 겹으로 만든다:
 *   1. BroadcastChannel — 같은 기기의 다른 창. 설정이 전혀 필요 없다.
 *   2. Supabase Realtime broadcast — 다른 기기. 환경변수가 있을 때만 켜진다.
 *
 * 둘 다 동시에 쓴다. 부스에서 노트북 한 대로 창 두 개를 띄우든,
 * 노트북과 모니터를 따로 두든 진행자 화면이 따라온다.
 *
 * **테이블을 쓰지 않는다.** 이건 흘러가는 상태지 기록이 아니다.
 * 초당 두 번씩 DB에 쓰면 무료 티어가 하루를 못 버티고, 남길 이유도 없다.
 * 남길 것(세션 기록)은 끝날 때 한 번 sessions 테이블로 간다.
 */

/** 부스 하나당 채널 하나. 여러 부스를 돌릴 일이 생기면 여기에 부스 ID를 붙인다. */
export const CHANNEL_NAME = 'lg:booth';

export interface LiveSessionState {
  sessionId: string;
  scene: SceneId;
  status: SessionStatus;
  nickname: string;
  /** 씬 내부 진행도 0~1 */
  progress: number;
  hr: number | null;
  rmssd: number | null;
  gsr: number | null;
  settled: boolean;
  sources: SourceSnapshot[];
  /** 방송한 쪽의 시계 (수신 측에서 신선도 판단) */
  at: number;
}

type Listener = (s: LiveSessionState) => void;

interface SupabaseChannelLike {
  send(args: { type: 'broadcast'; event: string; payload: unknown }): Promise<unknown> | unknown;
  on(
    type: 'broadcast',
    filter: { event: string },
    cb: (msg: { payload: unknown }) => void,
  ): SupabaseChannelLike;
  subscribe(cb?: (status: string) => void): SupabaseChannelLike;
  unsubscribe(): Promise<unknown> | unknown;
}

const EVENT = 'session-state';
const COMMAND = 'session-command';

/**
 * 진행자 → 체험 화면 명령.
 *
 * 실황이 한 방향으로만 흐르면 진행자 화면의 버튼이 자기 탭의 상태만 바꾼다.
 * 부스에서 창을 두 개로 나누는 순간 그 버튼들은 전부 장식이 된다.
 */
export type SessionCommand =
  | { kind: 'signal-mode'; value: 'demo' | 'auto' | 'live' }
  | { kind: 'persona'; value: string }
  | { kind: 'mode'; value: 'full' | 'compact' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'abort' }
  | { kind: 'advance' }
  | { kind: 'back' }
  | { kind: 'reset' };

type CommandListener = (c: SessionCommand) => void;

function isCommand(raw: unknown): raw is SessionCommand {
  return Boolean(raw && typeof raw === 'object' && 'kind' in raw);
}

/** 실황을 내보낸다 (체험 화면 전용) */
export class SessionBroadcaster {
  private bc: BroadcastChannel | null = null;
  private rt: SupabaseChannelLike | null = null;

  /** 진행자 화면에서 오는 명령을 받는다 */
  start(onCommand?: CommandListener): void {
    if (typeof window === 'undefined') return;
    try {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (e) => {
        if (onCommand && isCommand(e.data)) onCommand(e.data);
      };
      this.bc = bc;
    } catch {
      // 지원하지 않는 브라우저. Supabase 경로만 쓴다.
    }

    const client = supabase();
    if (client) {
      try {
        const ch = client.channel(CHANNEL_NAME, {
          config: { broadcast: { self: false } },
        }) as unknown as SupabaseChannelLike;
        ch.on('broadcast', { event: COMMAND }, (msg) => {
          if (onCommand && isCommand(msg.payload)) onCommand(msg.payload);
        }).subscribe();
        this.rt = ch;
      } catch {
        // Realtime을 못 쓰면 같은 기기 동기화만 남는다
      }
    }
  }

  send(state: LiveSessionState): void {
    try {
      this.bc?.postMessage(state);
    } catch {
      // 직렬화 실패는 무시 — 실황이 끊겨도 체험은 계속된다
    }
    try {
      void this.rt?.send({ type: 'broadcast', event: EVENT, payload: state });
    } catch {
      // 네트워크 실패도 마찬가지
    }
  }

  stop(): void {
    try {
      if (this.bc) this.bc.onmessage = null;
      this.bc?.close();
    } catch {
      /* 이미 닫힘 */
    }
    try {
      void this.rt?.unsubscribe();
    } catch {
      /* 이미 해제됨 */
    }
    this.bc = null;
    this.rt = null;
  }
}

/** 실황을 받고 명령을 보낸다 (진행자 화면 전용) */
export class SessionReceiver {
  private bc: BroadcastChannel | null = null;
  private rt: SupabaseChannelLike | null = null;

  start(onState: Listener): () => void {
    if (typeof window === 'undefined') return () => {};

    const handle = (raw: unknown) => {
      if (raw && typeof raw === 'object' && 'sessionId' in raw) {
        onState(raw as LiveSessionState);
      }
    };

    try {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (e) => handle(e.data);
      this.bc = bc;
    } catch {
      // 지원하지 않는 브라우저
    }

    const client = supabase();
    if (client) {
      try {
        const ch = client.channel(CHANNEL_NAME) as unknown as SupabaseChannelLike;
        ch.on('broadcast', { event: EVENT }, (msg) => handle(msg.payload)).subscribe();
        this.rt = ch;
      } catch {
        // Realtime 없이도 같은 기기에서는 동작한다
      }
    }

    return () => this.stop();
  }

  /** 체험 화면에 명령을 보낸다 */
  send(command: SessionCommand): void {
    try {
      this.bc?.postMessage(command);
    } catch {
      /* 직렬화 실패 */
    }
    try {
      void this.rt?.send({ type: 'broadcast', event: COMMAND, payload: command });
    } catch {
      /* 네트워크 실패 */
    }
  }

  stop(): void {
    try {
      if (this.bc) this.bc.onmessage = null;
      this.bc?.close();
    } catch {
      /* 이미 닫힘 */
    }
    try {
      void this.rt?.unsubscribe();
    } catch {
      /* 이미 해제됨 */
    }
    this.bc = null;
    this.rt = null;
  }
}

/** 실황이 이 시간(ms)보다 오래되면 "끊김"으로 본다 */
export const STALE_MS = 4000;
