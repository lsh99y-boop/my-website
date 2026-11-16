// 장비 매뉴얼 DB (Supabase manuals 테이블) + 무료 자동번역(구글, 키 불필요)
import { supabase } from "./supabaseClient.js";

// ===== DB =====
export async function saveManual(m) {
  const { data, error } = await supabase.from("manuals").insert(m).select().single();
  if (error) throw error;
  return data;
}
export async function updateManual(id, m) {
  const { data, error } = await supabase.from("manuals").update(m).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteManual(id) {
  const { error } = await supabase.from("manuals").delete().eq("id", id);
  if (error) throw error;
}
export async function getManual(id) {
  const { data, error } = await supabase.from("manuals").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
// 입력 문자열 → 키워드 배열(공백 분리, 특수문자 제거)
export function parseTerms(q) {
  return String(q || "").trim().split(/\s+/).map((t) => t.replace(/[%,()]/g, " ").trim()).filter(Boolean);
}

// 목록/검색 — 여러 키워드를 모두(AND) 포함하는 매뉴얼. 각 키워드는 제목·모델·제조사·장비·PDF 원문 중 어디든 맞으면 됨
export async function listManuals({ model, q } = {}) {
  const terms = parseTerms(q);
  const searching = terms.length > 0;
  // 검색 시에는 스니펫 표시를 위해 원문(doc_text)도 가져온다
  const cols = searching
    ? "id,equip_type,maker,model,title,doc_path,doc_text,created_at"
    : "id,equip_type,maker,model,title,doc_path,created_at";
  let query = supabase.from("manuals").select(cols).order("created_at", { ascending: false }).limit(300);
  if (model) query = query.ilike("model", `%${model}%`);
  // .or()를 키워드마다 호출 → 키워드들은 AND, 각 키워드 안에서 컬럼들은 OR
  for (const kw of terms) {
    query = query.or(
      `title.ilike.%${kw}%,model.ilike.%${kw}%,maker.ilike.%${kw}%,equip_type.ilike.%${kw}%,doc_text.ilike.%${kw}%`
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
