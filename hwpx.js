// 일일업무일지 hwpx 생성기 (브라우저)
// 토큰 템플릿(assets/template_ilji.hwpx)을 불러와 입력값으로 채운 뒤 .hwpx 다운로드.
import JSZip from "https://esm.sh/jszip@3.10.1";
import { buildPhotoParagraph } from "./photo.js";

const BULLET = "◎"; // ◎
const TEMPLATE_URL = "assets/template_ilji.hwpx";

// XML 이스케이프
function esc(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 단일 라인 토큰(날짜·요일·날씨) 치환
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
  const out = [para.split(token).join(esc(lines[0]))]; // 1줄: ◎ 유지
  for (let i = 1; i < lines.length; i++) {
    let clone = para.split(token).join(esc(lines[i]));
    clone = clone.replace(BULLET + " ", "");                 // 이어지는 줄: ◎ 제거
    clone = clone.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/, ""); // 캐시 제거
    out.push(clone);
  }
  return s.slice(0, pstart) + out.join("") + s.slice(pend);
}

// data: {MM,DD,WD,WX, C_song,...,C_teuki}
// photos: [{idref, bytes:Uint8Array, w, h, caption}]  (선택)
export async function buildHwpx(data, photos = []) {
  const buf = await fetch(TEMPLATE_URL).then((r) => {
    if (!r.ok) throw new Error("템플릿을 불러오지 못했습니다: " + r.status);
    return r.arrayBuffer();
  });
  const zip = await JSZip.loadAsync(buf);
  let sec = await zip.file("Contents/section0.xml").async("string");
  let hpf = await zip.file("Contents/content.hpf").async("string");

  // 날짜/요일/날씨
  for (const k of ["MM", "DD", "WD", "WX"]) sec = fillLine(sec, `{{${k}}}`, data[k]);
  // 8개 내용 칸
  for (const k of ["C_song", "C_tvram", "C_gr", "C_sj", "C_hs", "C_wh", "C_minwon", "C_teuki"])
    sec = fillContent(sec, `{{${k}}}`, data[k]);
  // 남은 토큰 제거
  sec = sec.replace(/\{\{[^}]+\}\}/g, "");

  // 사진: 폼 아래(</hs:sec> 직전)에 그리드 삽입 + 매니페스트 등록
  if (photos && photos.length) {
    const para = buildPhotoParagraph(
      photos.map((p) => ({ idref: p.idref, pw: p.w, ph: p.h, caption: p.caption }))
    );
    sec = sec.replace("</hs:sec>", para + "</hs:sec>");
    const items = photos
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
  // 사진 BinData 추가
  for (const p of photos || [])
    out.file(`BinData/${p.idref}.jpg`, p.bytes, { compression: "STORE" });

  return await out.generateAsync({ type: "blob" });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
