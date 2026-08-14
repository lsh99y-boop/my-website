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
// 사진 마커: [사진1], [사진 1,2], [그림3] 등
const PHOTO_MARKER = /\[(?:사진|그림)\s*([\d,\s]+)\]/g;

// 한 시설 내용칸을 채움: 텍스트(줄별 문단) + 마커 위치에 사진 박스 + 마커 없는 사진은 맨 아래.
// photos: [{idref, w, h}]
function fillFacility(s, key, text, photos) {
  const token = `{{${key}}}`;
  const ti = s.indexOf(token);
  if (ti < 0) return s;
  const pstart = s.lastIndexOf("<hp:p ", ti);
  const pend = s.indexOf("</hp:p>", ti) + "</hp:p>".length;
  const paraTpl = s.slice(pstart, pend); // ◎ 토큰 문단 템플릿

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
  if (!out.length) out.push(textPara("", true)); // 완전 빈 칸: ◎만
  // 마커 안 쓴 사진은 맨 아래
  const rest = (photos || []).map((_, i) => i).filter((i) => !used.has(i));
  if (rest.length) out.push(boxOf(rest));

  return s.slice(0, pstart) + out.join("") + s.slice(pend);
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
  // 8개 내용 칸: 텍스트 + 마커 위치 사진 + 나머지 사진(맨 아래)
  const allPhotos = [];
  for (const key of Object.keys(KEY_ROW)) {
    const photos = photosByKey[key] || [];
    sec = fillFacility(sec, key, data[key], photos);
    allPhotos.push(...photos);
  }
  sec = sec.replace(/\{\{[^}]+\}\}/g, "");

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
