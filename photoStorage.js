// 사진 클라우드 저장 (Supabase Storage, 'photos' 버킷)
import { supabase } from "./supabaseClient.js";

const BUCKET = "photos";

// 업로드 (같은 경로면 덮어씀)
export async function uploadPhoto(path, bytes) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

// 공개 URL
export function photoUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// 삭제
export async function removePhoto(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

// 바이트 다운로드 (hwpx 임베드용)
export async function fetchPhotoBytes(path) {
  const url = photoUrl(path);
  const buf = await fetch(url).then((r) => {
    if (!r.ok) throw new Error("사진 로드 실패: " + path);
    return r.arrayBuffer();
  });
  return new Uint8Array(buf);
}
