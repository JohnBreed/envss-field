/* ENVSS Field offline worker for field.html (live app, v40+).
   Registered by field.html with scope "./field.html", so it never controls index.html.
   Network-first for the page and its assets, falling back to the cache when offline.
   Supabase API calls are never cached or intercepted. */
const VERSION = "48.17";
const CACHE = "envss-field-v48-17"; /* v48.17: photo Drive-status badge wording. v48.16: safe auto-update. The new worker no longer calls skipWaiting on install; it waits until field.html says it is safe (message SKIP_WAITING), and navigations revalidate with the server (cache: no-cache) so the reload gets the new page, not a 10-minute HTTP-cached copy. Only old envss-field-v* caches are dropped on activate; IndexedDB, localStorage and the OCR caches are never touched. v48.15: "Checked Podio … · last Podio change …" status. v48.14: auto-create hygiene field events from Podio (item 11). v48.13: technician electronic sign-off from Google sign-in (individual signs on the phone), fit-test How-to link, single Drive copy, standalone fit event, Fit-Tests Drive folder, offline on-device OCR (Tesseract assets live in their own "envss-ocr-tesseract-*" cache, managed by fit-test.js, not deleted here); fit-test.js?v= is now precached so fit testing loads offline. v48.12: closer TSI-layout fit-test PDF + branded header. v48.11: TSI-layout OCR + TSI-style PDF (no photo page). v48.10: Vision box OCR + IndexedDB fit photos. v48.9: respirator fit testing. v48.8: end flow prefill + STOP deviation prompt. v48.7: Linked Sample A, B, … at prep; work/projlist/review.js (project list, v48.6) added to the offline cache. v48.6: project list Layout A. v48.5: AFM pull is every event at Podio Report not sent. v48.4: next / previous arrows on sample and event screens. v48.3: time capture lock + COC / complete gate. v48.2: AFM field-app + live checks. v48.1: flow check vs own start flow. v48: quick fixes (flow, LAeq, dose-badge UI, toggle jump, rotameter, add confirm, clash, locked sample no). IndexedDB names are unchanged. Rollback: previous cache envss-field-v46. */
const BASE = new URL("./", self.location).href;
const PAGE = BASE + "field.html";
const SAME_ORIGIN_ASSETS = ["field.html", "config.js?v=" + VERSION, "noise.js", "fit-test.js", "fit-test.js?v=" + VERSION, "logo.svg", "vOSog.png", "coc-template.xlsx", "fonts-v38.css", "work/projlist/review.js"].map(p => BASE + p);
const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js",
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.2/dist/jszip.min.js"
];
const CACHEABLE = new Set(SAME_ORIGIN_ASSETS.concat(CDN_ASSETS));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SAME_ORIGIN_ASSETS.concat(CDN_ASSETS).map(async url => {
      try {
        const cross = !url.startsWith(BASE);
        const res = await fetch(new Request(url, { cache: "reload", mode: cross ? "no-cors" : "same-origin" }));
        if (res.ok || res.type === "opaque") await cache.put(url, res);
      } catch (e) { /* best effort: cached on first successful use instead */ }
    }));
    /* v48.16: no skipWaiting here. A first install activates straight away (no page to protect); an update waits until
       field.html posts SKIP_WAITING when nothing is being edited or uploaded (or every field.html tab is closed). */
  })());
});
self.addEventListener("message", event => {
  const d = event.data || {};
  if (d.type === "SKIP_WAITING") self.skipWaiting();
  else if (d.type === "GET_VERSION" && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION, cache: CACHE });
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("envss-field-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
const NOISE = BASE + "noise.js";
function cacheKey(req) {
  const u = new URL(req.url);
  if (u.href.startsWith(PAGE)) return PAGE;          // field.html?anything -> one cached copy
  if (u.href.startsWith(NOISE)) return NOISE;        // noise.js?anything -> one cached copy
  return u.href;
}
async function networkFirst(req, key, timeoutMs) {
  const cache = await caches.open(CACHE);
  try {
    const res = await (timeoutMs
      ? Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))])
      : fetch(req));
    if (res && (res.ok || res.type === "opaque")) cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const hit = await cache.match(key) || await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = req.url;
  if (url.includes(".supabase.co/")) return;
  if (req.mode === "navigate" || url.startsWith(PAGE)) {
    /* v48.16: revalidate the page with the server so an update reload never gets a stale HTTP-cached field.html */
    event.respondWith(networkFirst(req.mode === "navigate" ? new Request(url, { cache: "no-cache", credentials: "same-origin" }) : req, PAGE, 8000));
    return;
  }
  const key = cacheKey(req);
  /* v46: noise.js is refreshed on its own. Online it is always re-checked with the server (no-cache), so a new
     noise.js goes live without a new field.html or a new worker; offline the last good copy is used. */
  if (key === NOISE) { event.respondWith(networkFirst(new Request(NOISE, { cache: "no-cache" }), NOISE, 6000)); return; }
  if (CACHEABLE.has(key)) event.respondWith(networkFirst(req, key, 0));
});
