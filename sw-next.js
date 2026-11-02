/* Retired: field-next.html now forwards to field.html. This worker removes its own caches and unregisters itself. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k.indexOf("envss-field-next-") === 0; }).map(function (k) { return caches.delete(k); }));
    await self.registration.unregister();
    var cs = await self.clients.matchAll({ type: "window" });
    cs.forEach(function (c) { try { c.navigate(c.url); } catch (e) {} });
  })());
});
