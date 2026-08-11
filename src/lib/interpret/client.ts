import Anthropic from '@anthropic-ai/sdk';

/**
 * Anthropic 클라이언트 — 서버에서만 쓴다.
 *
 * 키가 없으면 null을 돌려준다. 던지지 않는다.
 * 이 프로젝트에서 키의 부재는 오류가 아니라 예상된 운영 상태다(CLAUDE.md).
 */

let cached: Anthropic | null | undefined;

export function anthropic(): Anthropic | null {
  if (cached !== undefined) return cached;
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  cached = key ? new Anthropic({ apiKey: key }) : null;
  return cached;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** 해석 — 품질 우선. 1인당 1회 호출이라 비용 부담이 낮다 (부록 C 호출 파라미터) */
export const INTERPRET_MODEL = 'claude-opus-5';
/** 정서가 선평정 — 짧고 기계적인 작업이라 저렴한 모델로 충분하다 */
export const VALENCE_MODEL = 'claude-haiku-4-5-20251001';

export const INTERPRET_TEMPERATURE = 0.4;

/**
 * 응답 텍스트에서 JSON 본문만 꺼낸다.
 *
 * prefill로 `{`를 넣기 때문에 정상 응답은 여는 중괄호가 없다.
 * 그래도 모델이 코드블록을 붙이는 경우가 드물게 있어 방어한다.
 */
export function extractJson(text: string, prefilled = ''): unknown {
  const raw = `${prefilled}${text}`.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  // 앞뒤에 설명이 붙은 경우 첫 { 부터 마지막 } 까지만 취한다
  const s = body.indexOf('{');
  const e = body.lastIndexOf('}');
  if (s === -1 || e === -1 || e <= s) throw new Error('JSON 본문을 찾지 못했습니다');
  return JSON.parse(body.slice(s, e + 1));
}
