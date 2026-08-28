// 일일업무일지 hwpx 생성기 (브라우저) — 국별 가변 시설행
// 가변 템플릿(assets/template_daylog.hwpx)의 {{FACILITY_ROWS}}/{{ROWCNT}}를 국별로 채운 뒤 토큰 채움.
import JSZip from "https://esm.sh/jszip@3.10.1";
import { buildCellPhotos } from "./photo.js";
import { fetchPhotoBytes } from "./photoStorage.js";
import { facilitiesFor } from "./sites.js";
import { ROW_TEMPLATE } from "./daylog-templates.js";

const TEMPLATE_URL = "assets/template_daylog.hwpx";
const BULLET = "◎";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fillLine(s, token, v) {
  return s.split(token).join(esc(v));
}

// 국의 업무구분 행 XML + rowCnt
function officeRows(office) {
  const facs = facilitiesFor(office);
  let rows = "";
  facs.forEach(([label, key], i) => {
    rows += ROW_TEMPLATE
      .split("{{LABEL}}").join(esc(label))
      .split("{{ROW}}").join(String(4 + i))
      .split("{{TOKEN}}").join("{{" + key + "}}");
  });
  return { rows, rowCnt: 4 + facs.length };
}
// {{FACILITY_ROWS}}/{{ROWCNT}} 채우기
function applyOfficeRows(str, office) {
  const { rows, rowCnt } = officeRows(office);
  return str.split("{{FACILITY_ROWS}}").join(rows).split("{{ROWCNT}}").join(String(rowCnt));
}

// 사진 마커: [사진1], [사진 1,2], [그림3] 등
const PHOTO_MARKER = /\[(?:사진|그림)\s*([\d,\s]+)\]/g;

// 한 시설 내용칸 채움: 텍스트(줄별) + 마커 위치 사진 + 나머지 사진(맨 아래). photos:[{idref,w,h,caption}]
function fillFacility(s, key, text, photos) {
  const token = `{{${key}}}`;
  const ti = s.indexOf(token);
  if (ti < 0) return s;
  const pstart = s.lastIndexOf("<hp:p ", ti);
  const pend = s.indexOf("</hp:p>", ti) + "</hp:p>".length;
  const paraTpl = s.slice(pstart, pend);

  const textPara = (str, keepBullet) => {
    let p = paraTpl.split(token).join(esc(str));
    if (!keepBullet) p = p.replace(BULLET + " ", "");
    p = p.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/, "");
    return p;
  };
  const boxOf = (idxs) =>
    buildCellPhotos(idxs.map((i) => ({ idref: photos[i].idref, pw: photos[i].w, ph: photos[i].h, caption: photos[i].caption })));

  const used = new Set();
  const out = [];
  let firstLine = true;
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const markers = [...line.matchAll(PHOTO_MARKER)];
    const textOnly = line.replace(PHOTO_MARKER, "").trim();
    if (textOnly) { out.push(textPara(textOnly, firstLine)); firstLine = false; }
    if (markers.length) {
      const nums = [];
      for (const m of markers)
        for (const n of m[1].split(",")) {
          const idx = parseInt(n.trim(), 10) - 1;
          if (idx >= 0 && photos && idx < photos.length) { nums.push(idx); used.add(idx); }
        }
      if (nums.length) out.push(boxOf(nums));
    }
  }
  if (!out.length) out.push(textPara("", true));
  const rest = (photos || []).map((_, i) => i).filter((i) => !used.has(i));
  if (rest.length) out.push(boxOf(rest));

  return s.slice(0, pstart) + out.join("") + s.slice(pend);
}

// 하루 템플릿에 날짜+시설 채우기. data: {MM,DD,WD,WX, <각 시설키>:텍스트}
function fillDay(tmpl, office, data, photosByKey = {}) {
  let s = tmpl;
  for (const k of ["MM", "DD", "WD", "WX"]) s = fillLine(s, `{{${k}}}`, data[k]);
  const keys = facilitiesFor(office).map((f) => f[1]);
  for (const key of keys) s = fillFacility(s, key, data[key] || "", photosByKey[key] || []);
  return s.replace(/\{\{[^}]+\}\}/g, "");
}

async function loadTemplate() {
  const buf = await fetch(TEMPLATE_URL).then((r) => {
    if (!r.ok) throw new Error("템플릿을 불러오지 못했습니다: " + r.status);
    return r.arrayBuffer();
  });
  return await JSZip.loadAsync(buf);
}
function manifestFor(photos) {
  return photos
    .map((p) => `<opf:item id="${p.idref}" href="BinData/${p.idref}.jpg" media-type="image/jpeg" isEmbeded="1"/>`)
    .join("");
}

// 하루치: office=국, data={MM,DD,WD,WX,<시설키>:텍스트}, photosByKey={키:[{idref,bytes,w,h,caption}]}
export async function buildHwpx(office, data, photosByKey = {}) {
  const zip = await loadTemplate();
  let sec = await zip.file("Contents/section0.xml").async("string");
  let hpf = await zip.file("Contents/content.hpf").async("string");

  sec = applyOfficeRows(sec, office);
  sec = fillDay(sec, office, data, photosByKey);

  const allPhotos = [];
  for (const k in photosByKey) allPhotos.push(...photosByKey[k]);
  if (allPhotos.length) hpf = hpf.replace('<opf:item id="header"', manifestFor(allPhotos) + '<opf:item id="header"');

  const files = [];
  zip.forEach((path, f) => { if (!f.dir) files.push(path); });
  const out = new JSZip();
  out.file("mimetype", await zip.file("mimetype").async("uint8array"), { compression: "STORE" });
  for (const path of files) {
    if (path === "mimetype") continue;
    if (path === "Contents/section0.xml") out.file(path, sec, { compression: "DEFLATE" });
    else if (path === "Contents/content.hpf") out.file(path, hpf, { compression: "DEFLATE" });
    else out.file(path, await zip.file(path).async("uint8array"), { compression: "DEFLATE" });
  }
  for (const p of allPhotos) out.file(`BinData/${p.idref}.jpg`, p.bytes, { compression: "STORE" });
  return await out.generateAsync({ type: "blob" });
}

// 한 달치: office=국, days=[{log_date,weekday,weather,contents:{키:텍스트},photos:{키:[{path,w,h,caption}]}}]
export async function buildMonthHwpx(office, days) {
  const zip = await loadTemplate();
  const sec0 = await zip.file("Contents/section0.xml").async("string");
  const decl = (sec0.match(/^<\?xml[^>]*\?>/) || ['<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'])[0];
  const rootOpen = sec0.match(/<hs:sec\b[^>]*>/)[0];
  let body = sec0.slice(sec0.indexOf(rootOpen) + rootOpen.length, sec0.lastIndexOf("</hs:sec>"));
  body = applyOfficeRows(body, office); // 시설행 채움(날짜/내용 토큰은 남김)
  const secPr = (body.match(/<hp:secPr\b[\s\S]*?<\/hp:secPr>/) || [""])[0];
  const bodyNoSec = secPr ? body.replace(secPr, "") : body;

  const bin = [];
  const manifestItems = [];
  let seq = 0, out = "";
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const [, M, D] = day.log_date.split("-");
    const wd = day.weekday || WEEKDAYS[new Date(day.log_date + "T00:00:00").getDay()];
    const data = { MM: M, DD: D, WD: wd, WX: day.weather || "", ...(day.contents || {}) };
    // 사진: Storage에서 바이트
    const dayPhotos = {};
    const dp = day.photos || {};
    for (const key in dp) {
      dayPhotos[key] = [];
      for (const p of dp[key]) {
        const idref = "m" + (++seq);
        try {
          bin.push({ arc: `BinData/${idref}.jpg`, bytes: await fetchPhotoBytes(p.path) });
          manifestItems.push(`<opf:item id="${idref}" href="BinData/${idref}.jpg" media-type="image/jpeg" isEmbeded="1"/>`);
          dayPhotos[key].push({ idref, w: p.w, h: p.h, caption: p.caption });
        } catch (e) { /* skip */ }
      }
    }
    const tmpl = i === 0 ? body : bodyNoSec.replace('pageBreak="0"', 'pageBreak="1"');
    out += fillDay(tmpl, office, data, dayPhotos);
  }
  const newSec = decl + rootOpen + out + "</hs:sec>";
  let hpf = await zip.file("Contents/content.hpf").async("string");
  if (manifestItems.length) hpf = hpf.replace('<opf:item id="header"', manifestItems.join("") + '<opf:item id="header"');

  const files = [];
  zip.forEach((path, f) => { if (!f.dir) files.push(path); });
  const outZip = new JSZip();
  outZip.file("mimetype", await zip.file("mimetype").async("uint8array"), { compression: "STORE" });
  for (const path of files) {
    if (path === "mimetype") continue;
    if (path === "Contents/section0.xml") outZip.file(path, newSec, { compression: "DEFLATE" });
    else if (path === "Contents/content.hpf") outZip.file(path, hpf, { compression: "DEFLATE" });
    else outZip.file(path, await zip.file(path).async("uint8array"), { compression: "DEFLATE" });
  }
  for (const b of bin) outZip.file(b.arc, b.bytes, { compression: "STORE" });
  return await outZip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
