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
