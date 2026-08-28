-- ============================================================
-- 장비 고장/정비 사례 DB (전국 공용)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 [Run].
-- ============================================================

create table if not exists public.fault_cases (
  id         bigint generated always as identity primary key,
  office     text,          -- 소속국
  dept       text,          -- 부서(머리글: OO방송총국 기술국)
  site       text,          -- 송신소
  equip_type text,          -- 장비 종류(송신기/엑사이터/중계기/RackController)
  equipment  text,          -- 장비명 상세
  model      text,          -- 모델명 (검색 1순위)
  symptom    text,          -- 증상 (검색 2순위)
  action     text,          -- 조치
  plan       text,          -- 향후계획
  detail1    text,          -- 세부(제작사/가격 등)
  detail2    text,
  title      text,          -- 보고서 제목
  authors    text,          -- 작성자
  fault_date date,          -- 날짜
  sub1       text,          -- 사진 소제목1
  sub2       text,          -- 사진 소제목2
  photos     jsonb not null default '[]'::jsonb,  -- 사진 [{path,caption,w,h}]
  created_at timestamptz not null default now()
);

alter table public.fault_cases enable row level security;

create policy "fault_cases 읽기: 모두" on public.fault_cases for select using (true);
create policy "fault_cases 등록: 모두" on public.fault_cases for insert with check (true);
create policy "fault_cases 수정: 모두" on public.fault_cases for update using (true) with check (true);
create policy "fault_cases 삭제: 모두" on public.fault_cases for delete using (true);

-- 검색 속도용 인덱스(선택)
create index if not exists fault_cases_model_idx on public.fault_cases (model);
create index if not exists fault_cases_office_idx on public.fault_cases (office, site);
