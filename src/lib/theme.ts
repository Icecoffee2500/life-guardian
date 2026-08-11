'use client';

/**
 * 캔버스용 색 — 테마 토큰을 그대로 읽어 온다.
 *
 * canvas는 CSS 변수를 못 쓴다. 그래서 파형·시선 커서·타임라인이 각자
 * `rgba(217,66,21,...)` 같은 숫자를 박아 두고 있었는데, 팔레트를 한 번 바꾸자
 * 그 숫자들만 옛 색으로 남아 밝은 바탕에 흰 선을 긋는 화면이 나왔다.
 * (실제로 시선 씬의 응시점과 리플레이 눈금이 그렇게 보이지 않게 되어 있었다.)
 *
 * 이제 globals.css의 `--color-*` 하나만 고치면 캔버스까지 따라온다.
 */

const cache = new Map<string, string>();

function hexToRgb(hex: string): string | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/**
 * `--color-hr` → `"160, 56, 28"`.
 * rgba() 문자열 안에 그대로 끼워 넣기 위한 형태다.
 *
 * 값을 못 읽으면 fallback을 돌려준다 — 색 하나 때문에 캔버스가 죽으면 안 된다.
 */
export function tokenRgb(name: string, fallback = '22, 22, 21'): string {
  const hit = cache.get(name);
  if (hit) return hit;
  if (typeof window === 'undefined') return fallback;

  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const rgb = hexToRgb(raw) ?? (raw.trim() ? null : null);
  const out = rgb ?? fallback;
  if (rgb) cache.set(name, rgb);
  return out;
}

export const rgbHr = () => tokenRgb('--color-hr', '160, 56, 28');
export const rgbGsr = () => tokenRgb('--color-gsr', '31, 90, 85');
export const rgbHrv = () => tokenRgb('--color-hrv', '74, 92, 44');
export const rgbInk = () => tokenRgb('--color-ink', '22, 22, 21');
export const rgbInk3 = () => tokenRgb('--color-ink-3', '106, 106, 104');
