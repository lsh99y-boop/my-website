-- ============================================================
-- 일일업무일지 저장 테이블 (전국: 국+날짜 키)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 [Run].
-- ============================================================

-- [신규 설치용] 테이블 생성
create table if not exists public.work_logs (
  office     text not null default '대전',   -- 소속국(본사/대전/부산…)
  log_date   date not null,                  -- 날짜
  weekday    text,
  weather    text,
  contents   jsonb not null default '{}'::jsonb,  -- 시설별 내용
  photos     jsonb not null default '{}'::jsonb,  -- 시설별 사진 메타
  updated_at timestamptz not null default now(),
  primary key (office, log_date)
);

alter table public.work_logs enable row level security;
create policy "work_logs 읽기: 모두" on public.work_logs for select using (true);
create policy "work_logs 저장: 모두" on public.work_logs for insert with check (true);
create policy "work_logs 수정: 모두" on public.work_logs for update using (true) with check (true);
create policy "work_logs 자동정리: 6개월 지난 것만"
  on public.work_logs for delete
  using (log_date < (current_date - interval '6 months'));

-- ============================================================
-- [이미 테이블이 있는 경우 — 전국 확장 마이그레이션]
-- 아래만 따로 실행 (위 create는 이미 있으면 무시됨)
-- ============================================================
-- 1) office 컬럼 추가 (기존 행은 '대전'으로)
--   alter table public.work_logs add column if not exists office text not null default '대전';
-- 2) 기본키를 (office, log_date) 복합키로 변경
--   alter table public.work_logs drop constraint work_logs_pkey;
--   alter table public.work_logs add primary key (office, log_date);
