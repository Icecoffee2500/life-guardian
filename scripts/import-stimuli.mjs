/**
 * 시선 자극 이미지 반입 + 검수.
 *
 *   node scripts/import-stimuli.mjs [입력폴더=images]
 *
 * 하는 일
 *  1. `1L` `1R` … `12L` `12R` 24장을 찾아 규격(4:3, 1600×1200, JPEG)으로 맞춰
 *     public/stimuli/01a.jpg … 12b.jpg 로 넣는다
 *  2. 쌍마다 평균 휘도·RMS 대비·에지 밀도를 재서 합격/불합격을 찍는다
 *
 * 2번이 이 스크립트의 존재 이유다.
 * 시선 측정에서 가장 흔한 실패는 "선호를 쟀다고 믿었는데 밝기를 쟀던" 경우다.
 * 사람 눈은 선호보다 먼저 밝기·대비·복잡도에 끌린다. 한쪽이 눈에 띄게 밝으면
 * 그 쌍에서 나온 "오래 봤다"는 성향이 아니라 광학이다.
 * 24장을 눈으로 비교해서는 5% 차이를 잡을 수 없어서 숫자로 잰다. (부록 A 체크리스트)
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const SRC_DIR = process.argv[2] ?? 'images';
const OUT_DIR = 'public/stimuli';

/** 출력 규격 — 앱이 aspect-[4/3]로 렌더한다 */
const W = 1600;
const H = 1200;
const QUALITY = 85;

/** 부록 A 검수 임계값 — 쌍 안에서의 상대 차이 */
const TOL = {
  luminance: 0.05, // 평균 휘도 5%
  contrast: 0.1, // RMS 대비 10%
  edges: 0.2, // 에지 밀도 20%
};

/** `1L` `01l.png` `1-L.jpg` 같은 변형을 모두 받아준다 */
function parseName(file) {
  const stem = basename(file, extname(file));
  const m = stem.match(/^0?(\d{1,2})\s*[-_ ]?\s*([LRlrAaBb])$/);
  if (!m) return null;
  const id = Number(m[1]);
  if (id < 1 || id > 12) return null;
  // L(왼쪽)·A → a, R(오른쪽)·B → b
  const side = /[LlAa]/.test(m[2]) ? 'a' : 'b';
  return { id, side };
}

/** 0~1 그레이스케일 표본에서 평균 휘도와 RMS 대비 */
function stats(gray) {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;
  let acc = 0;
  for (let i = 0; i < gray.length; i++) {
    const d = gray[i] - mean;
    acc += d * d;
  }
  return { mean, rms: Math.sqrt(acc / gray.length) };
}

/**
 * 에지 밀도 = 복잡도의 대용치.
 * Sobel 응답의 평균을 쓴다. 잔무늬가 많을수록 커지고, 그런 이미지는 탐색 시간이 길어진다.
 */
function edgeDensity(gray, w, h) {
  let acc = 0;
  let n = 0;
  const at = (x, y) => gray[y * w + x];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      acc += Math.hypot(gx, gy);
      n += 1;
    }
  }
  return acc / Math.max(1, n);
}

/** 상대 차이 — 두 값 중 큰 쪽 기준 */
const rel = (a, b) => (Math.max(a, b) === 0 ? 0 : Math.abs(a - b) / Math.max(a, b));

async function measure(path) {
  // 재는 건 축소본으로 충분하다. 원본 크기로 Sobel을 돌리면 느리기만 하다.
  const { data, info } = await sharp(path)
    .greyscale()
    .resize(320, 240, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const gray = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) gray[i] = data[i] / 255;
  const { mean, rms } = stats(gray);
  return { luminance: mean, contrast: rms, edges: edgeDensity(gray, info.width, info.height) };
}

// ── 1) 입력 모으기 ───────────────────────────────────────────
let files;
try {
  files = await readdir(SRC_DIR);
} catch {
  console.error(`입력 폴더를 찾지 못했습니다: ${SRC_DIR}/`);
  console.error('이미지를 저장소에 커밋·푸시했는지 확인하세요.');
  process.exit(1);
}

const found = new Map();
const ignored = [];
for (const f of files) {
  if (!/\.(png|jpe?g|webp|avif)$/i.test(f)) continue;
  const p = parseName(f);
  if (!p) {
    ignored.push(f);
    continue;
  }
  found.set(`${p.id}${p.side}`, join(SRC_DIR, f));
}

if (ignored.length) {
  console.log(`이름 규칙에 안 맞아 건너뜀: ${ignored.join(', ')}`);
}

const missing = [];
for (let id = 1; id <= 12; id++) {
  for (const side of ['a', 'b']) {
    if (!found.has(`${id}${side}`)) missing.push(`${id}${side === 'a' ? 'L' : 'R'}`);
  }
}
if (missing.length) {
  console.error(`\n빠진 이미지 ${missing.length}장: ${missing.join(', ')}`);
  process.exit(1);
}

// ── 2) 규격 맞춰 반입 ────────────────────────────────────────
await mkdir(OUT_DIR, { recursive: true });
console.log(`\n반입 → ${OUT_DIR}/`);
for (let id = 1; id <= 12; id++) {
  for (const side of ['a', 'b']) {
    const src = found.get(`${id}${side}`);
    const out = join(OUT_DIR, `${String(id).padStart(2, '0')}${side}.jpg`);
    await sharp(src)
      // 비율이 다르면 가운데를 기준으로 잘라 4:3을 맞춘다.
      // 늘리면(fill) 사물이 왜곡되고, 여백을 넣으면(contain) 그 여백이 밝기를 바꾼다.
      .resize(W, H, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: QUALITY, chromaSubsampling: '4:4:4' })
      .withMetadata({ density: 72 })
      .toFile(out);
  }
  process.stdout.write(`  ${String(id).padStart(2, '0')}a.jpg  ${String(id).padStart(2, '0')}b.jpg\n`);
}

// ── 3) 쌍별 검수 ─────────────────────────────────────────────
console.log('\n쌍별 저수준 특성 (부록 A 통제 조건)');
console.log('  쌍   휘도차   대비차   에지차   판정');

const rows = [];
let failed = 0;
for (let id = 1; id <= 12; id++) {
  const pad = String(id).padStart(2, '0');
  const A = await measure(join(OUT_DIR, `${pad}a.jpg`));
  const B = await measure(join(OUT_DIR, `${pad}b.jpg`));

  const d = {
    luminance: rel(A.luminance, B.luminance),
    contrast: rel(A.contrast, B.contrast),
    edges: rel(A.edges, B.edges),
  };
  const bad = Object.keys(TOL).filter((k) => d[k] > TOL[k]);
  if (bad.length) failed += 1;

  const pct = (v) => `${(v * 100).toFixed(1)}%`.padStart(6);
  const mark = (k) => (d[k] > TOL[k] ? '!' : ' ');
  console.log(
    `  ${pad}  ${pct(d.luminance)}${mark('luminance')} ${pct(d.contrast)}${mark('contrast')} ` +
      `${pct(d.edges)}${mark('edges')}   ${bad.length ? `다시 만들 것 (${bad.join(', ')})` : '합격'}`,
  );
  rows.push({ pair: id, a: A, b: B, diff: d, pass: bad.length === 0, failing: bad });
}

await writeFile(join(OUT_DIR, 'measurements.json'), JSON.stringify(rows, null, 2));

console.log(`\n합격 ${12 - failed}쌍 / 불합격 ${failed}쌍`);
if (failed) {
  console.log(
    '불합격 쌍은 두 장의 밝기·대비·복잡도가 서로 달라, 시선이 성향이 아니라\n' +
      '그 차이를 따라갈 수 있습니다. 자극이미지_프롬프트.md의 쌍별 주의사항을 보고\n' +
      '해당 쌍만 다시 생성하세요.',
  );
}
console.log('\n측정값 상세: public/stimuli/measurements.json');
console.log('얼굴 유무는 자동으로 재지 않습니다 — 24장을 눈으로 한 번 확인하세요.');
