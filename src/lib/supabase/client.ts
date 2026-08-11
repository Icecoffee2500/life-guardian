'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase 클라이언트.
 *
 * 환경변수가 없으면 null을 돌려준다. 던지지 않는다 —
 * 이 프로젝트에서 저장소의 부재는 오류가 아니라 예상된 운영 상태다.
 * 저장은 localStorage가 1차이고 Supabase는 화면 간 동기화를 위한 덤이다.
 */

let cached: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  cached = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return cached;
}

export function hasSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}
