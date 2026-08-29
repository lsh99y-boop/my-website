-- ===== 정비사례 "원본 문서(PDF/HWPX)" 첨부 기능 설정 =====
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번 실행하세요.

-- 1) fault_cases 에 컬럼 추가 (문서 경로 + 검색용 추출 텍스트)
alter table public.fault_cases add column if not exists doc_path text;
alter table public.fault_cases add column if not exists doc_text text;

-- 2) 문서 저장용 버킷 생성 (공개 읽기)
insert into storage.buckets (id, name, public)
values ('docs', 'docs', true)
on conflict (id) do nothing;

-- 3) docs 버킷 접근 정책 (익명 업로드/읽기/삭제)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'docs read') then
    create policy "docs read"   on storage.objects for select using (bucket_id = 'docs');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'docs insert') then
    create policy "docs insert" on storage.objects for insert with check (bucket_id = 'docs');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'docs delete') then
    create policy "docs delete" on storage.objects for delete using (bucket_id = 'docs');
  end if;
end $$;

-- 완료. (docs 버킷 + doc_path/doc_text 컬럼)
