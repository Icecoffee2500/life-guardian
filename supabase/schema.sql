-- Life Guardian — Supabase 스키마
--
-- 무료 티어 기준. 부스 운영에 필요한 최소 구성만 둔다.
-- 이 테이블이 없어도 앱은 localStorage로 동작하므로, 배포 전에 급하게 만들 필요는 없다.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행
--
-- 개인정보: 닉네임(선택)과 발화 텍스트만 남는다. 음성 원본은 저장하지 않는다.
-- 발화 텍스트는 input.dialogue[].transcript 안에 들어 있으므로,
-- 공모전 제출 후에는 아래 '정리' 쿼리로 지우는 것을 권장한다.

create table if not exists public.sessions (
  session_id    text primary key,
  nickname      text        not null default '',
  mode          text        not null default 'full',
  created_at    timestamptz not null default now(),
  duration_sec  integer     not null default 0,
  -- 부록 C Input JSON (진행자 검증용)
  input         jsonb       not null,
  -- 부록 C Output JSON (영수증)
  receipt       jsonb       not null,
  -- 규칙 기반 폴백으로 만들어졌는가
  fallback      boolean     not null default false,
  -- 영수증에 인쇄할 심박 파형 (다운샘플)
  hr_trace      real[]      not null default '{}'
);

create index if not exists sessions_created_at_idx on public.sessions (created_at desc);

alter table public.sessions enable row level security;

-- 부스 데모는 익명 키만 쓴다. 인증을 붙일 시간도, 붙일 이유도 없다.
-- 대신 공개 범위를 명시적으로 좁힌다: 삽입과 조회만 허용하고 수정·삭제는 막는다.
drop policy if exists "anon can insert" on public.sessions;
create policy "anon can insert" on public.sessions
  for insert to anon with check (true);

drop policy if exists "anon can read" on public.sessions;
create policy "anon can read" on public.sessions
  for select to anon using (true);

-- upsert(onConflict)를 쓰므로 update도 필요하다.
-- 세션 ID를 아는 사람만 덮어쓸 수 있고, ID는 날짜+일련번호라 추측이 어렵지 않다 —
-- 부스 데모의 위험도로는 감수할 만하지만, 외부에 URL을 오래 열어 둘 계획이라면 끄는 편이 낫다.
drop policy if exists "anon can upsert" on public.sessions;
create policy "anon can upsert" on public.sessions
  for update to anon using (true) with check (true);

-- Realtime — 진행자 대시보드가 세션 생성을 실시간으로 받는다
alter publication supabase_realtime add table public.sessions;

-- ── 정리 ─────────────────────────────────────────────────────────
-- 행사 종료 후 발화 텍스트만 지우기 (통계는 남기고 개인 발화는 없앤다)
--
-- update public.sessions
-- set input = jsonb_set(
--   input, '{dialogue}',
--   (select jsonb_agg(d - 'transcript') from jsonb_array_elements(input->'dialogue') d)
-- );
