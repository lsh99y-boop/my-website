-- ============================================================
-- 매뉴얼 AI 하루 사용 횟수 기록 (서버 함수 manual-ai 전용)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 [Run].
-- 웹페이지에서는 접근할 수 없고(정책 없음), 서버 함수만 씁니다.
-- ============================================================

create table if not exists public.ai_usage (
  day   date primary key,             -- 한국 날짜
  count integer not null default 0    -- 그날 호출 수
);

alter table public.ai_usage enable row level security;  -- 정책을 만들지 않음 = 서버 전용

-- 호출 1회를 기록하고, 하루 한도 이내이면 true 를 돌려준다
create or replace function public.ai_usage_hit(max_per_day integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare c integer;
begin
  insert into public.ai_usage (day, count)
  values ((now() at time zone 'Asia/Seoul')::date, 1)
  on conflict (day) do update set count = public.ai_usage.count + 1
  returning count into c;
  return c <= max_per_day;
end $$;

revoke all on function public.ai_usage_hit(integer) from public, anon, authenticated;
grant execute on function public.ai_usage_hit(integer) to service_role;
