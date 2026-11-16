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
    .select("id,equip_type,maker,model,title,doc_path,translated_at,created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (model) query = query.ilike("model", `%${model}%`);
  if (q && q.trim()) {
    const kw = q.trim().replace(/[%,]/g, " ");
    query = query.or(`title.ilike.%${kw}%,model.ilike.%${kw}%,maker.ilike.%${kw}%,equip_type.ilike.%${kw}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ===== 무료 자동번역 (구글 비공식 엔드포인트, 키 불필요) =====
// 원문언어 자동감지(sl=auto) → 한국어(tl=ko). 긴 텍스트는 "문장 단위"로 끊어 번역.
// (문장 중간에서 잘리면 번역이 깨지므로, 경계를 문장→단어 순으로 맞춘다.)
function splitSentences(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split(/(?<=[.!?。！？])\s+|\n+/)   // 마침표·물음표·느낌표(영/일) 또는 줄바꿈 뒤에서 분할
    .map((s) => s.trim())
    .filter(Boolean);
}
function chunkText(text, max = 1600) {
  const sents = splitSentences(text);
  const chunks = [];
  let cur = "";
  for (const sent of sents) {
    if (sent.length > max) {
      // 한 문장이 한도보다 길면 단어(공백) 경계로만 분할 — 단어 중간은 안 자름
      if (cur) { chunks.push(cur); cur = ""; }
      let piece = "";
      for (const w of sent.split(/(\s+)/)) {
        if ((piece + w).length > max) { if (piece.trim()) chunks.push(piece.trim()); piece = w; }
        else piece += w;
      }
      if (piece.trim()) cur = piece.trim();
      continue;
    }
    if (cur && (cur + " " + sent).length > max) { chunks.push(cur); cur = sent; }
    else cur = cur ? cur + " " + sent : sent;
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
