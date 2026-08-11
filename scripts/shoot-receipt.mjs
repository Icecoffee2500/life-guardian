/** 체험을 압축 모드로 완주한 뒤, 저장된 영수증 페이지를 찍는다. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const out = process.argv[2] ?? './shots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const until = (id, timeout = 120000) =>
  page.waitForFunction((w) => document.querySelector('main[data-scene]')?.dataset.scene === w, id, { timeout });

await page.goto('http://localhost:3000/experience', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.getByText(/압축 체험/).click();
await page.getByRole('button', { name: '시작하기' }).click();

// 시선 씬에서 포인터를 좌우로 움직여 실제 데이터를 만든다
await until('S4');
for (let i = 0; i < 7; i++) {
  await page.mouse.move(i % 2 ? 380 : 1060, 430 + i * 10, { steps: 8 });
  await page.waitForTimeout(1800);
}
// 그림 한 줄
await until('S5');
await page.waitForTimeout(900);
const c = await page.locator('canvas').last().boundingBox();
if (c) {
  await page.mouse.move(c.x + c.width / 2, c.y + c.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height * 0.35, { steps: 20 });
  await page.mouse.up();
}
await page.getByRole('button', { name: '다 그렸어요' }).click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: '다 그렸어요' }).click();

await until('S6');
await page.keyboard.press('ArrowRight');
await until('S8', 180000);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/R0-S8.png`, fullPage: true });

const sid = await page.locator('main[data-scene] .tnum').last().textContent();
await page.getByRole('link', { name: '영수증 받기' }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/R1-receipt.png`, fullPage: true });
console.log('session:', sid, '\n', errors.length ? errors.slice(0, 5).join('\n') : '콘솔 오류 없음');
await browser.close();
