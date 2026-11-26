/* v48.8 service worker check: cache envss-field-v48-8 holds field.html and work/projlist/review.js; offline reload
   still loads v48.8 with the Layout A project list. Supabase and the CDN are mapped to a dead port.
   Usage: SRC=<checkout> node work/v48-6/sw.mjs [chromebook|pixel7] */
import { execSync } from "child_process";
const src = process.env.SRC || "/workspace/envss-li";
const tmp = "/tmp/v487-swroot-" + process.pid;
execSync(`rm -rf ${tmp} && mkdir -p ${tmp}/work/projlist && cd ${src} && cp field.html sw-field.js noise.js config.js logo.svg vOSog.png coc-template.xlsx fonts-v38.css ${tmp}/ && cp work/projlist/review.js ${tmp}/work/projlist/`);
process.env.ROOT = tmp;
const { serve, launch, VIEWPORTS, sleep, SESSION } = await import("./harness.mjs");
const vp = process.argv[2] || "chromebook";
const { server, base } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9,MAP cdn.jsdelivr.net 127.0.0.1:9"]);
const page = await browser.newPage();
await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
const errs = []; page.on("pageerror", e => errs.push(String(e)));
const res = []; let f = 0; const ok = (n, c, x) => { res.push((c ? "PASS " : "FAIL ") + `[${vp}] ` + n + (x && !c ? " — " + x : "")); if (!c) f++; };
await page.goto(base + "/field.html", { waitUntil: "load" });
await page.evaluate(SESSION);
await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await sleep(2000);
await page.reload({ waitUntil: "load" }); await sleep(1500);
ok("service worker controls field.html", await page.evaluate(() => !!navigator.serviceWorker.controller));
const keys = await page.evaluate(async () => { const n = await caches.keys(); const c = await caches.open("envss-field-v48-8"); return { names: n, urls: (await c.keys()).map(r => r.url.replace(location.origin, "")) }; });
ok("cache is envss-field-v48-8 only", keys.names.filter(k => k.startsWith("envss-field-")).join() === "envss-field-v48-8", keys.names.join());
ok("cache holds field.html and work/projlist/review.js", keys.urls.includes("/field.html") && keys.urls.includes("/work/projlist/review.js"), keys.urls.join(" "));
await page.setOfflineMode(true);
await page.reload({ waitUntil: "load" }).catch(e => errs.push("reload " + e.message)); await sleep(1500);
const off = await page.evaluate(() => ({ app: typeof APP_VERSION !== "undefined" ? APP_VERSION : "", title: document.title, head: (document.getElementById("appVersion") || {}).textContent, plr: !!window.__envssProjlistReview, link: !!window.v486 })).catch(e => ({ err: String(e) }));
ok("offline reload: v48.8 page, header and title, project list (review.js) and linked samples loaded", off.app === "48.8" && off.title === "ENVSS Field v48.8" && off.head === "v48.8" && off.plr && off.link, JSON.stringify(off));
ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
console.log(res.join("\n") + `\n${res.length - f}/${res.length} passed`);
await browser.close(); server.close(); execSync(`rm -rf ${tmp}`); process.exit(f ? 1 : 0);
