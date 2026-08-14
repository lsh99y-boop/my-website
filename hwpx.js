// 일일업무일지 hwpx 생성기 (브라우저)
// 토큰 템플릿(assets/template_ilji.hwpx)을 불러와 입력값·사진으로 채운 뒤 .hwpx 다운로드.
import JSZip from "https://esm.sh/jszip@3.10.1";
import { buildCellPhotos } from "./photo.js";

const TEMPLATE_URL = "assets/template_ilji.hwpx";
const BULLET = "◎";

// 시설 키 → 내용칸 표 rowAddr (colAddr는 2 고정)
const KEY_ROW = {
  C_song: 4, C_tvram: 5, C_gr: 6, C_sj: 7,
  C_hs: 8, C_wh: 9, C_minwon: 10, C_teuki: 11,
};

function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fillLine(s, token, v) {
  return s.split(token).join(esc(v));
}
// 내용 칸: 줄마다 별도 문단(<hp:p>) 복제. 첫 줄만 ◎ 유지.
function fillContent(s, token, value) {
  const ti = s.indexOf(token);
  if (ti < 0) return s;
  const pstart = s.lastIndexOf("<hp:p ", ti);
  const pend = s.indexOf("</hp:p>", ti) + "</hp:p>".length;
  const para = s.slice(pstart, pend);
  const lines = value && value.trim() ? value.replace(/\r\n/g, "\n").split("\n") : [""];
  const out = [para.split(token).join(esc(lines[0]))];
  for (let i = 1; i < lines.length; i++) {
    let clone = para.split(token).join(esc(lines[i]));
    clone = clone.replace(BULLET + " ", "");
    clone = clone.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/, "");
    out.push(clone);
  }
  return s.slice(0, pstart) + out.join("") + s.slice(pend);
}

// 특정 셀(colAddr,rowAddr)의 subList 끝(</hp:subList>)에 사진 문단 삽입 (텍스트 아래)
function injectCellPhotos(sec, col, row, photosXml) {
  if (!photosXml) return sec;
  const parts = sec.split("<hp:tc");
  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"\/>/);
    if (m && +m[1] === col && +m[2] === row) {
      const idx = parts[i].indexOf("</hp:subList>");
      if (idx >= 0) parts[i] = parts[i].slice(0, idx) + photosXml + parts[i].slice(idx);
      break;
    }
  }
  return parts.join("<hp:tc");
}

// data: {MM,DD,WD,WX, C_song,...,C_teuki}  (텍스트)
// photosByKey: {C_song:[{idref,bytes,w,h}], ...}  (시설별 사진)
export async function buildHwpx(data, photosByKey = {}) {
  const buf = await fetch(TEMPLATE_URL).then((r) => {
    if (!r.ok) throw new Error("템플릿을 불러오지 못했습니다: " + r.status);
    return r.arrayBuffer();
  });
  const zip = await JSZip.loadAsync(buf);
  let sec = await zip.file("Contents/section0.xml").async("string");
  let hpf = await zip.file("Contents/content.hpf").async("string");

  // 날짜/요일/날씨
  for (const k of ["MM", "DD", "WD", "WX"]) sec = fillLine(sec, `{{${k}}}`, data[k]);
  // 8개 내용 칸 텍스트
  for (const k of Object.keys(KEY_ROW)) sec = fillContent(sec, `{{${k}}}`, data[k]);
  sec = sec.replace(/\{\{[^}]+\}\}/g, "");

  // 시설별 사진: 해당 내용칸 텍스트 아래에 삽입
  const allPhotos = [];
  for (const key of Object.keys(KEY_ROW)) {
    const photos = photosByKey[key] || [];
    if (!photos.length) continue;
    const xml = buildCellPhotos(photos.map((p) => ({ idref: p.idref, pw: p.w, ph: p.h })));
    sec = injectCellPhotos(sec, 2, KEY_ROW[key], xml);
    allPhotos.push(...photos);
  }
  if (allPhotos.length) {
    const items = allPhotos
      .map((p) => `<opf:item id="${p.idref}" href="BinData/${p.idref}.jpg" media-type="image/jpeg" isEmbeded="1"/>`)
      .join("");
    hpf = hpf.replace('<opf:item id="header"', items + '<opf:item id="header"');
  }

  // hwpx 재조립: mimetype을 맨 앞·무압축으로
  const files = [];
  zip.forEach((path, f) => { if (!f.dir) files.push(path); });
  const out = new JSZip();
  const mime = await zip.file("mimetype").async("uint8array");
  out.file("mimetype", mime, { compression: "STORE" });
  for (const path of files) {
    if (path === "mimetype") continue;
    if (path === "Contents/section0.xml") out.file(path, sec, { compression: "DEFLATE" });
    else if (path === "Contents/content.hpf") out.file(path, hpf, { compression: "DEFLATE" });
    else {
      const content = await zip.file(path).async("uint8array");
      out.file(path, content, { compression: "DEFLATE" });
    }
  }
  for (const p of allPhotos) out.file(`BinData/${p.idref}.jpg`, p.bytes, { compression: "STORE" });

  return await out.generateAsync({ type: "blob" });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
