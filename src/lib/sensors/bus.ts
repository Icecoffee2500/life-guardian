import type { ExperienceEvent, ExperienceEventType } from './types';
import { sessionClock } from './clock';

type Listener = (e: ExperienceEvent) => void;

/**
 * 체험 이벤트 버스.
 *
 * 씬(자극 제시, 질문 낭독, 스트로크)이 여기에 이벤트를 흘리면
 * 시뮬레이터가 구독해 생리 반응을 만들고, SessionRecorder가 마커로 기록한다.
 * 실기기 모드에서도 마커 기록 경로는 동일하다.
 */
export class ExperienceBus {
  private listeners = new Set<Listener>();
  private log: ExperienceEvent[] = [];

  emit(
    type: ExperienceEventType,
    opts: { ref?: string; intensity?: number; affinity?: number; t?: number } = {},
  ): ExperienceEvent {
    const e: ExperienceEvent = {
      t: opts.t ?? sessionClock.now(),
      type,
      ref: opts.ref,
      intensity: opts.intensity,
      affinity: opts.affinity,
    };
    this.log.push(e);
    for (const l of this.listeners) l(e);
    return e;
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** 기록된 모든 마커 (SessionRecorder·특징 추출에서 사용) */
  markers(): ExperienceEvent[] {
    return this.log;
  }

  clear(): void {
    this.log = [];
  }
}

export const experienceBus = new ExperienceBus();
