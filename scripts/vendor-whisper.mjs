/**
 * Whisper 모델과 onnxruntime WASM을 self-host 한다.
 *
 *   node scripts/vendor-whisper.mjs
 *
 * 왜 자기호스팅인가.
 * 브라우저 내장 음성 인식(Web Speech API)이 막힌 이유가 바로 **외부 서버 의존**이었다.
 * 크롬은 오디오를 구글 서버로 보내 처리하는데, 그 경로가 막히면 코드로는 방법이 없다.
 * 그 문제를 풀겠다면서 모델을 huggingface.co에서 실시간으로 받아 오면 같은 실수다.
 * 부스에서 네트워크가 어떨지 모르는 채로 데모를 열 수는 없다.
 *
 * 그래서 빌드 시점에 받아 public/ 아래로 복사하고, 런타임에는 우리 도메인만 본다.
 * 받아 둔 파일은 커밋하지 않는다(.gitignore) — vendor-webgazer와 같은 방식이다.
 */
import { mkdir, writeFile, stat, readdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * 모델 선택.
 *
 * tiny는 한국어가 거의 안 되고, small 이상은 200MB를 넘어 첫 로딩이 부스에서 감당되지 않는다.
 * base가 "짧은 한국어 문장을 알아듣는" 최소선이다.
 */
const REPO = process.env.WHISPER_REPO ?? 'Xenova/whisper-base';
const OUT = 'public/models/whisper-base';
const WASM_OUT = 'public/vendor/transformers';

/** transformers.js가 로컬 모델을 읽을 때 찾는 파일들 */
const CONFIG_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
];

/** 양자화(q8) 가중치만 받는다. fp32까지 받으면 300MB가 넘는다. */
const ONNX_FILES = [
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

const base = `https://huggingface.co/${REPO}/resolve/main`;

async function exists(p) {
  try {
    const s = await stat(p);
    return s.size > 0;
  } catch {
    return false;
  }
}

async function fetchTo(rel) {
  const out = join(OUT, rel);
  if (await exists(out)) {
    process.stdout.write(`  = ${rel}\n`);
    return;
  }
  const res = await fetch(`${base}/${rel}`);
  if (!res.ok) throw new Error(`${rel} — HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  process.stdout.write(`  + ${rel} (${(buf.length / 1e6).toFixed(1)}MB)\n`);
}

/** onnxruntime-web의 wasm 바이너리도 우리 도메인에서 준다 (기본값은 CDN이다) */
async function copyWasm() {
  const src = 'node_modules/@huggingface/transformers/dist';
  let files;
  try {
    files = await readdir(src);
  } catch {
    console.log('  ! transformers dist를 찾지 못했습니다 — wasm은 건너뜁니다');
    return;
  }
  await mkdir(WASM_OUT, { recursive: true });
  let n = 0;
  for (const f of files) {
    if (!f.endsWith('.wasm') && !f.endsWith('.mjs')) continue;
    const to = join(WASM_OUT, f);
    if (await exists(to)) continue;
    await copyFile(join(src, f), to);
    n += 1;
  }
  console.log(`  + wasm/mjs ${n}개`);
}

console.log(`whisper 벤더링: ${REPO}`);
try {
  for (const f of CONFIG_FILES) await fetchTo(f);
  for (const f of ONNX_FILES) await fetchTo(f);
  await copyWasm();
  console.log('완료 —', OUT);
} catch (e) {
  /*
    받지 못해도 빌드를 멈추지 않는다.
    음성 인식은 이 체험의 부가 기능이고, 없으면 타이핑으로 진행된다.
    "데모가 외부 의존에 인질로 잡히면 안 된다"는 원칙이 여기에도 그대로 적용된다.
  */
  console.log(`! 벤더링 실패 (${e.message}) — 음성 인식 없이 진행됩니다`);
}
