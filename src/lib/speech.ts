'use client';

/**
 * Web Speech API(음성 합성) 얇은 래퍼.
 *
 * 브라우저 지원이 고르지 않다(권한·정책에 따라 조용히 죽는 경우가 있다).
 * 그래서 이 모듈의 계약은 하나다: **없으면 없는 대로 진행된다.**
 * 낭독이 안 되면 문항을 읽는 시간만큼 화면에 띄우고 다음으로 넘어간다.
 *
 * 응답은 음성 인식이 아니라 참가자의 직접 입력(타이핑)으로만 받는다.
 */

export interface SpeechCapabilities {
  tts: boolean;
}

export function speechCapabilities(): SpeechCapabilities {
  if (typeof window === 'undefined') return { tts: false };
  return {
    tts: 'speechSynthesis' in window,
  };
}

/** 한국어 낭독 속도 추정(글자/초). TTS가 없을 때 낭독 시간을 흉내 내는 데 쓴다. */
const CHARS_PER_SEC = 6.2;

export function estimateReadSec(text: string): number {
  return Math.max(1.6, text.length / CHARS_PER_SEC);
}

/**
 * 문항 낭독. TTS가 없거나 실패하면 추정 시간만큼 기다렸다 resolve한다.
 * 어느 경로로 끝나든 호출부는 "낭독이 끝났다"만 알면 된다.
 */
export function speak(
  text: string,
  opts: { rate?: number; minSec?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const floor = (opts.minSec ?? 0) * 1000;
  const fallbackMs = Math.max(floor, estimateReadSec(text) * 1000);

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      resolve();
    };

    // TTS가 이벤트를 안 주고 죽는 경우가 실제로 있다. 상한 타이머는 항상 건다.
    const guard = setTimeout(finish, fallbackMs + 4000);

    if (opts.signal?.aborted) return finish();
    opts.signal?.addEventListener('abort', finish, { once: true });

    if (!speechCapabilities().tts) {
      setTimeout(finish, fallbackMs);
      return;
    }

    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      u.rate = opts.rate ?? 0.94;
      u.pitch = 1;
      const ko = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith('ko'));
      if (ko) u.voice = ko;
      u.onend = finish;
      u.onerror = () => setTimeout(finish, 300);
      synth.speak(u);
    } catch {
      setTimeout(finish, fallbackMs);
    }
  });
}

export function cancelSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // 무시 — 낭독 취소 실패가 체험을 막아서는 안 된다
  }
}

