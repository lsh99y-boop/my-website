// 사진 처리: 브라우저 압축(KB) + 시설 내용칸 안에 사진 문단(텍스트 아래) 생성
const PER_ROW = 3;        // 한 줄에 사진 3장
const PIC_MAXW = 15000;   // 사진 최대 폭(HWPUNIT, ≈53mm)
const PIC_MAXH = 11000;   // 사진 최대 높이

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

// 표시 크기 계산 (비율 유지, maxW/maxH 안에)
function geom(pw, ph, maxW, maxH) {
  let dispW = Math.min(maxW, maxH * pw / ph);
  let dispH = dispW * ph / pw;
  return { dispW: Math.round(dispW), dispH: Math.round(dispH) };
}

function picXml(idref, pw, ph) {
  const { dispW, dispH } = geom(pw, ph, PIC_MAXW, PIC_MAXH);
  const dimW = pw * 75, dimH = ph * 75;
  return {
    dispH,
    xml: `<hp:pic id="1" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="1" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${dispW}" height="${dispH}"/><hp:curSz width="${dispW}" height="${dispH}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${(dispW / 2) | 0}" centerY="${(dispH / 2) | 0}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="${idref}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${dispW}" y="0"/><hc:pt2 x="${dispW}" y="${dispH}"/><hc:pt3 x="0" y="${dispH}"/></hp:imgRect><hp:imgClip left="0" right="${dimW}" top="0" bottom="${dimH}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${dimW}" dimheight="${dimH}"/><hp:effects/><hp:sz width="${dispW}" widthRelTo="ABSOLUTE" height="${dispH}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="142" right="142" top="142" bottom="142"/></hp:pic>`,
  };
}

// photos: [{idref, pw, ph}] → 시설 내용칸에 넣을 사진 문단들(한 줄 PER_ROW장)
export function buildCellPhotos(photos) {
  if (!photos || !photos.length) return "";
  let out = "";
  for (let i = 0; i < photos.length; i += PER_ROW) {
    const group = photos.slice(i, i + PER_ROW);
    let run = "", maxH = 0;
    group.forEach((p, gi) => {
      const g = picXml(p.idref, p.pw, p.ph);
      if (g.dispH > maxH) maxH = g.dispH;
      run += (gi > 0 ? "<hp:t> </hp:t>" : "") + g.xml;
    });
    out += `<hp:p id="0" paraPrIDRef="22" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${run}</hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${maxH}" textheight="${maxH}" baseline="${Math.round(maxH * 0.85)}" spacing="600" horzpos="300" horzsize="48464" flags="393216"/></hp:linesegarray></hp:p>`;
  }
  return out;
}
