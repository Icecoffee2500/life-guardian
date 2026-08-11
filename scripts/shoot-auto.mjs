/**
 * 가상 참가자(auto) 모드로 전체 플로우가 스스로 완주하는지 확인한다.
 * M1 완료 기준: "가상 참가자로 Phase 1→4 전체 플로우가 자동 진행됨"
 * 사람의 입력은 시작 버튼 한 번뿐이다.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const out = process.argv[2] ?? './shots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const errors = [];
const op = await ctx.newPage();
const exp = await ctx.newPage();
for (const p of [exp, op]) {
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
}

// 진행자 화면에서 '자동' 모드로 바꾼다 (명령 채널 경유)
await op.goto('http://localhost:3000/operator', { waitUntil: 'networkidle' });
await exp.goto('http://localhost:3000/experience', { waitUntil: 'networkidle' });
await op.bringToFront();
await op.getByRole('button', { name: /자동/ }).click();
await op.waitForTimeout(600);

await exp.bringToFront();
await exp.waitForTimeout(1500);
await exp.getByText(/압축 체험/).click();
await exp.getByRole('button', { name: '시작하기' }).click();

const until = (id, timeout) =>
  exp.waitForFunction((w) => document.querySelector('main[data-scene]')?.dataset.scene === w, id, { timeout });

const seen = [];
for (const s of ['S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']) {
  await until(s, 200000);
  seen.push(s);
  if (s === 'S5') {
    await exp.waitForTimeout(9000);
    await exp.screenshot({ path: `${out}/AUTO-S5-draw.png` });
  }
  if (s === 'S6') {
    await exp.waitForTimeout(7000);
    await exp.screenshot({ path: `${out}/AUTO-S6-speak.png` });
  }
}
await exp.waitForTimeout(3000);
await exp.screenshot({ path: `${out}/AUTO-S8-result.png`, fullPage: true });

// 자동 모드가 실제로 데이터를 남겼는지 확인
const rec = await exp.evaluate(() => {
  const ids = JSON.parse(localStorage.getItem('lg:sessions') ?? '[]');
  const r = ids[0] ? JSON.parse(localStorage.getItem('lg:session:' + ids[0]) ?? 'null') : null;
  if (!r) return null;
  return {
    session: r.session_id,
    gazeAxes: r.input.gaze.riasec ? Object.keys(r.input.gaze.riasec).length : 0,
    gazeQuality: r.input.gaze.quality,
    drawQuality: r.input.drawing.quality,
    drawStrokes: r.input.drawing.observations?.세부요소 ?? null,
    dialogueTurns: r.input.dialogue.length,
    withTranscript: r.input.dialogue.filter((d) => d.transcript.length > 0).length,
    persona: r.receipt.persona_name,
  };
});

console.log(JSON.stringify({ seen, rec }, null, 2));
console.log(errors.length ? errors.slice(0, 6).join('\n') : '콘솔 오류 없음');
await browser.close();
