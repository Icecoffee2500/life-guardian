'use client';

/**
 * Web Speech API 얇은 래퍼.
 *
 * 브라우저 지원이 고르지 않다(Safari의 인식은 불안정하고, 권한을 거부하면 조용히 죽는다).
 * 그래서 이 모듈의 계약은 하나다: **없으면 없는 대로 진행된다.**
 * 낭독이 안 되면 문항을 읽는 시간만큼 화면에 띄우고, 인식이 안 되면 타이핑으로 받는다.
 *
 * 윤리 가드레일(부록 B): 음성 원본은 어디에도 저장하지 않는다.
 * 여기서 밖으로 나가는 것은 인식된 텍스트뿐이다.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onaudiostart: (() => void) | null;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechCapabilities {
  tts: boolean;
  stt: boolean;
}

export function speechCapabilities(): SpeechCapabilities {
  if (typeof window === 'undefined') return { tts: false, stt: false };
  return {
    tts: 'speechSynthesis' in window,
    stt: recognitionCtor() !== null,
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

export interface RecognizerHandlers {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  /** 첫 발화가 감지된 순간 — 응답 지연시간의 종료점 */
  onSpeechStart?: () => void;
  onError?: (reason: string) => void;
}

/**
 * 연속 인식기. 한 문항의 응답 구간 동안만 살아 있다.
 * 지원하지 않는 브라우저에서는 null을 돌려주고, 호출부는 타이핑 입력으로 넘어간다.
 */
export function startRecognition(h: RecognizerHandlers): (() => void) | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  let rec: SpeechRecognitionLike;
  try {
    rec = new Ctor();
  } catch {
    return null;
  }

  rec.lang = 'ko-KR';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = '';
  let stopped = false;

  rec.onspeechstart = () => h.onSpeechStart?.();
  rec.onaudiostart = () => {
    /* 마이크가 열렸다. 발화 시작은 onspeechstart에서만 잡는다. */
  };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const t = r[0]?.transcript ?? '';
      if (r.isFinal) finalText += t;
      else interim += t;
    }
    h.onPartial?.((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    h.onError?.(e?.error ?? 'unknown');
  };
  rec.onend = () => {
    if (!stopped) {
      // 브라우저가 임의로 끊는 경우가 있다. 응답 구간 안이면 다시 연다.
      try {
        rec.start();
        return;
      } catch {
        /* 재시작 실패는 무응답으로 처리된다 */
      }
    }
    h.onFinal?.(finalText.trim());
  };

  try {
    rec.start();
  } catch {
    return null;
  }

  return () => {
    stopped = true;
    try {
      rec.stop();
    } catch {
      h.onFinal?.(finalText.trim());
    }
  };
}
