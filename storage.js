// 일일업무일지 클라우드 저장/불러오기 (Supabase work_logs 테이블)
// 키: (office 국, log_date 날짜)
import { supabase } from "./supabaseClient.js";

// 하루치 저장 (같은 국+날짜면 덮어씀). photos: {key:[{path,caption,w,h}]}
export async function saveLog({ office, log_date, weekday, weather, contents, photos }) {
  const { error } = await supabase
    .from("work_logs")
    .upsert(
      { office, log_date, weekday, weather, contents, photos: photos || {}, updated_at: new Date().toISOString() },
      { onConflict: "office,log_date" }
    );
  if (error) throw error;
}

// 특정 국+날짜 불러오기 (없으면 null)
export async function loadLog(office, log_date) {
  const { data, error } = await supabase
    .from("work_logs")
    .select("*")
    .eq("office", office)
    .eq("log_date", log_date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// 직전(현재 날짜보다 이전)에 작성된 가장 최근 일지 1건 — "전일 업무 가져오기"용
export async function loadPrevLog(office, before_date) {
  const { data, error } = await supabase
    .from("work_logs")
    .select("*")
    .eq("office", office)
    .lt("log_date", before_date)
    .order("log_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// 한 국의 한 달치 (yyyymm = "2026-08"), 날짜순
export async function listMonth(office, yyyymm) {
  const start = yyyymm + "-01";
  const [y, m] = yyyymm.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const { data, error } = await supabase
    .from("work_logs")
    .select("*")
    .eq("office", office)
    .gte("log_date", start)
    .lt("log_date", next)
    .order("log_date", { ascending: true });
  if (error) throw error;
  return data || [];
}

// 일지 내용 검색: 키워드가 들어간 시설칸을 (국/날짜/시설/스니펫)으로 반환
function snippet(text, kw) {
  const i = text.toLowerCase().indexOf(kw.toLowerCase());
  if (i < 0) return text.slice(0, 40);
  const s = Math.max(0, i - 12);
  return (s > 0 ? "…" : "") + text.slice(s, i + kw.length + 28).replace(/\n/g, " ") + "…";
}
export async function searchLogs(q, office) {
  if (!q || !q.trim()) return [];
  let query = supabase.from("work_logs").select("office,log_date,contents").order("log_date", { ascending: false }).limit(3000);
  if (office) query = query.eq("office", office);
  const { data, error } = await query;
  if (error) throw error;
  const kw = q.trim();
  const out = [];
  for (const r of data || []) {
    const c = r.contents || {};
    for (const key in c) {
      const val = c[key] || "";
      if (val && val.toLowerCase().includes(kw.toLowerCase()))
        out.push({ office: r.office, log_date: r.log_date, key, snippet: snippet(val, kw) });
    }
  }
  return out;
}

// N개월 지난 일지 자동 삭제 (기본 6개월). 국 무관.
export async function cleanupOld(months = 6) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  const cutoff = d.toISOString().slice(0, 10);
  const { error } = await supabase.from("work_logs").delete().lt("log_date", cutoff);
  if (error) throw error;
}
