// 장비 고장/정비 사례 DB (Supabase fault_cases 테이블) — 전국 공용
import { supabase } from "./supabaseClient.js";

// 등록
export async function saveCase(c) {
  const { data, error } = await supabase.from("fault_cases").insert(c).select().single();
  if (error) throw error;
  return data;
}
// 수정
export async function updateCase(id, c) {
  const { data, error } = await supabase.from("fault_cases").update(c).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
// 삭제
export async function deleteCase(id) {
  const { error } = await supabase.from("fault_cases").delete().eq("id", id);
  if (error) throw error;
}
// 하나 불러오기
export async function getCase(id) {
  const { data, error } = await supabase.from("fault_cases").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
// 통계용: 집계에 필요한 컬럼만, 기간/국 필터
export async function statsCases({ office, from, to } = {}) {
  let query = supabase
    .from("fault_cases")
    .select("office, site, equip_type, model, symptom, fault_date")
    .order("fault_date", { ascending: false })
    .limit(5000);
  if (office) query = query.eq("office", office);
  if (from) query = query.gte("fault_date", from);
  if (to) query = query.lte("fault_date", to);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// 검색: q(모델명·증상) + 필터(office/site/equip_type)
export async function searchCases({ q, office, site, equip_type } = {}) {
  let query = supabase.from("fault_cases").select("*").order("fault_date", { ascending: false }).limit(200);
  if (office) query = query.eq("office", office);
  if (site) query = query.eq("site", site);
  if (equip_type) query = query.ilike("equip_type", `%${equip_type}%`);
  if (q && q.trim()) {
    const kw = q.trim().replace(/[%,]/g, " ");
    query = query.or(`model.ilike.%${kw}%,symptom.ilike.%${kw}%,equipment.ilike.%${kw}%,doc_text.ilike.%${kw}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
