// 원본 문서(PDF/HWPX) 클라우드 저장 (Supabase Storage, 'docs' 버킷)
import { supabase } from "./supabaseClient.js";

const BUCKET = "docs";

// 업로드 (Blob 또는 Uint8Array). contentType으로 pdf/hwpx 구분
export async function uploadDoc(path, blob, contentType) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: contentType || "application/octet-stream", upsert: true });
  if (error) throw error;
  return path;
}

// 공개 URL
export function docUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// 삭제
export async function removeDoc(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
