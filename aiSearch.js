// AI 정비 지식 검색 — 정비사례 + 일일업무일지 통합 검색(브라우저 내, 데이터 외부 전송 없음)
// 규칙 기반으로 질문에서 조건 추출 → 두 DB 검색 → 병합·관련도 정렬
import { supabase } from "./supabaseClient.js";
import { OFFICES, OFFICE_LIST, labelForKey } from "./sites.js";

const ALL_SITES = [...new Set(Object.values(OFFICES).flat())];

// 장비 동의어 (검색 단계에서만 사용, DB 명칭은 안 바꿈)
const EQUIP_SYN = {
  "송신기": ["송신기", "tx", "transmitter"],
  "엑사이터": ["엑사이터", "여자기", "exciter"],
  "중계기": ["중계기", "repeater"],
};
// 증상·원인·작업 키워드
const TOPIC_KW = [
  "출력", "출력저하", "출력불량", "냉각", "냉각장치", "냉각호스", "팬", "과열", "온도", "전원", "정전", "ups",
  "전압", "전류", "누전", "차단기", "gps", "동기", "제어", "기판", "보드", "안테나", "급전", "필터",
  "교체", "점검", "정비", "수리", "트립", "누수", "경보", "알람", "증폭", "반사", "vswr", "펌웨어", "리셋",
];

function has(q, w) { return q.toLowerCase().includes(w.toLowerCase()); }

// 질문 → 조건
export function extractConditions(question) {
  const q = (question || "").trim();
  const sites = ALL_SITES.filter((s) => q.includes(s));
  const offices = OFFICE_LIST.filter((o) => q.includes(o));
  const equips = Object.keys(EQUIP_SYN).filter((e) => EQUIP_SYN[e].some((syn) => has(q, syn)));
  const topics = TOPIC_KW.filter((k) => has(q, k));
  // 검색 키워드 = 장비 동의어(대표어) + 토픽 + 시설명 (중복 제거)
  const keywords = [...new Set([...equips, ...topics])];

  // 기간
  let from, to;
  const now = new Date();
  const yStr = (y) => `${y}-01-01`, eStr = (y) => `${y}-12-31`;
  if (/올해|금년|이번\s*년/.test(q)) from = yStr(now.getFullYear());
  else if (/작년|지난\s*해|전년/.test(q)) { from = yStr(now.getFullYear() - 1); to = eStr(now.getFullYear() - 1); }
  else {
    const my = q.match(/최근\s*(\d+)\s*년/); const mm = q.match(/최근\s*(\d+)\s*(개월|달)/);
    if (my) { const d = new Date(now); d.setFullYear(d.getFullYear() - parseInt(my[1], 10)); from = d.toISOString().slice(0, 10); }
    else if (mm) { const d = new Date(now); d.setMonth(d.getMonth() - parseInt(mm[1], 10)); from = d.toISOString().slice(0, 10); }
  }
  return { raw: q, sites, offices, equips, topics, keywords, from, to };
}

// 텍스트에 키워드 몇 개나 포함되는지
function kwHits(text, keywords) {
  const t = (text || "").toLowerCase();
  let n = 0; for (const k of keywords) if (t.includes(k.toLowerCase())) n++;
  return n;
}

// ===== 정비사례 검색 =====
async function searchFaults(cond) {
  let query = supabase.from("fault_cases").select("*").order("fault_date", { ascending: false }).limit(400);
  if (cond.offices.length === 1) query = query.eq("office", cond.offices[0]);
  if (cond.from) query = query.gte("fault_date", cond.from);
  if (cond.to) query = query.lte("fault_date", cond.to);
  const { data, error } = await query;
  if (error) throw error;
  const out = [];
  for (const r of data || []) {
    const siteHit = cond.sites.length ? cond.sites.includes((r.site || "").trim()) : false;
    const equipHit = cond.equips.length ? cond.equips.some((e) => EQUIP_SYN[e].some((s) => (r.equip_type + " " + r.model + " " + r.equipment + " " + r.symptom + " " + r.action).toLowerCase().includes(s.toLowerCase()))) : false;
    const blob = [r.model, r.equipment, r.symptom, r.action, r.doc_text, r.equip_type, r.plan].filter(Boolean).join(" ");
    const topicHits = kwHits(blob, cond.topics);
    // 조건이 아예 없으면(막연한 질문) 최신 위주로 약한 점수
    let score = 0;
    if (siteHit) score += 4;
    if (equipHit) score += 3;
    score += topicHits * 2;
    if (cond.sites.length && !siteHit) continue; // 시설을 지정했으면 다른 시설 제외
    if (!cond.sites.length && !cond.equips.length && !cond.topics.length) score = 1; // 조건 없음 → 최신
    if (score <= 0) continue;
    out.push({ type: "fault", id: r.id, date: r.fault_date || "", office: r.office || "", site: r.site || "", equip: r.equip_type || "", model: r.model || "", symptom: r.symptom || "", action: r.action || "", score, tier: siteHit && equipHit && topicHits ? 1 : siteHit && equipHit ? 2 : equipHit && topicHits ? 3 : 4 });
  }
  out.sort((a, b) => b.score - a.score || (b.date > a.date ? 1 : -1));
  return out.slice(0, 15);
}

// ===== 일일업무일지 검색 (contents 텍스트 스캔) =====
async function searchLogs(cond) {
  let query = supabase.from("work_logs").select("office,log_date,contents").order("log_date", { ascending: false }).limit(2000);
  if (cond.offices.length === 1) query = query.eq("office", cond.offices[0]);
  if (cond.from) query = query.gte("log_date", cond.from);
  if (cond.to) query = query.lte("log_date", cond.to);
  const { data, error } = await query;
  if (error) throw error;
  const anyKw = cond.keywords.length > 0;
  const out = [];
  for (const r of data || []) {
    const c = r.contents || {};
    for (const key in c) {
      const facility = labelForKey(key);
      if (cond.sites.length && !cond.sites.includes(facility)) continue; // 시설 지정 시 그 시설만
      const text = String(c[key] || "").replace(/\[(?:사진|그림)[\d,\s]*\]/g, "").trim();
      if (!text) continue;
      const hits = anyKw ? kwHits(text, cond.keywords) : 0;
      let score = 0;
      if (cond.sites.length && cond.sites.includes(facility)) score += 3;
      score += hits * 2;
      if (anyKw && hits === 0 && !cond.sites.includes(facility)) continue; // 키워드도 시설도 안 맞으면 제외
      if (!anyKw && !cond.sites.length) score = 1; // 조건 없음 → 최신
      if (score <= 0) continue;
      // 스니펫: 키워드 있는 줄 위주
      const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      const hitLines = anyKw ? lines.filter((l) => kwHits(l, cond.keywords) > 0) : lines;
      const snippet = (hitLines.length ? hitLines : lines).slice(0, 4).join("\n");
      out.push({ type: "log", office: r.office || "", date: r.log_date || "", site: facility, text: snippet, score });
    }
  }
  out.sort((a, b) => b.score - a.score || (b.date > a.date ? 1 : -1));
  return out.slice(0, 15);
}

// 통합 검색
export async function knowledgeSearch(question) {
  const cond = extractConditions(question);
  const [faults, logs] = await Promise.all([searchFaults(cond), searchLogs(cond)]);
  return { cond, faults, logs };
}

// LLM 컨텍스트용 텍스트(검색 결과만)
export function buildContext(faults, logs) {
  const lines = [];
  lines.push("[정비사례]");
  if (faults.length) faults.forEach((f, i) => lines.push(`${i + 1}. ${f.date} | ${f.office} ${f.site} | 장비:${f.equip} 모델:${f.model} | 증상:${f.symptom || "-"} | 조치:${f.action || "-"}`));
  else lines.push("(없음)");
  lines.push("");
  lines.push("[일일업무일지]");
  if (logs.length) logs.forEach((l, i) => lines.push(`${i + 1}. ${l.date} | ${l.office} ${l.site} | ${l.text.replace(/\n/g, " / ")}`));
  else lines.push("(없음)");
  return lines.join("\n");
}
