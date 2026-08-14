-- ============================================================
-- 일일업무일지 저장 테이블
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 [Run].
-- 하루(날짜) = 1행. 같은 날짜를 다시 저장하면 덮어씀(upsert).
-- ============================================================

create table if not exists public.work_logs (
  log_date   date primary key,        -- 날짜(고유)
  weekday    text,                    -- 요일
  weather    text,                    -- 날씨
  contents   jsonb not null default '{}'::jsonb,  -- 시설별 내용 {C_song, C_tvram, ...}
  updated_at timestamptz not null default now()
);

-- 행 수준 보안(RLS) 켜기
alter table public.work_logs enable row level security;

-- 정책: 누구나 읽기/쓰기/수정 (로그인 없는 내부용)
create policy "work_logs 읽기: 모두"
  on public.work_logs for select using (true);

create policy "work_logs 저장: 모두"
  on public.work_logs for insert with check (true);

create policy "work_logs 수정: 모두"
  on public.work_logs for update using (true) with check (true);

-- 삭제: 6개월 지난 일지만 삭제 가능 (자동 정리용, 최근 것은 실수로도 못 지움)
create policy "work_logs 자동정리: 6개월 지난 것만"
  on public.work_logs for delete
  using (log_date < (current_date - interval '6 months'));

-- ------------------------------------------------------------
-- 참고: 로그인이 없어서 공개키를 아는 사람은 누구나 읽고 쓸 수 있습니다.
--       내부용(URL 비공개)으로는 충분하지만, 나중에 로그인(Auth)을 붙이면
--       "본인 것만" 정책으로 바꿀 수 있습니다.
-- ------------------------------------------------------------
