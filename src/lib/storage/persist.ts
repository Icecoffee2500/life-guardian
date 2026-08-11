'use client';

import { supabase } from '@/lib/supabase/client';
import type { SessionRecord } from './record';

/**
 * 세션 저장 — localStorage가 1차, Supabase가 있으면 함께 올린다.
 *
 * 순서가 중요하다. 로컬을 먼저 쓰고 원격은 실패해도 무시한다.
 * 부스에서 네트워크가 끊겼다고 영수증이 사라지면 안 된다.
 */

const KEY_PREFIX = 'lg:session:';
const INDEX_KEY = 'lg:sessions';
/** 브라우저에 남겨 둘 최대 세션 수 — 부스 하루치보다 넉넉하게 */
const MAX_LOCAL = 60;

function safeLocal(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    // 시크릿 모드·저장소 차단 환경
    return null;
  }
}

export function saveLocal(record: SessionRecord): void {
  const ls = safeLocal();
  if (!ls) return;
  try {
    ls.setItem(KEY_PREFIX + record.session_id, JSON.stringify(record));
    const index = listLocalIds().filter((id) => id !== record.session_id);
    index.unshift(record.session_id);
    // 오래된 것부터 지운다
    for (const id of index.slice(MAX_LOCAL)) ls.removeItem(KEY_PREFIX + id);
    ls.setItem(INDEX_KEY, JSON.stringify(index.slice(0, MAX_LOCAL)));
  } catch {
    // 용량 초과 등. 저장 실패가 체험을 막지는 않는다.
  }
}

export function listLocalIds(): string[] {
  const ls = safeLocal();
  if (!ls) return [];
  try {
    const raw = ls.getItem(INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function loadLocal(sessionId: string): SessionRecord | null {
  const ls = safeLocal();
  if (!ls) return null;
  try {
    const raw = ls.getItem(KEY_PREFIX + sessionId);
    return raw ? (JSON.parse(raw) as SessionRecord) : null;
  } catch {
    return null;
  }
}

export function listLocal(limit = 20): SessionRecord[] {
  return listLocalIds()
    .slice(0, limit)
    .map(loadLocal)
    .filter((r): r is SessionRecord => r !== null);
}

/** Supabase가 설정되어 있으면 업로드한다. 실패는 삼킨다. */
export async function saveRemote(record: SessionRecord): Promise<boolean> {
  const client = supabase();
  if (!client) return false;
  try {
    const { error } = await client.from('sessions').upsert(
      {
        session_id: record.session_id,
        nickname: record.nickname,
        mode: record.mode,
        created_at: record.created_at,
        duration_sec: record.duration_sec,
        input: record.input,
        receipt: record.receipt,
        fallback: record.fallback,
        hr_trace: record.hr_trace,
      },
      { onConflict: 'session_id' },
    );
    return !error;
  } catch {
    return false;
  }
}

export async function loadRemote(sessionId: string): Promise<SessionRecord | null> {
  const client = supabase();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('sessions')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error || !data) return null;
    return data as SessionRecord;
  } catch {
    return null;
  }
}

/** 저장 — 로컬 먼저, 원격은 있으면 */
export async function saveSession(record: SessionRecord): Promise<void> {
  saveLocal(record);
  await saveRemote(record);
}

/** 조회 — 로컬 먼저, 없으면 원격 */
export async function loadSession(sessionId: string): Promise<SessionRecord | null> {
  return loadLocal(sessionId) ?? (await loadRemote(sessionId));
}
