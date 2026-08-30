// KBS 일일업무일지 PWA 서비스워커 — 네트워크 우선 + 오프라인 캐시 폴백
const CACHE = "ilji-v14";
const SHELL = [
  "./", "./index.html", "./daily.html", "./cases.html", "./help.html", "./analysis.html", "./ai.html",
  "./hwpx.js", "./photo.js", "./storage.js", "./photoStorage.js",
  "./sites.js", "./faultCases.js", "./faultReport.js", "./supabaseClient.js", "./aiSearch.js",
  "./daylog-templates.js", "./docImport.js", "./docStorage.js",
  "./assets/template_daylog.hwpx", "./assets/template_fault.hwpx",
  "./icons/icon-192.png", "./icons/icon-512.png", "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase·CDN 등 외부는 네트워크 그대로

  // 네트워크 우선(최신 유지), 실패 시 캐시 → 없으면 앱 셸
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((r) => r || (req.mode === "navigate" ? caches.match("./index.html") : undefined))
      )
  );
});
