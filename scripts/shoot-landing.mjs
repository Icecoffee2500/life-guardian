import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/L1-hero.png` });
await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 1.15 }));
await page.waitForTimeout(1600);
await page.screenshot({ path: `${out}/L2-problem.png` });
await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 2.6 }));
await page.waitForTimeout(1600);
await page.screenshot({ path: `${out}/L3-flow.png` });
await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
await page.waitForTimeout(1600);
await page.screenshot({ path: `${out}/L4-close.png` });
await browser.close();
console.log(errors.length ? errors.slice(0,5).join('\n') : '콘솔 오류 없음');
