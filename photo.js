// 사진 처리: 브라우저 압축(KB) + 시설 내용칸 안에 테두리 박스 사진표 생성
import { PHOTO_TPL } from "./photo-templates.js";

const PER_ROW = 4;       // 한 줄에 사진 4장
const CELL_W = 12200;    // 박스 셀 폭(HWPUNIT, ≈43mm) — 내용칸 폭에 4장 꽉 채움
const PIC_MAXW = 11700;  // 셀 안 사진 최대 폭
const PIC_MAXH = 10320;  // 사진 최대 높이 (세로로 긴 사진일수록 크게)

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

function geom(pw, ph, maxW, maxH) {
  let dispW = Math.min(maxW, maxH * pw / ph);
  return { dispW: Math.round(dispW), dispH: Math.round(dispW * ph / pw) };
}

function picXml(idref, pw, ph) {
  const { dispW, dispH } = geom(pw, ph, PIC_MAXW, PIC_MAXH);
  const dimW = pw * 75, dimH = ph * 75;
  return {
    dispH,
    xml: `<hp:pic id="1" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="1" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${dispW}" height="${dispH}"/><hp:curSz width="${dispW}" height="${dispH}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${(dispW / 2) | 0}" centerY="${(dispH / 2) | 0}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="${idref}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${dispW}" y="0"/><hc:pt2 x="${dispW}" y="${dispH}"/><hc:pt3 x="0" y="${dispH}"/></hp:imgRect><hp:imgClip left="0" right="${dimW}" top="0" bottom="${dimH}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${dimW}" dimheight="${dimH}"/><hp:effects/><hp:sz width="${dispW}" widthRelTo="ABSOLUTE" height="${dispH}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="CENTER" horzAlign="CENTER" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`,
  };
}

// 테두리 박스 셀 1개. 사진 없는(padding) 칸은 테두리 없이(borderFill=1).
function boxCell(col, row, picXmlStr, cellH) {
  let c = PHOTO_TPL.PHOTO_CELL;
  c = c.split("{{COL}}").join(col).split("{{ROW}}").join(row).split("{{PIC}}").join(picXmlStr);
  c = c.replace(/<hp:cellSz width="\d+" height="\d+"\/>/, `<hp:cellSz width="${CELL_W}" height="${cellH}"/>`);
  if (!picXmlStr) c = c.replace('borderFillIDRef="23"', 'borderFillIDRef="1"'); // 빈 칸: 테두리 없음
  return c;
}

// photos: [{idref, pw, ph}] → 시설 내용칸에 넣을 "테두리 박스 사진표"를 담은 문단
export function buildCellPhotos(photos) {
  if (!photos || !photos.length) return "";
  const N = photos.length;
  const cols = Math.min(N, PER_ROW);
  const rowN = Math.ceil(N / cols);
  let rowsXml = "", totalH = 0;
  for (let r = 0; r < rowN; r++) {
    let rowMaxH = 0;
    const picStrs = [];
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < N) {
        const g = picXml(photos[idx].idref, photos[idx].pw, photos[idx].ph);
        if (g.dispH > rowMaxH) rowMaxH = g.dispH;
        picStrs.push(g.xml);
      } else picStrs.push("");
    }
    const cellH = rowMaxH + 300;
    totalH += cellH;
    let cells = "";
    for (let c = 0; c < cols; c++) cells += boxCell(c, r, picStrs[c], cellH);
    rowsXml += "<hp:tr>" + cells + "</hp:tr>";
  }
  let head = PHOTO_TPL.TBL_HEAD;
  head = head.split("{{ROWCNT}}").join(rowN).split("{{HEIGHT}}").join(totalH);
  head = head.replace(/colCnt="\d+"/, `colCnt="${cols}"`)
             .replace(/(<hp:sz width=")\d+/, `$1${cols * CELL_W}`);
  const tbl = head + rowsXml + "</hp:tbl>";
  return `<hp:p id="0" paraPrIDRef="22" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${tbl}</hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${totalH}" textheight="${totalH}" baseline="${Math.round(totalH * 0.85)}" spacing="600" horzpos="300" horzsize="48464" flags="393216"/></hp:linesegarray></hp:p>`;
}
