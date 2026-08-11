import { NextResponse } from 'next/server';
import { VALENCE_MODEL, anthropic, extractJson, hasApiKey } from '@/lib/interpret/client';
import { VALENCE_SYSTEM_PROMPT, valenceUserPrompt } from '@/lib/interpret/prompt';
import { ValenceResponseSchema } from '@/lib/interpret/schema';
import { ruleBasedValence } from '@/lib/features/dialogue';

export const runtime = 'nodejs';

interface Turn {
  q: number;
  transcript: string;
}

/**
 * 발화 정서가 선평정.
 *
 * 부록 C: content_valence는 발화 텍스트만 보고 **별도 호출로 먼저** 평정한 뒤
 * 본 해석 프롬프트에 넣는다. 한 호출에서 동시에 시키지 않는다 —
 * 그러면 모델이 생체 지표를 보고 정서가를 거꾸로 맞춰버린다.
 *
 * 이 호출은 실패해도 조용히 규칙 기반으로 대체된다. 해석 전체를 막지 않는다.
 */
export async function POST(req: Request) {
  let turns: Turn[];
  try {
    const body = (await req.json()) as { turns?: Turn[] };
    turns = (body.turns ?? []).filter((t) => t && typeof t.transcript === 'string');
  } catch {
    return NextResponse.json({ error: '입력 JSON을 읽지 못했습니다' }, { status: 400 });
  }

  const withText = turns.filter((t) => t.transcript.trim().length > 0);
  const fallback = () =>
    NextResponse.json({
      ratings: withText.map((t) => ({ q: t.q, content_valence: ruleBasedValence(t.transcript) })),
      fallback: true,
    });

  const client = anthropic();
  if (!client || !hasApiKey() || withText.length === 0) return fallback();

  try {
    const res = await client.messages.create({
      model: VALENCE_MODEL,
      max_tokens: 600,
      temperature: 0,
      system: VALENCE_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: valenceUserPrompt(withText) },
        { role: 'assistant', content: '{' },
      ],
    });

    const text = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();

    const parsed = ValenceResponseSchema.safeParse(extractJson(text, '{'));
    if (!parsed.success) return fallback();
    return NextResponse.json({ ratings: parsed.data.ratings, fallback: false });
  } catch {
    return fallback();
  }
}
