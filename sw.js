const CACHE = "envss-field-sw-50";
const ASSETS = ["./index.html", "./styles.css", "./config.js", "./manifest.json", "./logo.svg", "./vOSog.png", "./catalogs-srs.js", "./app-fibre.js", "./app-fibre-v38.js", "./app-fibre-v39.js", "./app-fibre-v40.js", "./app-fibre-v41.js", "./app-fibre-v42.js", "./app-fibre-v43.js", "./app-fibre-v44.js", "./app-fibre-v45.js", "./app-fibre-v46.js", "./app-fibre-v47.js", "./app-fibre-v48.js", "./app-fibre-v49.js", "./app-fibre-v50.js"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match("./index.html")))
  );
});
