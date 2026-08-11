'use client';

import type { WorkerOut } from './whisper.worker';

/**
 * 기기 안에서 도는 음성 인식.
 *
 * 브라우저 내장 인식(Web Speech API)은 오디오를 구글 서버로 보내 처리한다.
 * 그 경로가 막힌 환경에서는 코드로 우회할 방법이 없어서(network 오류),
 * 인식 자체를 기기 안으로 들여왔다. 오디오는 이 탭 밖으로 나가지 않는다 —
 * 기획안 부록 B의 "음성 원본 미저장"과도 같은 방향이다.
 *
 * 실시간처럼 보이게 하는 방법: 마이크 입력을 약 3.5초 창으로 잘라
 * 창 하나가 찰 때마다 워커에 넘기고, 돌아온 문장을 이어 붙인다.
 * 완전한 스트리밍은 아니지만 말하는 동안 글자가 쌓이는 것은 같다.
 */

/** 한 번에 넘기는 오디오 길이(초) */
const WINDOW_SEC = 3.5;
/** 창 사이 겹침(초) — 경계에서 잘린 단어를 줄인다 */
const OVERLAP_SEC = 0.4;
/** Whisper가 먹는 샘플레이트 */
const TARGET_RATE = 16000;
/**
 * 이 RMS 아래의 창은 넘기지 않는다.
 * Whisper는 무음을 받으면 "감사합니다" 같은 문장을 지어내는 버릇이 있다.
 * 조용한 부스에서 그게 답변으로 기록되면 측정이 아니라 창작이 된다.
 */
const SILENCE_RMS = 0.006;

export interface WhisperHandlers {
  /** 모델 내려받기 진행률 0~100 */
  onProgress?: (pct: number) => void;
  onReady?: () => void;
  /** 지금까지 인식된 전체 문장 */
  onPartial?: (text: string) => void;
  /** 사람이 말하기 시작한 순간 (첫 유의미한 창) */
  onSpeechStart?: () => void;
  onError?: (message: string) => void;
}

export interface WhisperHandle {
  stop: () => void;
}

/** 선형 보간 리샘플링. 오디오 품질보다 의존성 없음이 중요한 자리다. */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const n = Math.floor(input.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const i0 = Math.floor(p);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const w = p - i0;
    out[i] = input[i0] * (1 - w) + input[i1] * w;
  }
  return out;
}

function rms(a: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, a.length));
}

/**
 * 마이크를 열고 인식을 시작한다.
 * 실패하면 null. 호출부는 타이핑 입력으로 넘어간다.
 */
export async function startWhisper(h: WhisperHandlers): Promise<WhisperHandle | null> {
  if (typeof window === 'undefined') return null;

  let worker: Worker;
  try {
    worker = new Worker(new URL('./whisper.worker.ts', import.meta.url));
  } catch (e) {
    h.onError?.(e instanceof Error ? e.message : '워커를 시작할 수 없습니다');
    return null;
  }

  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let node: ScriptProcessorNode | null = null;
  let stopped = false;

  /** 창 하나에 해당하는 표본을 모으는 곳 (원본 샘플레이트) */
  let buf: Float32Array[] = [];
  let bufLen = 0;
  let nextId = 1;
  /** 창별 결과를 순서대로 이어 붙이기 위한 보관함 */
  const pieces = new Map<number, string>();
  let spoke = false;

  const flushText = () => {
    const ordered = [...pieces.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
    const text = ordered.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    h.onPartial?.(text);
  };

  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const m = e.data;
    if (m.type === 'progress') h.onProgress?.(m.pct);
    else if (m.type === 'ready') h.onReady?.();
    else if (m.type === 'error') h.onError?.(m.message);
    else if (m.type === 'text') {
      pieces.set(m.id, m.text);
      flushText();
    }
  };
  worker.onerror = (e) => h.onError?.(e.message || '인식기를 불러오지 못했습니다');

  // 모델은 마이크를 여는 것과 동시에 준비시킨다 (첫 발화를 놓치지 않도록)
  worker.postMessage({ type: 'load' });

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    h.onError?.('마이크 권한을 받지 못했습니다');
    worker.terminate();
    return null;
  }

  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor({ sampleRate: TARGET_RATE });
    await ctx.resume();

    const src = ctx.createMediaStreamSource(stream);
    /*
      ScriptProcessorNode는 표준상 폐기 예정이지만 AudioWorklet과 달리
      별도 파일 배포가 필요 없고 모든 대상 브라우저에서 동작한다.
      여기서 하는 일은 표본을 복사해 쌓는 것뿐이라 폐기 사유(메인 스레드 처리)의
      부담도 거의 없다 — 무거운 계산은 전부 워커에 있다.
    */
    node = ctx.createScriptProcessor(4096, 1, 1);
    const rate = ctx.sampleRate;
    const windowSamples = Math.floor(WINDOW_SEC * rate);
    const overlapSamples = Math.floor(OVERLAP_SEC * rate);

    node.onaudioprocess = (ev) => {
      if (stopped) return;
      buf.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
      bufLen += ev.inputBuffer.length;
      if (bufLen < windowSamples) return;

      // 창 하나를 이어 붙인다
      const merged = new Float32Array(bufLen);
      let o = 0;
      for (const chunk of buf) {
        merged.set(chunk, o);
        o += chunk.length;
      }

      // 겹침만 남기고 비운다
      const keep = merged.slice(Math.max(0, merged.length - overlapSamples));
      buf = [keep];
      bufLen = keep.length;

      if (rms(merged) < SILENCE_RMS) return;
      if (!spoke) {
        spoke = true;
        h.onSpeechStart?.();
      }
      const pcm = resample(merged, rate, TARGET_RATE);
      worker.postMessage({ type: 'audio', id: nextId++, pcm }, [pcm.buffer]);
    };

    src.connect(node);
    // ScriptProcessor는 목적지에 연결되어야 콜백이 돈다.
    // 게인 0을 거쳐 보내 스피커로는 아무 소리도 나가지 않게 한다(하울링 방지).
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(ctx.destination);
  } catch (e) {
    h.onError?.(e instanceof Error ? e.message : '오디오를 열 수 없습니다');
    stream.getTracks().forEach((t) => t.stop());
    worker.terminate();
    return null;
  }

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try {
        node?.disconnect();
        void ctx?.close();
        stream?.getTracks().forEach((t) => t.stop());
      } catch {
        /* 이미 닫힘 */
      }
      worker.terminate();
    },
  };
}
