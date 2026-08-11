import { NextResponse } from 'next/server';
import {
  INTERPRET_MODEL,
  INTERPRET_TEMPERATURE,
  anthropic,
  extractJson,
  hasApiKey,
} from '@/lib/interpret/client';
import { INTERPRET_OUTPUT_SPEC, INTERPRET_SYSTEM_PROMPT } from '@/lib/interpret/prompt';
import { ruleBasedReceipt } from '@/lib/interpret/fallback';
import { BioReceiptSchema } from '@/lib/interpret/schema';
import type { LlmInput } from '@/lib/features/schema';

export const runtime = 'nodejs';
/** 부록 C: 스키마 검증 실패 시 1회 재호출 */
const MAX_ATTEMPTS = 2;

export interface InterpretResponse {
  receipt: unknown;
  /** 규칙 기반 폴백으로 만들어졌는가 */
  fallback: boolean;
  /** 폴백으로 내려간 이유 (진행자 화면에만 표시) */
  reason?: string;
}

function fallbackResponse(input: LlmInput, reason: string): NextResponse {
  const receipt = ruleBasedReceipt(input);
  // 폴백도 같은 스키마를 지켜야 한다. 어기면 그건 우리 버그다.
  const parsed = BioReceiptSchema.safeParse(receipt);
  return NextResponse.json({
    receipt: parsed.success ? parsed.data : receipt,
    fallback: true,
    reason,
  } satisfies InterpretResponse);
}

export async function POST(req: Request) {
  let input: LlmInput;
  try {
    input = (await req.json()) as LlmInput;
  } catch {
    return NextResponse.json({ error: '입력 JSON을 읽지 못했습니다' }, { status: 400 });
  }
  if (!input || typeof input !== 'object' || !input.session_id) {
    return NextResponse.json({ error: 'session_id가 없습니다' }, { status: 400 });
  }

  const client = anthropic();
  if (!client || !hasApiKey()) {
    return fallbackResponse(input, 'ANTHROPIC_API_KEY 없음');
  }

  const userContent = `${INTERPRET_OUTPUT_SPEC}\n\n[입력]\n${JSON.stringify(input, null, 2)}`;
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await client.messages.create({
        model: INTERPRET_MODEL,
        max_tokens: 2400,
        temperature: INTERPRET_TEMPERATURE,
        system: INTERPRET_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userContent },
          // 부록 C 호출 파라미터: 출력 강제를 위해 '{' 로 prefill
          { role: 'assistant', content: '{' },
        ],
      });

      const text = res.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim();

      const parsed = BioReceiptSchema.safeParse(extractJson(text, '{'));
      if (parsed.success) {
        return NextResponse.json({
          receipt: parsed.data,
          fallback: false,
        } satisfies InterpretResponse);
      }
      lastError = `스키마 불일치: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .join(', ')}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  // 2회 실패 → 규칙 기반 템플릿. 부스에서 빈 영수증이 나오는 상황을 막는다.
  return fallbackResponse(input, lastError || '해석 호출 실패');
}
