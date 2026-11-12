/* ENVSS Field offline worker for field.html (live app, v40+).
   Registered by field.html with scope "./field.html", so it never controls index.html.
   Network-first for the page and its assets, falling back to the cache when offline.
   Supabase API calls are never cached or intercepted. */
const VERSION = "48.1";
const CACHE = "envss-field-v48-1"; /* v48.1: flow check vs own start flow. v48: quick fixes (flow, LAeq, dose-badge UI, toggle jump, rotameter, add confirm, clash, locked sample no). IndexedDB names are unchanged. Rollback: previous cache envss-field-v46. */
const BASE = new URL("./", self.location).href;
const PAGE = BASE + "field.html";
const SAME_ORIGIN_ASSETS = ["field.html", "config.js?v=" + VERSION, "noise.js", "logo.svg", "vOSog.png", "coc-template.xlsx", "fonts-v38.css"].map(p => BASE + p);
const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"
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
    await self.skipWaiting();
  })());
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
    event.respondWith(networkFirst(req, PAGE, 8000));
    return;
  }
  const key = cacheKey(req);
  /* v46: noise.js is refreshed on its own. Online it is always re-checked with the server (no-cache), so a new
     noise.js goes live without a new field.html or a new worker; offline the last good copy is used. */
  if (key === NOISE) { event.respondWith(networkFirst(new Request(NOISE, { cache: "no-cache" }), NOISE, 6000)); return; }
  if (CACHEABLE.has(key)) event.respondWith(networkFirst(req, key, 0));
});
