import { NextResponse } from 'next/server';
import { INTERPRET_MODEL, VALENCE_MODEL, hasApiKey } from '@/lib/interpret/client';

export const runtime = 'nodejs';
// 배포 시점에 값이 굳으면 진단 도구로 쓸 수 없다
export const dynamic = 'force-dynamic';

/**
 * 진단 엔드포인트.
 *
 * "분명히 키를 넣었는데 왜 규칙 기반이 나오지?"에 답하기 위한 것이다.
 * 배포 환경에서 서버가 실제로 무엇을 보고 있는지는 로컬에서 알 수 없고,
 * 세션을 한 번 돌려보기 전에는 확인할 방법이 없었다.
 *
 * **키 값 자체는 절대 내보내지 않는다.** 있는지 없는지와 길이만 돌려준다.
 */
export interface HealthResponse {
  /** 해석 API 키가 서버에 보이는가 */
  interpretKey: boolean;
  /** 키가 있다면 그 길이 (오타·따옴표 포함 여부를 눈치채기 위한 최소 단서) */
  interpretKeyLength: number;
  interpretModel: string;
  valenceModel: string;
  /** 세션 저장소가 연결되어 있는가 */
  supabase: boolean;
  /** 배포 환경 이름 (vercel이면 production/preview) */
  env: string;
}

export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  return NextResponse.json({
    interpretKey: hasApiKey(),
    interpretKeyLength: key.length,
    interpretModel: INTERPRET_MODEL,
    valenceModel: VALENCE_MODEL,
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
  } satisfies HealthResponse);
}
