-- ============================================================
-- 시작용 예시: posts (게시글/방명록) 테이블 + RLS 정책
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 [Run].
-- 테이블/컬럼 이름은 필요에 맞게 바꿔도 됩니다.
-- ============================================================

-- 1) 테이블 생성
create table if not exists public.posts (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text        not null,
  content    text        not null
);

-- 2) 행 수준 보안(RLS) 켜기  (public 스키마는 보통 이미 켜져 있음)
alter table public.posts enable row level security;

-- 3) 정책
--    (A) 누구나 읽기 허용
create policy "posts 읽기: 모두 허용"
  on public.posts for select
  using (true);

--    (B) 누구나 글쓰기(insert) 허용  ← 로그인 없는 방명록용
--        로그인 기반으로 바꾸려면 이 정책 대신 아래 "로그인 사용자만" 주석을 사용하세요.
create policy "posts 쓰기: 모두 허용"
  on public.posts for insert
  with check (true);

-- ------------------------------------------------------------
-- (선택) 로그인 사용자만 쓰기 허용하려면 위 (B) 대신 아래를 사용:
--
-- create policy "posts 쓰기: 로그인 사용자만"
--   on public.posts for insert
--   to authenticated
--   with check (true);
--
-- ※ 수정/삭제 정책은 기본적으로 만들지 않았습니다(= 아무도 못 함).
--    필요하면 update / delete 정책을 따로 추가하세요.
-- ------------------------------------------------------------
