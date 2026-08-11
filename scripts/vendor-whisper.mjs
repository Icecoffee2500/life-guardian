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

/**
 * onnxruntime-web의 wasm 바이너리도 우리 도메인에서 준다 (기본값은 CDN이다).
 *
 * **바이너리는 @huggingface/transformers/dist가 아니라 onnxruntime-web/dist에 있다.**
 * transformers 쪽에는 로더 .mjs만 들어 있어서, 거기만 복사해 두고
 * wasmPaths를 우리 경로로 돌리면 .wasm을 찾지 못해 런타임이 아예 초기화되지 않는다.
 * (실제로 그렇게 짰다가 여기서 잡았다.)
 */
const WASM_SRC_DIRS = [
  'node_modules/onnxruntime-web/dist',
  'node_modules/@huggingface/transformers/dist',
];

async function copyWasm() {
  await mkdir(WASM_OUT, { recursive: true });
  let n = 0;
  let wasm = 0;

  for (const src of WASM_SRC_DIRS) {
    let files;
    try {
      files = await readdir(src);
    } catch {
      continue;
    }
    for (const f of files) {
      // 로더(.mjs)와 바이너리(.wasm)가 같은 폴더에 나란히 있어야 서로를 찾는다
      if (!f.endsWith('.wasm') && !f.endsWith('.mjs')) continue;
      /*
        onnxruntime-web/dist를 통째로 복사하면 92MB가 된다.
        실제로 쓰는 건 transformers.js가 고르는 두 갈래뿐이다
        (backends/onnx.js의 기본 wasmPaths와 같은 선택):
          asyncify — Safari가 아닌 모든 브라우저
          (접미사 없음) — Safari
        jsep·jspi 변형과 ort.* 번들(라이브러리 본체, npm으로 이미 들어온다)은 뺀다.
        여기 목록이 whisper.worker.ts의 wasmPaths와 어긋나면 런타임이 404를 만난다.
      */
      if (!/^ort-wasm-simd-threaded(\.asyncify)?\.(wasm|mjs)$/.test(f)) continue;
      const to = join(WASM_OUT, f);
      // 이미 있으면 다시 복사하지 않되, **집계에는 넣는다.**
      // 복사한 개수만 세면 두 번째 빌드부터 0이 되어 멀쩡한 상태를 실패로 보고한다.
      if (!(await exists(to))) {
        await copyFile(join(src, f), to);
        n += 1;
      }
      if (f.endsWith('.wasm')) wasm += 1;
    }
  }

  if (wasm === 0) {
    // 여기서 조용히 넘어가면 브라우저에서만 터진다. 빌드 로그에 남긴다.
    console.log('  ! .wasm 바이너리를 찾지 못했습니다 — 음성 인식이 동작하지 않습니다');
    return;
  }
  console.log(`  = wasm ${wasm}개 준비됨 (이번에 복사 ${n}개)`);
}

console.log(`whisper 벤더링: ${REPO}`);

/*
  둘은 서로 독립이다.
  wasm 복사는 node_modules에서 하는 로컬 작업이고, 모델 내려받기는 네트워크를 탄다.
  한 try 안에 묶어 두면 모델을 못 받았을 때 wasm까지 통째로 건너뛴다 —
  네트워크가 되는 환경에서 런타임 폴백(허깅페이스 직접 로드)으로 살아날 수 있었던
  경우까지 같이 죽는다.
*/
try {
  await copyWasm();
} catch (e) {
  console.log(`! wasm 복사 실패 (${e.message})`);
}

try {
  for (const f of CONFIG_FILES) await fetchTo(f);
  for (const f of ONNX_FILES) await fetchTo(f);
  console.log('완료 —', OUT);
} catch (e) {
  /*
    받지 못해도 빌드를 멈추지 않는다.
    음성 인식은 이 체험의 부가 기능이고, 없으면 타이핑으로 진행된다.
    런타임은 로컬에서 모델을 못 찾으면 허깅페이스로 폴백한다.
  */
  console.log(`! 모델 내려받기 실패 (${e.message}) — 런타임에서 원격으로 시도합니다`);
}
