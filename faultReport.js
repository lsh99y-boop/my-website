// 장애보고서 hwpx 생성 (브라우저) — 토큰 템플릿(assets/template_fault.hwpx) 채우기
import JSZip from "https://esm.sh/jszip@3.10.1";

const TEMPLATE_URL = "assets/template_fault.hwpx";
function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// c: 사례 객체 {title, authors, fault_date, site, equipment, model, symptom, action, detail1, detail2, plan, attachment}
export async function buildFaultReport(c) {
  const buf = await fetch(TEMPLATE_URL).then((r) => {
    if (!r.ok) throw new Error("보고서 양식을 불러오지 못했습니다: " + r.status);
    return r.arrayBuffer();
  });
  const zip = await JSZip.loadAsync(buf);
  let sec = await zip.file("Contents/section0.xml").async("string");

  const header = [c.authors, c.fault_date].filter(Boolean).join("        ");
  const dept = c.dept || `${c.office || ""}방송총국 기술국`;
  const chong = dept.replace(/\s*기술국\s*$/, "");
  const map = {
    "부서": dept,
    "총국": chong,
    "제목": c.title || "",
    "머리글": header,
    "대상시설": c.site || "",
    "장비명": c.equipment || "",
    "모델명": c.model || "",
    "증상": c.symptom || "",
    "조치": c.action || "",
    "세부1": c.detail1 || "",
    "세부2": c.detail2 || "",
    "향후계획": c.plan || "",
    "첨부": c.attachment || "",
  };
  for (const k in map) sec = sec.split(`{{${k}}}`).join(esc(map[k]));
  sec = sec.replace(/\{\{[^}]+\}\}/g, "");
  // 사진부 소제목 자리표시자 비움(사진 임베드는 추후)
  sec = sec.split("(소제목1)").join("").split("(소제목2)").join("");

  // 재조립 (mimetype 맨 앞·무압축)
  const files = [];
  zip.forEach((path, f) => { if (!f.dir) files.push(path); });
  const out = new JSZip();
  out.file("mimetype", await zip.file("mimetype").async("uint8array"), { compression: "STORE" });
  for (const path of files) {
    if (path === "mimetype") continue;
    if (path === "Contents/section0.xml") out.file(path, sec, { compression: "DEFLATE" });
    else out.file(path, await zip.file(path).async("uint8array"), { compression: "DEFLATE" });
  }
  return await out.generateAsync({ type: "blob" });
}
