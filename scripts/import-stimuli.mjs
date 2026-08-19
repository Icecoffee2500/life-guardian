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

const SRC_DIR = process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]) ?? 'images';
const OUT_DIR = 'public/stimuli';
/** 쌍 안에서 휘도·대비를 서로 맞출 것인가. --raw 로 끌 수 있다(원본 비교용). */
const NORMALIZE = !process.argv.includes('--raw');

/** 출력 규격 — 앱이 aspect-[4/3]로 렌더한다. W는 상한이고, 원본이 작으면 그쪽에 맞춘다. */
const W = 1600;
const QUALITY = 85;

/**
 * 부록 A 검수 임계값 — 쌍 안에서의 상대 차이.
 *
 * 휘도·대비는 **통과해야 하는 조건**이다. 시각 심리물리에서 표준으로 통제하는
 * 두 가지이고, 아래 정규화로 만들어낼 수 있다.
 *
 * 에지 밀도(복잡도)는 **주의 항목**이다. 서로 다른 장면을 찍은 두 사진은
 * 복잡도가 어차피 다르고, 그걸 억지로 맞추려면 내용을 손대야 한다.
 * 다시 생성해도 안정적으로 좁혀지지 않으므로 불합격으로 처리하지 않고 기록만 한다.
 */
const TOL = {
  luminance: 0.05, // 평균 휘도 5% — 필수
  contrast: 0.1, // RMS 대비 10% — 필수
  edges: 0.2, // 에지 밀도 20% — 주의
};
const HARD = ['luminance', 'contrast'];

/**
 * 복잡도 차이가 **측정 대상 그 자체**인 쌍.
 *  3번: 물감 널린 작업실 vs 정돈된 사무 화면 (표현 ↔ 체계)
 * 12번: 어수선한 책상 vs 정돈된 책상 (무질서 회피)
 * 여기서 복잡도를 맞추면 재려던 신호가 사라진다. 주의 표시조차 하지 않는다.
 */
const COMPLEXITY_IS_SIGNAL = new Set([3, 12]);

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

/*
  출력 크기는 **24장 전체에서 가장 작은 원본**에 맞춘다.
  한 장이라도 작으면 그 장만 확대되어 흐려지고, 쌍 안에서 선명도가 달라진다.
  선명한 쪽이 더 오래 붙잡으므로 그것도 저수준 편향이다.
*/
let minW = W;
for (const path of found.values()) {
  const meta = await sharp(path).metadata();
  if (meta.width) minW = Math.min(minW, meta.width);
}
const outW = Math.round(minW / 4) * 4;
const outH = Math.round((outW * 3) / 4);
console.log(`\n출력 크기: ${outW}×${outH} (원본 최소 폭 ${minW}px, 확대하지 않음)`);

/**
 * 자르고 크기를 맞춘 중간 버퍼.
 *
 * 비율이 다르면 가운데를 기준으로 자른다. 늘리면(fill) 사물이 왜곡되고,
 * 여백을 넣으면(contain) 그 여백이 밝기를 바꿔 쌍의 휘도 비교가 망가진다.
 */
const framed = (src) =>
  sharp(src).resize(outW, outH, { fit: 'cover', position: 'centre' }).png().toBuffer();

/** 버퍼에서 바로 재는 판(파일 저장 전에 재야 정규화를 계산할 수 있다) */
async function measureBuffer(buf) {
  const { data, info } = await sharp(buf)
    .greyscale()
    .resize(320, 240, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const gray = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) gray[i] = data[i] / 255;
  const { mean, rms } = stats(gray);
  return { luminance: mean, contrast: rms, edges: edgeDensity(gray, info.width, info.height) };
}

/*
  휘도·대비 정규화.

  생성된 사진은 내용이 다르면 밝기도 다르다. 어두운 작업장 클로즈업과 밝은 교실
  원경을 나란히 놓으면 휘도가 30% 넘게 벌어지고, 그 쌍에서 나온 "오래 봤다"는
  성향이 아니라 밝기다.

  그래서 다시 생성하는 대신 **쌍 안에서 서로에게 맞춘다.** 심리물리 실험에서
  자극을 다루는 표준 절차이기도 하다 — 두 장의 평균 휘도와 RMS 대비를
  둘의 중간값으로 끌어온다. 한쪽만 고치지 않고 양쪽을 반씩 움직여서
  원본에서 벗어나는 정도를 최소로 한다.

  변환은 픽셀값에 대한 1차식이다:  out = a·in + b
    a = 목표대비 / 현재대비   (기울기 = 대비)
    b = 목표휘도 − a·현재휘도 (절편 = 밝기)

  값이 0~255를 넘으면 잘리므로, 한 번 적용한 뒤 다시 재서 남은 오차를 한 번 더 좁힌다.
*/
async function normalizePair(bufA, bufB) {
  let A = await measureBuffer(bufA);
  let B = await measureBuffer(bufB);
  const targetL = (A.luminance + B.luminance) / 2;
  const targetC = (A.contrast + B.contrast) / 2;

  const fit = async (buf, m) => {
    const a = m.contrast > 1e-6 ? targetC / m.contrast : 1;
    const b = (targetL - a * m.luminance) * 255;
    return sharp(buf).linear(a, b).png().toBuffer();
  };

  let outA = await fit(bufA, A);
  let outB = await fit(bufB, B);

  // 클리핑 때문에 한 번에 맞지 않는다. 남은 오차를 한 번 더 좁힌다.
  A = await measureBuffer(outA);
  B = await measureBuffer(outB);
  outA = await fit(outA, A);
  outB = await fit(outB, B);

  return [outA, outB];
}

console.log(`반입 → ${OUT_DIR}/`);
for (let id = 1; id <= 12; id++) {
  const pad = String(id).padStart(2, '0');
  const [rawA, rawB] = await Promise.all([
    framed(found.get(`${id}a`)),
    framed(found.get(`${id}b`)),
  ]);
  const [bufA, bufB] = NORMALIZE ? await normalizePair(rawA, rawB) : [rawA, rawB];

  for (const [side, buf] of [
    ['a', bufA],
    ['b', bufB],
  ]) {
    await sharp(buf)
      .jpeg({ quality: QUALITY, chromaSubsampling: '4:4:4' })
      .withMetadata({ density: 72 })
      .toFile(join(OUT_DIR, `${pad}${side}.jpg`));
  }
  process.stdout.write(`  ${pad}a.jpg  ${pad}b.jpg\n`);
}

// ── 3) 쌍별 검수 ─────────────────────────────────────────────
console.log('\n쌍별 저수준 특성 (부록 A 통제 조건)');
console.log('  쌍   휘도차   대비차   에지차   판정');

const rows = [];
let failed = 0;
let warned = 0;
for (let id = 1; id <= 12; id++) {
  const pad = String(id).padStart(2, '0');
  const A = await measure(join(OUT_DIR, `${pad}a.jpg`));
  const B = await measure(join(OUT_DIR, `${pad}b.jpg`));

  const d = {
    luminance: rel(A.luminance, B.luminance),
    contrast: rel(A.contrast, B.contrast),
    edges: rel(A.edges, B.edges),
  };
  const bad = HARD.filter((k) => d[k] > TOL[k]);
  const edgeWarn = !COMPLEXITY_IS_SIGNAL.has(id) && d.edges > TOL.edges;
  if (bad.length) failed += 1;
  if (edgeWarn) warned += 1;

  const pct = (v) => `${(v * 100).toFixed(1)}%`.padStart(6);
  const mark = (k, on) => (on ? '!' : ' ');
  const verdict = bad.length
    ? `다시 만들 것 (${bad.join(', ')})`
    : COMPLEXITY_IS_SIGNAL.has(id)
      ? '합격 (복잡도 차이는 측정 대상)'
      : edgeWarn
        ? '합격 · 복잡도 차이 주의'
        : '합격';
  console.log(
    `  ${pad}  ${pct(d.luminance)}${mark('luminance', d.luminance > TOL.luminance)} ` +
      `${pct(d.contrast)}${mark('contrast', d.contrast > TOL.contrast)} ` +
      `${pct(d.edges)}${mark('edges', edgeWarn)}   ${verdict}`,
  );
  rows.push({
    pair: id,
    a: A,
    b: B,
    diff: d,
    pass: bad.length === 0,
    failing: bad,
    edgeWarn,
    complexityIsSignal: COMPLEXITY_IS_SIGNAL.has(id),
  });
}

await writeFile(join(OUT_DIR, 'measurements.json'), JSON.stringify(rows, null, 2));

console.log(`\n휘도·대비 합격 ${12 - failed}쌍 / 불합격 ${failed}쌍`);
if (failed) {
  console.log(
    '불합격 쌍은 밝기나 대비가 서로 달라, 시선이 성향이 아니라 그 차이를\n' +
      '따라갈 수 있습니다. 자극이미지_프롬프트.md의 쌍별 주의사항을 보고\n' +
      '해당 쌍만 다시 생성하세요.',
  );
}
if (warned) {
  console.log(
    `\n복잡도 차이 20% 초과: ${warned}쌍 (주의).\n` +
      '서로 다른 장면을 찍은 사진은 복잡도가 어차피 다르고, 다시 생성해도\n' +
      '안정적으로 좁혀지지 않습니다. 해당 쌍의 결과는 "복잡한 쪽으로 시선이\n' +
      '더 갔을 수 있다"는 단서를 달고 읽으세요.',
  );
}
console.log('\n측정값 상세: public/stimuli/measurements.json');
console.log('얼굴 유무는 자동으로 재지 않습니다 — 24장을 눈으로 한 번 확인하세요.');
