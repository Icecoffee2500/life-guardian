/** 두 창(체험 + 진행자)이 실제로 동기화되는지 확인한다. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const out = process.argv[2] ?? './shots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
});
// 같은 컨텍스트여야 BroadcastChannel이 통한다 (같은 기기 두 창 시나리오)
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const errors = [];
const exp = await ctx.newPage();
const op = await ctx.newPage();
for (const p of [exp, op]) {
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
}

await exp.goto('http://localhost:3000/experience', { waitUntil: 'networkidle' });
await op.goto('http://localhost:3000/operator', { waitUntil: 'networkidle' });

await exp.waitForTimeout(2200);
await exp.getByText(/압축 체험/).click();
await exp.getByRole('button', { name: '시작하기' }).click();
await exp.waitForTimeout(6000);

await op.bringToFront();
await op.waitForTimeout(1200);
await op.screenshot({ path: `${out}/OP1-live.png`, fullPage: true });
const linked = await op.locator('text=실황 연결됨').count();
const opScene = await op.locator('header span').first().textContent();

// 진행자 화면에서 '다음 씬 →'을 눌러 체험 창이 움직이는지 본다
const before = await exp.locator('main[data-scene]').getAttribute('data-scene');
await op.getByRole('button', { name: '다음 씬 →' }).click();
await exp.waitForTimeout(900);
const after = await exp.locator('main[data-scene]').getAttribute('data-scene');

// 일시정지 명령
await op.getByRole('button', { name: '일시정지' }).click();
await exp.waitForTimeout(700);
const status = await exp.locator('main[data-scene]').getAttribute('data-status');

await op.waitForTimeout(1200);
await op.screenshot({ path: `${out}/OP2-after-command.png`, fullPage: true });

console.log(JSON.stringify({ linked, opScene: opScene?.trim(), before, after, status }, null, 2));
console.log(errors.length ? errors.slice(0, 5).join('\n') : '콘솔 오류 없음');
await browser.close();
