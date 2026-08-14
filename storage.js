// 일일업무일지 클라우드 저장/불러오기 (Supabase work_logs 테이블)
import { supabase } from "./supabaseClient.js";

// 하루치 내용 저장 (같은 날짜면 덮어씀)
export async function saveLog({ log_date, weekday, weather, contents }) {
  const { error } = await supabase
    .from("work_logs")
    .upsert(
      { log_date, weekday, weather, contents, updated_at: new Date().toISOString() },
      { onConflict: "log_date" }
    );
  if (error) throw error;
}

// 특정 날짜 불러오기 (없으면 null)
export async function loadLog(log_date) {
  const { data, error } = await supabase
    .from("work_logs")
    .select("*")
    .eq("log_date", log_date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// 저장된 날짜 목록 (최근순)
export async function listDates(limit = 60) {
  const { data, error } = await supabase
    .from("work_logs")
    .select("log_date, weather, updated_at")
    .order("log_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// 한 달치 불러오기 (yyyymm = "2026-08"), 날짜순
export async function listMonth(yyyymm) {
  const start = yyyymm + "-01";
  const [y, m] = yyyymm.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const { data, error } = await supabase
    .from("work_logs")
    .select("*")
    .gte("log_date", start)
    .lt("log_date", next)
    .order("log_date", { ascending: true });
  if (error) throw error;
  return data || [];
}

// N개월 지난 일지 자동 삭제 (기본 6개월). RLS가 오래된 행만 삭제 허용.
export async function cleanupOld(months = 6) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  const cutoff = d.toISOString().slice(0, 10);
  const { error } = await supabase.from("work_logs").delete().lt("log_date", cutoff);
  if (error) throw error;
}
