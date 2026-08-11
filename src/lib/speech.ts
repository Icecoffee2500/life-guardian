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
  /** 인식기가 실제로 마이크를 열었다 — "듣고 있다"의 유일한 증거 */
  onAudioStart?: () => void;
  /** 더 이상 재시도하지 않고 끝났다. 이유 코드를 그대로 넘긴다. */
  onError?: (reason: string) => void;
}

/**
 * 다시 시도해도 소용없는 오류.
 *
 * - network: 크롬의 음성 인식은 오디오를 구글 서버로 보내 처리한다.
 *   그 경로가 막히면 몇 번을 다시 걸어도 같은 결과다.
 * - not-allowed / service-not-allowed: 권한·정책 차단
 * - audio-capture: 마이크 장치를 못 연다 (다른 스트림이 잡고 있는 경우 포함)
 */
const FATAL = new Set(['network', 'not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);

/** 브라우저가 임의로 끊었을 때 다시 여는 최대 횟수 */
const MAX_RESTARTS = 6;
/** 재시작 간격(ms). 곧바로 start()를 부르면 InvalidStateError가 난다. */
const RESTART_DELAY_MS = 250;

/**
 * 연속 인식기. 한 문항의 응답 구간 동안만 살아 있다.
 * 지원하지 않는 브라우저에서는 null을 돌려주고, 호출부는 타이핑 입력으로 넘어간다.
 *
 * 재시작 정책이 이 함수의 핵심이다. 크롬의 연속 인식은 말이 끊기면 스스로 종료하는데,
 * 예전 구현은 onend마다 무조건 다시 걸었다. 그래서 network 같은 치명적 오류에서는
 * 실패 → 재시작 → 실패가 초당 몇 번씩 돌며 오류 메시지만 계속 덮어썼다.
 * 이제 치명적 오류에서는 재시작하지 않고 한 번만 알린다.
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
  let restarts = 0;
  let fatal: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  rec.onspeechstart = () => h.onSpeechStart?.();
  rec.onaudiostart = () => h.onAudioStart?.();
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const t = r[0]?.transcript ?? '';
      if (r.isFinal) finalText += t;
      else interim += t;
    }
    // 한 글자라도 돌아왔다면 이 세션은 살아 있다. 재시작 예산을 되돌려 준다.
    if (finalText || interim) restarts = 0;
    h.onPartial?.((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    const reason = e?.error ?? 'unknown';
    // no-speech는 오류가 아니라 '아직 말을 안 했다'는 뜻이다. 조용히 다시 연다.
    if (reason === 'no-speech' || reason === 'aborted') return;
    if (FATAL.has(reason)) {
      fatal = reason;
      h.onError?.(reason);
    }
  };
  rec.onend = () => {
    if (!stopped && !fatal && restarts < MAX_RESTARTS) {
      restarts += 1;
      timer = setTimeout(() => {
        try {
          rec.start();
        } catch {
          /* 재시작 실패는 무응답으로 처리된다 */
        }
      }, RESTART_DELAY_MS);
      return;
    }
    if (!stopped && !fatal) h.onError?.('too-many-restarts');
    h.onFinal?.(finalText.trim());
  };

  try {
    rec.start();
  } catch {
    return null;
  }

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    try {
      rec.stop();
    } catch {
      h.onFinal?.(finalText.trim());
    }
  };
}

/** 오류 코드를 참가자에게 보여줄 한 문장으로 */
export function recognitionErrorMessage(reason: string): string {
  switch (reason) {
    case 'network':
      return '음성 인식 서버에 닿지 못했습니다. 아래에 직접 입력해 주세요.';
    case 'not-allowed':
    case 'service-not-allowed':
      return '브라우저가 음성 인식을 막았습니다. 주소창의 마이크 권한을 허용해 주세요.';
    case 'audio-capture':
      return '마이크 장치를 열 수 없습니다. 아래에 직접 입력해 주세요.';
    case 'language-not-supported':
      return '이 브라우저가 한국어 인식을 지원하지 않습니다. 아래에 직접 입력해 주세요.';
    default:
      return '음성 인식이 멈췄습니다. 아래에 직접 입력해 주세요.';
  }
}
