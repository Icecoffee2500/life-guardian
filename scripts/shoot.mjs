/**
 * 스크린샷 하네스 — 디자인을 눈으로 검토하기 위한 개발 전용 도구.
 *
 *   node scripts/shoot.mjs <out-dir> [--url http://localhost:3000] [--mobile]
 *
 * 압축 모드로 실제 체험을 처음부터 끝까지 통과하면서 씬마다 결정적인 순간을 찍는다.
 * 대기는 시간이 아니라 씬 상태(main[data-scene])로 동기화한다 —
 * 시간으로 맞추면 씬 길이를 조금만 바꿔도 엉뚱한 화면을 찍는다.
 *
 * 시선 씬에서는 포인터를 움직이고 그림 씬에서는 실제로 획을 긋는다.
 * 입력이 없으면 화면이 비어 보여서 무엇이 잘못됐는지 알 수 없다.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const out = process.argv[2] ?? './shots';
const base = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:3000';
const mobile = process.argv.includes('--mobile');

const viewport = mobile ? { width: 430, height: 932 } : { width: 1440, height: 900 };

await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
});
const page = await browser.newPage({ viewport, deviceScaleFactor: 2, colorScheme: 'dark' });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

let n = 0;
const shot = async (name) => {
  const id = String(++n).padStart(2, '0');
  await page.screenshot({ path: `${out}/${id}-${name}.png` });
  process.stdout.write(`  ${id}-${name}.png\n`);
};
const wait = (ms) => page.waitForTimeout(ms);
const scene = () => page.locator('main[data-scene]').getAttribute('data-scene');
/** 해당 씬에 들어올 때까지 기다린다 */
const until = async (id, timeout = 90000) => {
  await page.waitForFunction(
    (want) => document.querySelector('main[data-scene]')?.dataset.scene === want,
    id,
    { timeout },
  );
};

await page.goto(`${base}/experience`, { waitUntil: 'networkidle' });
await wait(2400);
await shot('S0-intro');

await page.getByText(/압축 체험/).click();
await wait(400);
await page.getByRole('button', { name: '시작하기' }).click();

// S1 — 연결
await until('S1');
await wait(1200);
await shot('S1-connecting');
await wait(2600);
await shot('S1-connected');

// S2 — 호흡 가이드
await until('S2');
await wait(2800);
await shot('S2-breathing');
await wait(8000);
await shot('S2-late');

// S3 — 이완
await until('S3');
await wait(2500);
await shot('S3-calm');
await wait(6000);
await shot('S3-reveal');

// S4 — 시선
await until('S4');
await wait(1900); // 선행 응시점 1초를 지나 첫 노출로
await page.mouse.move(420, 460);
await wait(500);
await shot('S4-exposure');
await wait(2200);
await shot('S4-fixation');
for (let i = 0; i < 4; i++) {
  await page.mouse.move(i % 2 ? 380 : 1060, 420 + i * 14, { steps: 10 });
  await wait(2100);
}
await shot('S4-late');

// S5 — 그림
await until('S5');
await wait(1000);
await shot('S5-empty');
const canvas = await page.locator('canvas').last().boundingBox();
if (canvas) {
  const cx = canvas.x + canvas.width / 2;
  const by = canvas.y + canvas.height * 0.86;
  await page.mouse.move(cx - 14, by);
  await page.mouse.down();
  await page.mouse.move(cx - 10, by - 130, { steps: 16 });
  await page.mouse.up();
  await page.mouse.move(cx + 14, by);
  await page.mouse.down();
  await page.mouse.move(cx + 10, by - 130, { steps: 16 });
  await page.mouse.up();
  await page.mouse.move(cx - 68, by - 150);
  await page.mouse.down();
  for (let a = 0; a <= 26; a++) {
    const th = Math.PI + (a / 26) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(th) * 68, by - 190 + Math.sin(th) * 50, { steps: 2 });
  }
  await page.mouse.up();
}
await wait(500);
await shot('S5-drawn');
await page.getByRole('button', { name: '다 그렸어요' }).click();
await wait(1400);
await shot('S5-future');

// S6 — 대화
await until('S6');
await wait(1400);
await shot('S6-reading');
await wait(4500);
await shot('S6-answering');
await page.keyboard.press('ArrowRight');

// S7 / S8 — 아직 플레이스홀더
await until('S7');
await wait(1400);
await shot('S7');
await page.keyboard.press('ArrowRight');
await until('S8');
await wait(1400);
await shot('S8');

console.log('\n마지막 씬:', await scene());
await browser.close();

if (errors.length) {
  console.log('\n콘솔 오류:');
  for (const e of [...new Set(errors)].slice(0, 20)) console.log('  -', e);
  process.exitCode = 1;
} else {
  console.log('\n콘솔 오류 없음');
}
