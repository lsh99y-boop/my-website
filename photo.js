// 사진 처리: 브라우저 압축(KB) + hwpx 사진 그리드(4열) XML 생성
import { PHOTO_TPL } from "./photo-templates.js";

const COLS = 4;
const PHOTO_H = 7225;
const CAP_H = 1282;

function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 파일 → 압축 JPEG (가로 maxW로 리사이즈, 품질 quality). KB 단위로 축소.
export function compressImage(file, maxW = 1024, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(async (blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        resolve({ bytes, w, h, size: blob.size });
      }, "image/jpeg", quality);
    };
    img.onerror = () => reject(new Error("이미지를 읽지 못했습니다: " + file.name));
    img.src = URL.createObjectURL(file);
  });
}

// 단일 사진 <hp:pic> (셀 안 배치용)
function picXml(idref, pw, ph) {
  const maxW = 11400, maxH = 6900;
  let dispW = Math.min(maxW, maxH * pw / ph);
  let dispH = dispW * ph / pw;
  dispW = Math.round(dispW); dispH = Math.round(dispH);
  const dimW = pw * 75, dimH = ph * 75;
  return `<hp:pic id="1" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="1" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${dispW}" height="${dispH}"/><hp:curSz width="${dispW}" height="${dispH}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${(dispW / 2) | 0}" centerY="${(dispH / 2) | 0}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="${idref}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${dispW}" y="0"/><hc:pt2 x="${dispW}" y="${dispH}"/><hc:pt3 x="0" y="${dispH}"/></hp:imgRect><hp:imgClip left="0" right="${dimW}" top="0" bottom="${dimH}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${dimW}" dimheight="${dimH}"/><hp:effects/><hp:sz width="${dispW}" widthRelTo="ABSOLUTE" height="${dispH}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="CENTER" horzAlign="CENTER" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`;
}

function repl(tpl, map) {
  let s = tpl;
  for (const k in map) s = s.split("{{" + k + "}}").join(map[k]);
  return s;
}

// photos: [{idref, pw, ph, caption}] → 사진표를 담은 top-level 문단 XML
export function buildPhotoParagraph(photos) {
  if (!photos || !photos.length) return "";
  const pairs = Math.ceil(photos.length / COLS);
  let rows = "";
  for (let pr = 0; pr < pairs; pr++) {
    const prow = 2 * pr, crow = 2 * pr + 1;
    let pcells = "", ccells = "";
    for (let col = 0; col < COLS; col++) {
      const idx = pr * COLS + col;
      const p = idx < photos.length ? photos[idx] : null;
      pcells += repl(PHOTO_TPL.PHOTO_CELL, {
        COL: col, ROW: prow, PIC: p ? picXml(p.idref, p.pw, p.ph) : "",
      });
      ccells += repl(PHOTO_TPL.CAP_CELL, {
        COL: col, ROW: crow, CAP: p ? esc(p.caption) : "",
      });
    }
    rows += "<hp:tr>" + pcells + "</hp:tr><hp:tr>" + ccells + "</hp:tr>";
  }
  const rowCnt = 2 * pairs, totalH = pairs * (PHOTO_H + CAP_H);
  const head = repl(PHOTO_TPL.TBL_HEAD, { ROWCNT: rowCnt, HEIGHT: totalH });
  const tbl = head + rows + "</hp:tbl>";
  return `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${tbl}</hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${totalH}" textheight="${totalH}" baseline="${Math.round(totalH * 0.85)}" spacing="600" horzpos="0" horzsize="56128" flags="393216"/></hp:linesegarray></hp:p>`;
}
