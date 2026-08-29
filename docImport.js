// 원본 문서(PDF/HWPX) 업로드용 — 용량 축소(재렌더/재압축) + 검색용 텍스트 추출
import JSZip from "https://esm.sh/jszip@3.10.1";
import * as pdfjsLib from "https://esm.sh/pdfjs-dist@4.7.76/build/pdf.min.mjs";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";

function decodeXml(s) {
  return (s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

// bytes(JPEG) → 리사이즈+재압축 JPEG bytes. 더 커지면 원본 유지.
async function recompressJpegBytes(bytes, maxW, quality) {
  const blob = new Blob([bytes], { type: "image/jpeg" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    const scale = Math.min(1, maxW / img.width);
    const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.getContext("2d").drawImage(img, 0, 0, w, h);
    const out = await new Promise((res) => cv.toBlob(res, "image/jpeg", quality));
    const nb = new Uint8Array(await out.arrayBuffer());
    return nb.length < bytes.length ? nb : bytes;
  } catch (e) { return bytes; } finally { URL.revokeObjectURL(url); }
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("render timeout")), ms))]);

// ===== PDF: 페이지를 이미지로 재렌더해 압축 + 텍스트 추출 =====
// 렌더 실패/지연 시엔 원본을 그대로 저장(텍스트는 항상 추출) → 절대 멈추지 않음
export async function compressPdf(file, { dpi = 150, quality = 0.6 } = {}) {
  const buf = await file.arrayBuffer();
  const original = () => new Blob([buf], { type: "application/pdf" });
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data: buf.slice(0),
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/cmaps/",
      cMapPacked: true,
    }).promise;
  } catch (e) {
    return { blob: original(), text: "", ext: "pdf", contentType: "application/pdf" };
  }

  // 1) 텍스트 추출 (렌더와 무관, 빠름)
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    try { const p = await pdf.getPage(i); const tc = await p.getTextContent(); text += tc.items.map((it) => it.str).join(" ") + "\n"; } catch (e) {}
  }

  // 2) 렌더 압축 (실패/지연 시 원본 유지)
  try {
    const scale = dpi / 72;
    let out = null;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale });
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.floor(vp.width)); cv.height = Math.max(1, Math.floor(vp.height));
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      await withTimeout(page.render({ canvasContext: ctx, viewport: vp }).promise, 25000);
      const jpg = cv.toDataURL("image/jpeg", quality);
      const pw = vp.width / scale, ph = vp.height / scale;
      const orient = pw > ph ? "l" : "p";
      if (!out) out = new jsPDF({ unit: "pt", format: [pw, ph], orientation: orient });
      else out.addPage([pw, ph], orient);
      out.addImage(jpg, "JPEG", 0, 0, pw, ph);
    }
    let blob = out.output("blob");
    if (blob.size >= buf.byteLength) blob = original(); // 이미 잘 압축된 PDF면 원본
    return { blob, text: text.trim(), ext: "pdf", contentType: "application/pdf" };
  } catch (e) {
    return { blob: original(), text: text.trim(), ext: "pdf", contentType: "application/pdf" };
  }
}

// ===== HWPX: 내부 JPEG 이미지 재압축(제자리) + 텍스트 추출 =====
export async function compressHwpx(file, { maxW = 1400, quality = 0.6 } = {}) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const paths = [];
  zip.forEach((p, f) => { if (!f.dir) paths.push(p); });

  // 텍스트 추출 (section*.xml 의 <hp:t>)
  let text = "";
  for (const p of paths) {
    if (/Contents\/section\d+\.xml$/i.test(p)) {
      const xml = await zip.file(p).async("string");
      const ts = [...xml.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((m) => decodeXml(m[1]));
      text += (ts.length ? ts.join(" ") : xml.replace(/<[^>]+>/g, " ")) + "\n";
    }
  }

  // 재압축 rezip (mimetype 먼저 STORE)
  const out = new JSZip();
  const hasMime = paths.includes("mimetype");
  if (hasMime) out.file("mimetype", await zip.file("mimetype").async("uint8array"), { compression: "STORE" });
  for (const p of paths) {
    if (p === "mimetype") continue;
    const bytes = await zip.file(p).async("uint8array");
    if (/^BinData\/.*\.(jpe?g)$/i.test(p)) {
      const nb = await recompressJpegBytes(bytes, maxW, quality);
      out.file(p, nb, { compression: "STORE" });
    } else {
      out.file(p, bytes, { compression: "DEFLATE" });
    }
  }
  let blob = await out.generateAsync({ type: "blob", mimeType: "application/haansofthwpml+zip" });
  if (blob.size >= file.size) blob = file; // 줄지 않으면(이미지 없음 등) 원본 유지
  return { blob, text: text.trim(), ext: "hwpx", contentType: "application/haansofthwpml+zip" };
}

// 확장자로 분기
export async function compressDoc(file, opts = {}) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return compressPdf(file, opts);
  if (name.endsWith(".hwpx")) return compressHwpx(file, opts);
  throw new Error("PDF 또는 HWPX 파일만 올릴 수 있어요 (.hwp 구버전은 미지원)");
}
