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

-- ── events ───────────────────────────────────────────────────────
-- 세션 중간에 찍히는 마커. "몇 ms 시점에 무슨 일이 있었나"를 남겨서
-- 사후 분석(자극 반응 구간 잘라보기 등)과 진행자 뷰(실시간 진행 상황 표시)에 쓴다.
create table if not exists public.events (
  id          bigserial   primary key,
  session_id  text        not null references public.sessions(session_id) on delete cascade,
  t_ms        integer     not null,
  -- 예: 'scene-enter', 'stimulus-onset', 'question-onset'
  type        text        not null,
  ref         text,
  intensity   real,
  created_at  timestamptz not null default now()
);

-- 세션 하나의 이벤트를 시간순으로 훑어보는 조회가 대부분이라 복합 인덱스로 묶는다.
create index if not exists events_session_id_t_ms_idx on public.events (session_id, t_ms);

alter table public.events enable row level security;

-- sessions와 동일한 이유로 anon 삽입·조회만 허용한다 (수정·삭제는 막는다).
drop policy if exists "anon can insert" on public.events;
create policy "anon can insert" on public.events
  for insert to anon with check (true);

drop policy if exists "anon can read" on public.events;
create policy "anon can read" on public.events
  for select to anon using (true);

-- Realtime — publication에 같은 테이블을 두 번 추가하면 에러가 나므로,
-- 이미 등록돼 있는지 확인하고 없을 때만 추가한다 (파일 재실행 안전성).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

-- ── receipts ─────────────────────────────────────────────────────
-- 기획안 부록 C에는 'receipts' 테이블로 나오지만, 실제로는 영수증을
-- sessions.receipt에 jsonb로 그대로 저장한다. 테이블을 따로 두면
-- 두 군데에 같은 데이터가 생겨서 언젠가 내용이 어긋난다 — 그래서
-- 테이블이 아니라 sessions를 가리키는 뷰로만 이름을 맞춰 둔다.
create or replace view public.receipts as
  select session_id, created_at, nickname, receipt, fallback
  from public.sessions;

-- ── signal_chunks (비활성) ──────────────────────────────────────
-- 원본 생체신호(심박·GSR·시선 raw)는 업로드하지 않기로 했다. 이유:
--   1) 10분 x 25Hz x 3채널이면 1인당 수만 샘플 — 무료 티어 용량을 금방 채운다.
--   2) 원본 생체신호는 이 프로젝트에서 가장 민감한 개인정보인데,
--      지금 앱 어디서도 원본이 필요하지 않다. 영수증은 180포인트로
--      다운샘플된 파형(sessions.hr_trace)만 있으면 충분하다.
-- 나중에 연구 목적으로 원본 신호를 아카이브하고 싶어지면, 아래를 주석 해제해서 쓰면 된다.
--
-- create table if not exists public.signal_chunks (
--   id          bigserial   primary key,
--   session_id  text        not null references public.sessions(session_id) on delete cascade,
--   channel     text        not null, -- 'hr' | 'gsr' | 'gaze'
--   t_start_ms  integer     not null,
--   sample_hz   real        not null,
--   samples     real[]      not null,
--   created_at  timestamptz not null default now()
-- );
--
-- create index if not exists signal_chunks_session_id_idx on public.signal_chunks (session_id);
--
-- alter table public.signal_chunks enable row level security;
--
-- drop policy if exists "anon can insert" on public.signal_chunks;
-- create policy "anon can insert" on public.signal_chunks
--   for insert to anon with check (true);
--
-- drop policy if exists "anon can read" on public.signal_chunks;
-- create policy "anon can read" on public.signal_chunks
--   for select to anon using (true);
