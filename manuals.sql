-- ============================================================
-- 장비 매뉴얼 DB (전국 공용) — 원문 PDF + 추출 텍스트 + 번역 캐시
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 [Run].
-- 파일(PDF)은 기존 'docs' 스토리지 버킷의 manuals/ 폴더를 재사용합니다.
-- ============================================================

create table if not exists public.manuals (
  id              bigint generated always as identity primary key,
  equip_type      text,          -- 장비 종류(TV/FM/UHD/측정장비 등)
  maker           text,          -- 제조사
  model           text,          -- 모델명
  title           text not null, -- 매뉴얼 제목
  src_lang        text,          -- 원문 언어(표시용, 'auto' 가능)
  doc_path        text,          -- Supabase Storage 경로(docs 버킷)
  doc_text        text,          -- 원문 추출 텍스트(검색·번역 대상)
  translated_text text,          -- 번역 캐시(한국어)
  translated_at   timestamptz,   -- 번역 시각
  created_at      timestamptz not null default now()
);

-- 이미 테이블을 만든 뒤라면: 아래가 제조사 컬럼을 추가합니다(없을 때만).
alter table public.manuals add column if not exists maker text;

alter table public.manuals enable row level security;

create policy "manuals 읽기: 모두" on public.manuals for select using (true);
create policy "manuals 등록: 모두" on public.manuals for insert with check (true);
create policy "manuals 수정: 모두" on public.manuals for update using (true) with check (true);
create policy "manuals 삭제: 모두" on public.manuals for delete using (true);

create index if not exists manuals_model_idx on public.manuals (model);
create index if not exists manuals_maker_idx on public.manuals (maker);
