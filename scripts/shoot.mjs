/**
 * 스크린샷 하네스 — 디자인을 눈으로 검토하기 위한 개발 전용 도구.
 *
 *   node scripts/shoot.mjs <out-dir> [--url http://localhost:3000] [--mobile]
 *
 * 씬을 순서대로 밟으며 각 화면을 찍는다.
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

const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  process.stdout.write(`  ${name}.png\n`);
};

const wait = (ms) => page.waitForTimeout(ms);

await page.goto(`${base}/experience`, { waitUntil: 'networkidle' });
await wait(2200);
await shot('01-S0-intro');

// 3분 압축 모드로 전체 플로우를 빠르게 통과
await page.getByText(/압축 체험/).click();
await wait(400);
await page.getByRole('button', { name: '시작하기' }).click();

await wait(1400);
await shot('02-S1-connecting');
await wait(2000);
await shot('03-S1-connected');

const scenes = ['04-S2', '05-S3', '06-S4', '07-S5', '08-S6', '09-S7', '10-S8'];
for (const s of scenes) {
  await page.waitForTimeout(1500);
  await shot(s);
  // 다음 씬으로 강제 이동 (진행자 단축키)
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
}

await browser.close();

if (errors.length) {
  console.log('\n콘솔 오류:');
  for (const e of [...new Set(errors)].slice(0, 20)) console.log('  -', e);
  process.exitCode = 1;
} else {
  console.log('\n콘솔 오류 없음');
}
