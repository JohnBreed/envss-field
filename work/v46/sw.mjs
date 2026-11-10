/* service worker + independent noise.js refresh + offline reload. Supabase unreachable (host mapped to a dead port). */
import fs from "fs"; import { execSync } from "child_process";
const tmp = "/tmp/v46-swroot-" + process.pid; execSync(`rm -rf ${tmp} && mkdir -p ${tmp} && cd ${process.env.SRC || "/workspace/envss-field"} && cp field.html sw-field.js noise.js config.js logo.svg vOSog.png coc-template.xlsx fonts-v38.css ${tmp}/ 2>/dev/null || true`);
process.env.ROOT = tmp;
const { serve, launch, VIEWPORTS, sleep, SESSION } = await import("./harness.mjs");
const vp = process.argv[2] || "chromebook";
const { server, base } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9,MAP cdn.jsdelivr.net 127.0.0.1:9"]);
const page = await browser.newPage();
await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
const errs = []; page.on("pageerror", e => errs.push(String(e)));
const res = []; let f = 0; const ok = (n, c, x) => { res.push((c ? "PASS " : "FAIL ") + n + (x ? " — " + x : "")); if (!c) f++; };
await page.goto(base + "/field.html", { waitUntil: "load" });
await page.evaluate(SESSION);
await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await sleep(1500);
await page.reload({ waitUntil: "load" }); await sleep(1500);
const ctl = await page.evaluate(() => !!navigator.serviceWorker.controller);
ok("service worker controls field.html", ctl);
const cached = await page.evaluate(async () => { const c = await caches.open("envss-field-v46"); return (await c.keys()).map(r => r.url.replace(location.origin, "")); });
ok("noise.js cached by the worker", cached.includes("/noise.js"), cached.filter(u => !/^http/.test(u)).join(" "));
const v1 = await page.evaluate(() => ENVSS_NOISE.version);
const NV = /const NOISE_VERSION = "([^"]+)"/.exec(fs.readFileSync(tmp + "/noise.js", "utf8"))[1];
/* ship a new noise.js only (field.html and sw-field.js unchanged) */
fs.writeFileSync(tmp + "/noise.js", fs.readFileSync(tmp + "/noise.js", "utf8").replace('const NOISE_VERSION = "' + NV + '";', 'const NOISE_VERSION = "' + NV + '-test-refresh";'));
await page.reload({ waitUntil: "load" }); await sleep(1200);
const v2 = await page.evaluate(() => ({ v: ENVSS_NOISE.version, app: APP_VERSION }));
ok("new noise.js goes live on next online load without a new field.html or worker", v1 === NV && v2.v === NV + "-test-refresh" && v2.app === "46", JSON.stringify({ v1, v2 }));
/* offline reload: page + noise.js from cache */
await page.setOfflineMode(true);
await page.reload({ waitUntil: "load" }).catch(e => errs.push("reload " + e.message)); await sleep(1500);
const off = await page.evaluate(() => ({ v: ENVSS_NOISE && ENVSS_NOISE.version, app: typeof APP_VERSION !== "undefined" ? APP_VERSION : "", noiseGate: startGaps({ trainKind: "noise_static", contaminantId: "NOISE", person: {} }).join(",") })).catch(e => ({ err: String(e) }));
ok("offline reload works, latest noise.js from cache", off.app === "46" && off.v === NV + "-test-refresh" && off.noiseGate === "Dosimeter serial,Location", JSON.stringify(off));
await page.setOfflineMode(false);
/* noise.js missing: the rest of the app still works, noise cannot start */
fs.unlinkSync(tmp + "/noise.js");
const p2 = await browser.newPage(); await p2.setViewport(VIEWPORTS[vp].viewport);
await p2.setCacheEnabled(false);
const cx = await browser.createBrowserContext(); const p3 = await cx.newPage();
await p3.goto(base + "/field.html", { waitUntil: "load" }); await sleep(1200);
const miss = await p3.evaluate(() => ({ loaded: !!(window.ENVSS_NOISE), gate: startGaps({ trainKind: "noise_static", contaminantId: "NOISE", person: {} }).join(","), air: startGaps({ trainKind: "airborne_static", person: {} }).length, app: APP_VERSION }));
ok("if noise.js fails to load: noise blocked with a reload note, airborne unaffected", !miss.loaded && /Noise module/.test(miss.gate) && miss.air === 6 && miss.app === "46", JSON.stringify(miss));
ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
console.log(`== sw ${vp} ==\n` + res.join("\n") + `\n${res.length - f}/${res.length} passed`);
await browser.close(); server.close(); process.exit(f ? 1 : 0);
