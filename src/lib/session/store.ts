'use client';

import { create } from 'zustand';
import { experienceBus } from '@/lib/sensors/bus';
import { sessionClock } from '@/lib/sensors/clock';
import { sessionRecorder } from '@/lib/session/recorder';
import { DEFAULT_PERSONA_ID, type PersonaId } from '@/lib/sensors/personas';
import {
  makeSessionId,
  nextScene,
  prevScene,
  sceneDef,
  type ExperienceMode,
  type SceneId,
} from './scenes';
import type { LlmInput } from '@/lib/features/schema';
import type { BioReceipt } from '@/lib/interpret/schema';

/**
 * 신호 공급 방식.
 * - demo   : 생체신호는 시뮬레이터, 시선은 포인터. 심사위원 기본 경로.
 * - auto   : 가상 참가자가 시선·그림·대화까지 전부 자동 수행 (부스 무인 시연·리허설)
 * - live   : 실기기 (M5). 연결 실패 시 demo로 자동 폴백.
 */
export type SignalMode = 'demo' | 'auto' | 'live';

/**
 * 시선을 무엇으로 받을 것인가. 생체신호 모드와 독립이다.
 *
 * 밴드·GSR은 기기가 있어야 하지만 **시선은 웹캠만 있으면 지금 당장 된다.**
 * 그래서 signalMode에 묶지 않고 따로 뺐다 — 데모 모드에서도 진짜 시선을 쓸 수 있어야 한다.
 *
 * - pointer : 마우스 위치를 시선으로 간주. 설정 불필요, 대신 커서를 세워두면 그대로 기록된다
 * - webcam  : WebGazer 웹캠 추적. 권한과 9점 보정이 필요하고, 그만큼 진짜 시선이다
 */
export type GazeMode = 'pointer' | 'webcam';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'aborted' | 'done';

export interface SessionState {
  sessionId: string;
  nickname: string;
  mode: ExperienceMode;
  signalMode: SignalMode;
  personaId: PersonaId;
  gazeMode: GazeMode;
  /** 웹캠 시선 보정을 마쳤는가 */
  gazeCalibrated: boolean;
  scene: SceneId;
  /** 현재 씬에 진입한 세션 시각(ms) */
  sceneStartedAt: number;
  status: SessionStatus;
  /** 윤리 고지 동의 여부 */
  consented: boolean;
  /** 진행자가 띄운 경고 (GSR 미회복 등) */
  alert: string | null;
  /** 해석 결과 */
  llmInput: LlmInput | null;
  receipt: BioReceipt | null;
  /** 해석이 규칙 기반 폴백으로 만들어졌는가 */
  receiptFallback: boolean;
  /**
   * 폴백으로 내려간 이유. 진행자 화면에서만 쓴다.
   *
   * 이게 없으면 "왜 규칙 기반이지?"를 추측으로만 답하게 된다 —
   * 키를 넣었는데도 폴백이 나오는 상황(스코프 누락, 재배포 안 함, 호출 오류)을
   * 부스 현장에서 구분할 방법이 있어야 한다.
   */
  receiptReason: string | null;
  /** 심장 소리를 켤 것인가 */
  soundOn: boolean;
  /** 시선 물방울을 띄울 것인가 (웹캠 추적 중일 때만 의미가 있다) */
  gazeCursor: boolean;
  /**
   * S4에서 자극이 노출 중인가.
   *
   * 이 구간에는 시선 표시를 감춘다. 화면에 방울이 떠 있으면 사람은 자극이 아니라
   * 방울을 쫓고, 그러면 "어느 쪽을 오래 봤는가"가 통째로 무의미해진다.
   * 측정을 보여주려다 측정을 망치는 셈이라, 여기서만은 숨기는 게 맞다.
   */
  stimulusExposing: boolean;
  /** 씬 완료 신호를 세는 카운터 — 하위 시퀀스가 끝났음을 알린다 */
  sceneNonce: number;

  setNickname: (v: string) => void;
  setMode: (v: ExperienceMode) => void;
  setSignalMode: (v: SignalMode) => void;
  setPersona: (v: PersonaId) => void;
  setGazeMode: (v: GazeMode) => void;
  setGazeCalibrated: (v: boolean) => void;
  setConsented: (v: boolean) => void;
  setAlert: (v: string | null) => void;
  setLlmInput: (v: LlmInput | null) => void;
  setReceipt: (v: BioReceipt | null, fallback?: boolean, reason?: string | null) => void;
  setSoundOn: (v: boolean) => void;
  setGazeCursor: (v: boolean) => void;
  setStimulusExposing: (v: boolean) => void;

  begin: () => void;
  goTo: (scene: SceneId) => void;
  advance: () => void;
  back: () => void;
  pause: () => void;
  resume: () => void;
  abort: (reason?: string) => void;
  reset: () => void;
}

function enter(scene: SceneId): number {
  const t = sessionClock.now();
  sessionRecorder.enterScene(scene, t);
  experienceBus.emit('scene-enter', { ref: scene, t });
  return t;
}

/**
 * 세션이 아직 시작되지 않았음을 나타내는 값.
 *
 * 초기값으로 makeSessionId()를 부르면 안 된다 — 그 안의 난수가 서버 렌더와
 * 클라이언트에서 다른 값을 만들어 하이드레이션 불일치가 난다.
 * 실제 ID는 begin()에서, 즉 브라우저에서만 만든다.
 */
export const PENDING_SESSION_ID = '—';

export const useSession = create<SessionState>((set, get) => ({
  sessionId: PENDING_SESSION_ID,
  nickname: '',
  mode: 'full',
  signalMode: 'demo',
  personaId: DEFAULT_PERSONA_ID,
  gazeMode: 'pointer',
  gazeCalibrated: false,
  scene: 'S0',
  sceneStartedAt: 0,
  status: 'idle',
  consented: false,
  alert: null,
  llmInput: null,
  receipt: null,
  receiptFallback: false,
  receiptReason: null,
  soundOn: true,
  gazeCursor: true,
  stimulusExposing: false,
  sceneNonce: 0,

  setNickname: (v) => set({ nickname: v }),
  setMode: (v) => set({ mode: v }),
  setSignalMode: (v) => set({ signalMode: v }),
  setPersona: (v) => set({ personaId: v }),
  setGazeMode: (v) => set({ gazeMode: v, gazeCalibrated: false }),
  setGazeCalibrated: (v) => set({ gazeCalibrated: v }),
  setConsented: (v) => set({ consented: v }),
  setAlert: (v) => set({ alert: v }),
  setLlmInput: (v) => set({ llmInput: v }),
  setReceipt: (v, fallback = false, reason = null) =>
    set({ receipt: v, receiptFallback: fallback, receiptReason: reason }),
  setSoundOn: (v) => set({ soundOn: v }),
  setGazeCursor: (v) => set({ gazeCursor: v }),
  setStimulusExposing: (v) => set({ stimulusExposing: v }),

  begin: () => {
    sessionClock.reset();
    sessionRecorder.clear();
    experienceBus.clear();
    set({
      sessionId: makeSessionId(),
      status: 'running',
      scene: 'S1',
      sceneStartedAt: enter('S1'),
      llmInput: null,
      receipt: null,
      receiptFallback: false,
      receiptReason: null,
      alert: null,
      sceneNonce: 0,
    });
  },

  goTo: (scene) => {
    set({ scene, sceneStartedAt: enter(scene), sceneNonce: get().sceneNonce + 1 });
  },

  advance: () => {
    const n = nextScene(get().scene);
    if (!n) {
      set({ status: 'done' });
      return;
    }
    set({ scene: n, sceneStartedAt: enter(n), sceneNonce: get().sceneNonce + 1 });
  },

  back: () => {
    const p = prevScene(get().scene);
    if (p) set({ scene: p, sceneStartedAt: enter(p), sceneNonce: get().sceneNonce + 1 });
  },

  pause: () => set({ status: 'paused' }),
  resume: () => set({ status: 'running' }),

  abort: (reason) => set({ status: 'aborted', alert: reason ?? '세션이 중단되었습니다.' }),

  reset: () => {
    sessionClock.reset();
    sessionRecorder.clear();
    experienceBus.clear();
    set({
      sessionId: PENDING_SESSION_ID,
      nickname: '',
      scene: 'S0',
      sceneStartedAt: 0,
      status: 'idle',
      consented: false,
      alert: null,
      llmInput: null,
      receipt: null,
      receiptFallback: false,
      receiptReason: null,
      sceneNonce: 0,
    });
  },
}));

/** 현재 씬 정의 */
export function currentSceneDef(state: SessionState) {
  return sceneDef(state.scene);
}
