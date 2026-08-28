// 장애보고서 hwpx 생성 (브라우저) — 토큰 템플릿(assets/template_fault.hwpx) 채우기 + 사진부 임베드
import JSZip from "https://esm.sh/jszip@3.10.1";

const TEMPLATE_URL = "assets/template_fault.hwpx";
const PIC_MAXW = 22800; // 사진 셀 폭에 맞춤
const PIC_MAXH = 25500;

function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function picXml(idref, pw, ph) {
  let dispW = Math.min(PIC_MAXW, PIC_MAXH * pw / ph);
  let dispH = dispW * ph / pw;
  dispW = Math.round(dispW); dispH = Math.round(dispH);
  const dimW = pw * 75, dimH = ph * 75;
  return `<hp:pic id="1" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="1" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${dispW}" height="${dispH}"/><hp:curSz width="${dispW}" height="${dispH}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${(dispW / 2) | 0}" centerY="${(dispH / 2) | 0}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="${idref}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${dispW}" y="0"/><hc:pt2 x="${dispW}" y="${dispH}"/><hc:pt3 x="0" y="${dispH}"/></hp:imgRect><hp:imgClip left="0" right="${dimW}" top="0" bottom="${dimH}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${dimW}" dimheight="${dimH}"/><hp:effects/><hp:sz width="${dispW}" widthRelTo="ABSOLUTE" height="${dispH}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="CENTER" horzAlign="CENTER" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`;
}

// c: 사례 {title,authors,fault_date,office,dept,site,equipment,model,symptom,action,detail1,detail2,plan,attachment,sub1,sub2}
// photos: [{idref,bytes,w,h,caption}] (최대 8장; 앞 4장→소제목1 격자, 다음 4장→소제목2 격자)
export async function buildFaultReport(c, photos = []) {
  const buf = await fetch(TEMPLATE_URL).then((r) => {
    if (!r.ok) throw new Error("보고서 양식을 불러오지 못했습니다: " + r.status);
    return r.arrayBuffer();
  });
  const zip = await JSZip.loadAsync(buf);
  let sec = await zip.file("Contents/section0.xml").async("string");
  let hpf = await zip.file("Contents/content.hpf").async("string");

  const header = [c.authors, c.fault_date].filter(Boolean).join("        ");
  const dept = c.dept || `${c.office || ""}방송총국 기술국`;
  const chong = dept.replace(/\s*기술국\s*$/, "");
  const map = {
    "부서": dept, "총국": chong, "제목": c.title || "", "머리글": header,
    "대상시설": c.site || "", "장비명": c.equipment || "", "모델명": c.model || "",
    "증상": c.symptom || "", "조치": c.action || "", "세부1": c.detail1 || "", "세부2": c.detail2 || "",
    "향후계획": c.plan || "", "첨부": c.attachment || "",
    "소제목1": c.sub1 || "", "소제목2": c.sub2 || "",
  };
  for (const k in map) sec = sec.split(`{{${k}}}`).join(esc(map[k]));

  // 사진 임베드 (앞 8장, 격자당 4장)
  const bin = [], manifest = [];
  (photos || []).slice(0, 8).forEach((p, i) => {
    const g = Math.floor(i / 4), n = i % 4;
    const idref = "fp" + i;
    bin.push({ arc: `BinData/${idref}.jpg`, bytes: p.bytes });
    manifest.push(`<opf:item id="${idref}" href="BinData/${idref}.jpg" media-type="image/jpeg" isEmbeded="1"/>`);
    sec = sec.split(`{{PIC_${g}_${n}}}`).join(picXml(idref, p.w, p.h));
    sec = sec.split(`{{CAP_${g}_${n}}}`).join(esc(p.caption || ""));
  });
  // 남은 사진/캡션/필드 토큰 제거
  sec = sec.replace(/\{\{[^}]+\}\}/g, "");
  if (manifest.length) hpf = hpf.replace('<opf:item id="header"', manifest.join("") + '<opf:item id="header"');

  // 재조립 (mimetype 맨 앞·무압축)
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
  for (const b of bin) out.file(b.arc, b.bytes, { compression: "STORE" });
  return await out.generateAsync({ type: "blob" });
}
