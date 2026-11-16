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
// 목록(가벼운 컬럼만) — 필터: office/site/model + q(제목·모델·장비)
export async function listManuals({ office, site, model, q } = {}) {
  let query = supabase
    .from("manuals")
    .select("id,office,site,equip_type,model,title,doc_path,translated_at,created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (office) query = query.eq("office", office);
  if (site) query = query.eq("site", site);
  if (model) query = query.ilike("model", `%${model}%`);
  if (q && q.trim()) {
    const kw = q.trim().replace(/[%,]/g, " ");
    query = query.or(`title.ilike.%${kw}%,model.ilike.%${kw}%,equip_type.ilike.%${kw}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ===== 무료 자동번역 (구글 비공식 엔드포인트, 키 불필요) =====
// 원문언어 자동감지(sl=auto) → 한국어(tl=ko). 긴 텍스트는 청크로 나눠 번역 후 합침.
function chunkText(text, max = 1600) {
  const lines = String(text || "").split(/\n/);
  const chunks = [];
  let cur = "";
  for (const ln of lines) {
    if ((cur + "\n" + ln).length > max) {
      if (cur) { chunks.push(cur); cur = ""; }
      if (ln.length > max) {
        let s = ln;
        while (s.length > max) { chunks.push(s.slice(0, max)); s = s.slice(max); }
        cur = s;
      } else cur = ln;
    } else {
      cur = cur ? cur + "\n" + ln : ln;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function translateChunk(text, tl) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" +
    encodeURIComponent(tl) + "&dt=t&q=" + encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) throw new Error("번역 서버 응답 오류 (" + res.status + ")");
  const data = await res.json();
  // data[0] = [[번역, 원문, ...], ...]
  return (data[0] || []).map((seg) => (seg && seg[0]) || "").join("");
}

// 진행 콜백 onProgress(done, total). 반환: 한국어 번역 전체.
export async function translateText(text, { tl = "ko", onProgress } = {}) {
  const src = String(text || "").trim();
  if (!src) throw new Error("번역할 원문 텍스트가 없어요 (스캔 PDF 등 텍스트가 추출되지 않은 문서)");
  const chunks = chunkText(src);
  const out = [];
  for (let i = 0; i < chunks.length; i++) {
    out.push(await translateChunk(chunks[i], tl));
    if (onProgress) onProgress(i + 1, chunks.length);
  }
  return out.join("\n");
}
