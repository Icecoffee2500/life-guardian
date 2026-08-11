/// <reference lib="webworker" />

/**
 * Whisper 추론 워커.
 *
 * 왜 워커인가: base 모델의 한 창(약 3.5초) 추론이 WASM에서 수백 ms~수 초 걸린다.
 * 메인 스레드에서 돌리면 그동안 호흡 원도 파형도 시선 물방울도 전부 멈춘다.
 * 참가자 눈에는 "말했더니 화면이 얼었다"로 보인다. 그건 고장이다.
 *
 * 모델은 우리 도메인(/models)에서 먼저 찾고, 없으면 허깅페이스로 폴백한다.
 * 빌드 때 벤더링이 실패했더라도 인터넷이 되는 환경이면 그대로 동작하게 두기 위해서다.
 */

type LoadMsg = { type: 'load' };
type AudioMsg = { type: 'audio'; id: number; pcm: Float32Array };
type InMsg = LoadMsg | AudioMsg;

export type WorkerOut =
  | { type: 'progress'; pct: number }
  | { type: 'ready' }
  | { type: 'text'; id: number; text: string }
  | { type: 'error'; message: string };

/** 로컬 벤더링 경로에서 쓰는 이름 */
const LOCAL_ID = 'whisper-base';
/** 폴백용 허깅페이스 저장소 */
const REMOTE_ID = 'Xenova/whisper-base';

type Asr = (
  audio: Float32Array,
  opts: Record<string, unknown>,
) => Promise<{ text?: string } | { text?: string }[]>;

let asr: Asr | null = null;
let loading: Promise<void> | null = null;

const post = (m: WorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

async function load(): Promise<void> {
  if (asr) return;
  if (loading) return loading;

  loading = (async () => {
    const tf = await import('@huggingface/transformers');
    const { pipeline, env } = tf;

    // onnxruntime의 wasm 바이너리도 우리 도메인에서 준다 (기본값은 외부 CDN이다)
    if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.wasmPaths = '/vendor/transformers/';

    const progress = (p: { status?: string; progress?: number }) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        post({ type: 'progress', pct: Math.max(0, Math.min(100, p.progress)) });
      }
    };

    const opts = { dtype: 'q8' as const, progress_callback: progress };

    try {
      // 1) 우리 도메인에 벤더링된 모델
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = '/models/';
      asr = (await pipeline('automatic-speech-recognition', LOCAL_ID, opts)) as unknown as Asr;
    } catch {
      // 2) 폴백 — 빌드 때 벤더링이 실패했을 때만 여기까지 온다
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      asr = (await pipeline('automatic-speech-recognition', REMOTE_ID, opts)) as unknown as Asr;
    }
    post({ type: 'ready' });
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      await load();
      return;
    }
    if (msg.type === 'audio') {
      await load();
      if (!asr) return;
      const out = await asr(msg.pcm, {
        language: 'korean',
        task: 'transcribe',
        // 짧은 창을 하나씩 넘기므로 chunk 분할은 필요 없다
        return_timestamps: false,
      });
      const text = (Array.isArray(out) ? out[0]?.text : out?.text) ?? '';
      post({ type: 'text', id: msg.id, text: String(text).trim() });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
