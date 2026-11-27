/* v48.16 tests: safe auto-update + minimum version (run against the current app version).
   Usage: ROOT=/workspace/envss-v4816 node work/v48-16/test.mjs [chromebook|pixel7]   (default: both)
   Two copies of the app are served from one local origin: "old" = this branch (v48.18) and "new" = the same files with the
   version bumped to 48.19 (a pretend next deploy). The test switches which copy the server returns to simulate a publish.
   Supabase is mocked in memory (*.supabase.co mapped to a dead local port, every request answered by the mock), so nothing
   reaches production. Fixture names are made up. Screenshots: OUT (default /workspace/fit-shots/v4816). */
import fs from "fs"; import path from "path"; import http from "http"; import { execSync } from "child_process";
import { launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "../v48-7/harness.mjs";
const SRC = process.env.ROOT || "/workspace/envss-v4816";
const OUT = process.env.OUT || "/workspace/fit-shots/v4816"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 700) : "")); }

/* ---------- two deploys ---------- */
const tmp = "/tmp/v4816-" + process.pid; const OLD = tmp + "/old", NEW = tmp + "/new";
const FILES = ["field.html", "sw-field.js", "noise.js", "config.js", "fit-test.js", "logo.svg", "vOSog.png", "coc-template.xlsx", "fonts-v38.css", "manifest.json", "icon.svg"];
execSync(`rm -rf ${tmp} && mkdir -p ${OLD}/work/projlist ${NEW}/work/projlist`);
for (const d of [OLD, NEW]) { for (const f of FILES) if (fs.existsSync(path.join(SRC, f))) fs.copyFileSync(path.join(SRC, f), path.join(d, f)); fs.copyFileSync(path.join(SRC, "work/projlist/review.js"), path.join(d, "work/projlist/review.js")); }
const bump = f => { const p = path.join(NEW, f); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/48\.18/g, "48.19").replace(/48-18/g, "48-19")); };
["field.html", "sw-field.js", "fit-test.js"].forEach(bump);
const deploy = { root: OLD };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let p = path.join(deploy.root, decodeURIComponent(url.pathname)); if (url.pathname === "/") p = path.join(deploy.root, "field.html");
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end("missing"); return; }
    const ext = path.extname(p);
    const type = ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : ext === ".svg" ? "image/svg+xml" : ext === ".css" ? "text/css" : ext === ".json" ? "application/json" : "application/octet-stream";
    /* GitHub Pages sends max-age=600; mimic it so the test proves a reload is not served a stale HTTP-cached page */
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "max-age=600" }); res.end(buf);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;

/* ---------- static checks ---------- */
const sw = fs.readFileSync(path.join(SRC, "sw-field.js"), "utf8"), html = fs.readFileSync(path.join(SRC, "field.html"), "utf8");
check("sw-field.js is v48.18 with cache envss-field-v48-18", /const VERSION = "48\.18";/.test(sw) && /const CACHE = "envss-field-v48-18";/.test(sw));
check("sw-field.js install no longer calls skipWaiting (an update waits for the page)", !/install[\s\S]{0,900}await self\.skipWaiting\(\)/.test(sw.split('self.addEventListener("activate"')[0]));
check("sw-field.js skips waiting only on the page's SKIP_WAITING message", /d\.type === "SKIP_WAITING"\) self\.skipWaiting\(\)/.test(sw));
check("sw-field.js activate deletes only old envss-field-v* caches (IndexedDB / localStorage / OCR caches untouched)", /k\.startsWith\("envss-field-"\) && k !== CACHE/.test(sw) && !/indexedDB|localStorage/.test(sw.replace(/\/\*[\s\S]*?\*\//g, "")));
check("sw-field.js still refreshes noise.js on its own (no-cache, network first)", /key === NOISE\) \{ event\.respondWith\(networkFirst\(new Request\(NOISE, \{ cache: "no-cache" \}\)/.test(sw));
check("field.html APP_VERSION matches the worker VERSION (the version check reads sw-field.js)", /const APP_VERSION = "48\.18";/.test(html));
check("SQL migration + rollback exist and the migration is marked NOT APPLIED", fs.existsSync(path.join(SRC, "work/settings_v48_16_01_app_settings.sql")) && fs.existsSync(path.join(SRC, "work/settings_v48_16_01_app_settings_rollback.sql")) && /NOT APPLIED/.test(fs.readFileSync(path.join(SRC, "work/settings_v48_16_01_app_settings.sql"), "utf8")));

/* ---------- fixture (Supabase side) ---------- */
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date()); const NOW = new Date().toISOString();
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const person = (first, last) => ({ first, last, sex: "male", sexSet: true, dob: "1985-03-04", dobD: "04", dobM: "03", dobY: "1985", occupation: "Fitter", company: "Acme", hours: "12", daysOn: "8", daysOff: "6" });
const H = (id, n, extra) => Object.assign({ id, eventId: "eU", trainKind: "airborne_personal", mode: "personal", sampleNo: n, pouch: String(n), contaminantId: "INH", pumpSerial: "7710" + n, headId: "IESS6" + n, mediaId: "C-6" + n,
  startFlow: "2.0", endFlow: "", rotameter: "R1", shiftDate: TODAY, shiftKind: "day", status: "prepped", startAt: "", endAt: "", comments: "", commentAsked: "yes", location: "Bay " + n, person: person("Sam", "Update" + n), rpd: {}, hpd: {}, audit: [] }, extra || {});
const row = o => [o.id, { id: o.id, payload: o, updated_at: NOW, updated_by: "Other Device <office@envss.com.au>" }];
function store(min) {
  return {
    envss_projects: new Map([row({ id: "p4816", number: "0019816", name: "v48.16 update test", source: "field", site: "Test site", status: "Active" })]),
    envss_events: new Map([row({ id: "eU", projectId: "p4816", code: "0019816-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] })]),
    envss_trains: new Map([row(H("u1", 1)), row(H("u2", 2, { status: "running", startAt: ago(2) })), row(H("u3", 3))]),
    envss_deletions: new Map(), envss_hires: new Map(), envss_fit_reports: new Map(),
    app_settings: new Map(min === undefined ? [] : [["min_field_app_version", { key: "min_field_app_version", value: min }]])
  };
}

const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
async function boot(vp, st, opts) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); page.ctx = ctx; page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  page.ulog = []; page.on("console", m => { if (/\[ENVSS update\]/.test(m.text())) page.ulog.push(new Date().toISOString().slice(11, 23) + " " + m.text()); });
  page.on("framenavigated", f => { if (f === page.mainFrame()) page.ulog.push(new Date().toISOString().slice(11, 23) + " NAV " + f.url()); });
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); page.mlog = mockSupabase(page, st, opts);
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(base + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload({ waitUntil: "networkidle0" }); await sleep(1500);
  await page.waitForFunction(() => typeof activityLoaded !== "undefined" && activityLoaded, { timeout: 15000 }).catch(() => {});
  /* as in the v48.8 suite: keep the periodic activity pull from re-rendering the screen under the test's clicks (the first pull has run) */
  await page.evaluate(() => { envssUpdate.cfg.idleMs = 800; pullActivity = async function () {}; window.pullActivity = pullActivity; });
  await sleep(500);
  return page;
}
const ver = page => page.evaluate(() => typeof APP_VERSION !== "undefined" ? APP_VERSION : "");
const swVer = page => page.evaluate(() => new Promise(res => { const c = navigator.serviceWorker.controller; if (!c) return res(""); const ch = new MessageChannel(); ch.port1.onmessage = e => res(e.data.version); c.postMessage({ type: "GET_VERSION" }, [ch.port2]); setTimeout(() => res("(old worker: no GET_VERSION)"), 1500); }));
const waitingVer = page => page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r && r.waiting ? r.waiting.scriptURL : ""; });
const storageSnap = page => page.evaluate(async () => ({ ls: Object.keys(localStorage).sort(), idb: indexedDB.databases ? (await indexedDB.databases()).map(d => d.name).sort() : [], caches: (await caches.keys()).sort() }));
const train = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(db.trains.find(x => x.id === i) || null)), id);
async function waitVer(page, v, ms = 30000) { try { await page.waitForFunction(x => typeof APP_VERSION !== "undefined" && APP_VERSION === x, { timeout: ms, polling: 250 }, v); return true; } catch (e) { return false; } }

async function run(vp) {
  const shot = (page, n, full = false) => page.screenshot({ path: path.join(OUT, `${vp}-${n}.png`), fullPage: full });
  /* ===== A: update applies only when safe; edit in progress blocks; queued upload survives ===== */
  deploy.root = OLD;
  const S = store(); const opts = {};
  const page = await boot(vp, S, opts);
  check(`[${vp}] old deploy: app is v48.18 and the v48.18 worker controls the page`, (await ver(page)) === "48.18" && (await swVer(page)) === "48.18", (await ver(page)) + " / " + (await swVer(page)));
  await page.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open("envss-test-marker", 1); r.onupgradeneeded = () => r.result.createObjectStore("m", { keyPath: "id" });
    r.onsuccess = () => { const t = r.result.transaction("m", "readwrite"); t.objectStore("m").put({ id: "keep", v: "before update" }); t.oncomplete = () => { r.result.close(); res(); }; }; r.onerror = () => rej(r.error); }));
  const before = await storageSnap(page);
  check(`[${vp}] project data pulled (3 samples on 0019816-001)`, await page.evaluate(() => db.trains.filter(t => t.eventId === "eU").length === 3));
  let s0 = await page.evaluate(() => envssUpdate.check("test").then(s => ({ pending: s.pending, remote: s.remote, min: s.min, minErr: s.minErr })));
  check(`[${vp}] no new deploy: nothing pending; missing settings row = no minimum (fail open)`, s0.pending === false && s0.remote === "48.18" && s0.min === null && /no row/.test(s0.minErr), JSON.stringify(s0));
  await page.evaluate(() => { openProject("p4816"); }); await sleep(300);
  await shot(page, "01-old-v48-16");

  /* edit in progress */
  await page.evaluate(() => openTrain("u1")); await sleep(400);
  await page.click("#comments"); await page.type("#comments", "Typed during update test", { delay: 15 });
  deploy.root = NEW;   /* publish 48.19 */
  const s1 = await page.evaluate(() => envssUpdate.check("test").then(s => ({ pending: s.pending, remote: s.remote, reasons: envssUpdate.blockers() })));
  await sleep(2500);
  check(`[${vp}] new deploy found (48.19) while typing: update pending, NOT applied (reason: typing)`, s1.pending && s1.remote === "48.19" && s1.reasons.includes("typing") && (await ver(page)) === "48.18", JSON.stringify(s1));
  const w1 = await waitingVer(page);
  check(`[${vp}] the 48.19 worker installed in the background and is waiting; the old worker still controls the page`, !!w1 && (await swVer(page)) === "48.18", w1 + " / " + (await swVer(page)));
  check(`[${vp}] the typed text is still in the box (nothing reloaded)`, (await page.$eval("#comments", el => el.value)) === "Typed during update test");
  /* focus moved away without the autosave having a chance (e.g. a tap on a non-input area): still "unsaved typing" until change/blur ran */
  const r2 = await page.evaluate(() => envssUpdate.blockers());
  check(`[${vp}] while the box holds unsaved typing the update stays held`, r2.includes("typing") || r2.includes("unsaved typing"), JSON.stringify(r2) + " LOG " + page.ulog.slice(-10).join(" | "));
  await shot(page, "02-edit-in-progress-blocks-update");

  /* queued upload: uploads fail, edit saved on device */
  opts.failTables = ["envss_trains"];
  await page.evaluate(() => document.getElementById("comments").blur()); await sleep(1500);
  const q = await page.evaluate(() => ({ reasons: envssUpdate.blockers(), pend: pendingCount(), ls: localStorage.getItem(KEY).includes("Typed during update test") }));
  check(`[${vp}] after blur the edit is saved on the device and queued; upload failing -> update still held (change to upload)`, q.ls && q.pend >= 1 && q.reasons.some(r => /to upload|uploading/.test(r)), JSON.stringify(q) + " LOG " + page.ulog.slice(-15).join(" | "));
  await page.evaluate(() => envssUpdate.tryApply("test")); await sleep(1500);
  check(`[${vp}] still v48.18 while the change is queued`, (await ver(page)) === "48.18");
  await page.evaluate(() => { view.page = "dash"; render(); }); await sleep(400);
  await shot(page, "03-queued-upload-holds-update");

  /* uploads work again -> flush -> safe -> swap + reload */
  opts.failTables = [];
  const nav = page.waitForNavigation({ timeout: 40000 }).catch(e => null);
  await page.evaluate(() => { envssSync.flushQueue(); });
  await nav; const okV = await waitVer(page, "48.19");
  await sleep(600);
  check(`[${vp}] once the queue uploaded and the screen was idle, the app switched itself to v48.19`, okV, await ver(page));
  const toast = await page.evaluate(() => { const t = document.getElementById("v4816Toast"); return t ? { text: t.textContent, show: t.classList.contains("show") } : null; });
  check(`[${vp}] toast after the reload: 'Updated to v48.19'`, toast && toast.show && toast.text === "Updated to v48.19", JSON.stringify(toast));
  await shot(page, "04-updated-toast");
  check(`[${vp}] the new worker controls the page (48.19)`, (await swVer(page)) === "48.19", await swVer(page));
  const remoteRow = S.envss_trains.get("u1"); const local = await train(page, "u1");
  check(`[${vp}] queued edit survived: in Supabase (mock) and on the device after the update`, remoteRow && JSON.stringify(remoteRow).includes("Typed during update test") && local && local.comments === "Typed during update test");
  const after = await storageSnap(page);
  const marker = await page.evaluate(() => new Promise(res => { const r = indexedDB.open("envss-test-marker", 1); r.onsuccess = () => { const q = r.result.transaction("m").objectStore("m").get("keep"); q.onsuccess = () => res(q.result ? q.result.v : null); q.onerror = () => res(null); }; r.onerror = () => res(null); }));
  check(`[${vp}] an IndexedDB record written before the update is still there after it`, marker === "before update", String(marker));
  check(`[${vp}] no localStorage key lost; IndexedDB databases unchanged`, before.ls.every(k => after.ls.includes(k)) && JSON.stringify(before.idb) === JSON.stringify(after.idb), JSON.stringify({ before, after }));
  check(`[${vp}] caches: envss-field-v48-19 present, old envss-field-v48-18 dropped`, after.caches.includes("envss-field-v48-19") && !after.caches.includes("envss-field-v48-18"), after.caches.join(","));
  check(`[${vp}] address bar cleaned (no ?u=) and update flag cleared`, await page.evaluate(() => !/[?&]u=/.test(location.search) && !localStorage.getItem(envssUpdate.flagKey)));
  const s2 = await page.evaluate(() => envssUpdate.check("test").then(s => ({ pending: s.pending, remote: s.remote })));
  check(`[${vp}] after the update nothing is pending (no reload loop)`, s2.pending === false && s2.remote === "48.19", JSON.stringify(s2));

  /* other blockers (unit level, on the updated page) */
  const b = await page.evaluate(async () => {
    const out = {};
    view.page = "newEvent"; render(); out.form = envssUpdate.blockers(); view.page = "dash"; render();
    const ev = db.events.find(e => e.id === "eU"); const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    ev.noiseCal = { [day]: { start: { ref: "94.0", reading: "" } } }; out.cal = envssUpdate.blockers(); ev.noiseCal[day].start.reading = "93.9"; out.calDone = envssUpdate.blockers(); delete ev.noiseCal;
    const d = document.createElement("div"); d.className = "v483-modal"; d.innerHTML = '<div role="dialog" aria-modal="true">x</div>'; document.body.appendChild(d); out.modal = envssUpdate.blockers(); d.remove();
    const g = navigator.geolocation.getCurrentPosition; navigator.geolocation.getCurrentPosition = (ok) => setTimeout(() => ok({ coords: { latitude: -31.95, longitude: 115.86, accuracy: 5 } }), 1200);
    const p = captureLocation(); out.loc = envssUpdate.blockers(); await p; out.locDone = envssUpdate.blockers(); navigator.geolocation.getCurrentPosition = g;
    return out;
  });
  check(`[${vp}] blocker: new-event form open`, b.form.some(r => /form open/.test(r)), JSON.stringify(b.form));
  check(`[${vp}] blocker: half-entered noise calibration (cleared when both values are in)`, b.cal.some(r => /calibration/.test(r)) && !b.calDone.some(r => /calibration/.test(r)), JSON.stringify([b.cal, b.calDone]));
  check(`[${vp}] blocker: dialog open`, b.modal.includes("dialog open"), JSON.stringify(b.modal));
  check(`[${vp}] blocker: START/STOP location fix in flight (cleared when it returns)`, b.loc.includes("START/STOP being saved") && !b.locDone.includes("START/STOP being saved"), JSON.stringify([b.loc, b.locDone]));
  check(`[${vp}] no page errors (update run)`, page.errs.length === 0, page.errs.join(" | "));
  await page.ctx.close();

  /* ===== B: minimum version gate ===== */
  deploy.root = OLD;
  const S2 = store("48.19"); const o2 = {};
  const g = await boot(vp, S2, o2);
  let m0 = await g.evaluate(() => envssUpdate.check("test").then(s => ({ forced: s.forced, min: s.min, remote: s.remote, banner: !!document.getElementById("v4816Banner") })));
  check(`[${vp}] min 48.19 but only 48.18 is published: nothing blocked (fail open, cannot update yet)`, m0.min === "48.19" && m0.remote === "48.18" && !m0.forced && !m0.banner, JSON.stringify(m0));
  deploy.root = NEW;
  o2.failTables = ["envss_trains"];   /* keeps the update from applying: a change cannot upload */
  await g.evaluate(() => { openTrain("u3"); }); await sleep(300);
  await g.click("#comments"); await g.type("#comments", "Queued before gate", { delay: 10 }); await g.evaluate(() => document.getElementById("comments").blur()); await sleep(1200);
  await g.evaluate(() => { openProject("p4816"); }); await sleep(300);
  m0 = await g.evaluate(() => envssUpdate.check("test").then(s => ({ forced: s.forced, min: s.min, remote: s.remote, reasons: envssUpdate.blockers(), banner: (document.getElementById("v4816Banner") || {}).textContent || "" })));
  await sleep(800);
  check(`[${vp}] below the minimum, online, 48.19 published: forced update path + banner (says why it is waiting)`, m0.forced && /Update needed/.test(m0.banner) && /v48\.19 or newer is required/.test(m0.banner) && /Waiting for: .*to upload/.test(m0.banner) && (await ver(g)) === "48.18", JSON.stringify(m0));
  await g.evaluate(() => window.scrollTo(0, 0)); await sleep(200);
  await shot(g, "05-min-version-banner");
  await g.evaluate(() => openEvent("eU")); await sleep(400);
  const nBefore = await g.evaluate(() => db.trains.filter(t => t.eventId === "eU").length);
  const addSel = await g.evaluate(() => { const vis = el => el && (el.offsetWidth || el.offsetHeight); const a = document.getElementById("btnAddSampleTop"), f = document.querySelector(".fab"), n = document.querySelector('[data-go="add"]'); return vis(a) ? "#btnAddSampleTop" : vis(f) ? ".fab" : vis(n) ? '[data-go="add"]' : ""; });
  if (addSel) await g.click(addSel).catch(() => {}); await sleep(500);
  const nAfter = await g.evaluate(() => db.trains.filter(t => t.eventId === "eU").length);
  const pageAfterAdd = await g.evaluate(() => view.page);
  const tst = await g.evaluate(() => (document.getElementById("v4816Toast") || {}).textContent || "");
  check(`[${vp}] gate: adding a sample is blocked (${addSel || "no add button found"}) with a toast; nothing added`, !!addSel && nAfter === nBefore && /Blocked until the app updates/.test(tst), JSON.stringify({ addSel, nBefore, nAfter, tst, pageAfterAdd, dialogs: g.dialogs }));
  check(`[${vp}] gate: nothing opened by the blocked add (still on the event screen)`, pageAfterAdd === "event", pageAfterAdd);
  await shot(g, "06-min-version-add-blocked");
  await g.evaluate(() => openTrain("u1")); await sleep(400);
  if (await g.$("#btnStart")) await g.click("#btnStart"); await sleep(500);
  const u1 = await train(g, "u1");
  check(`[${vp}] gate: START on a prepped sample is blocked`, !u1.startAt && u1.status === "prepped", JSON.stringify({ s: u1.status, a: u1.startAt }));
  await shot(g, "07-min-version-start-blocked");
  await g.evaluate(() => openTrain("u2")); await sleep(400);
  if (await g.$("#btnStop")) await g.click("#btnStop"); await sleep(900);
  for (let i = 0; i < 4; i++) {   /* answer the STOP dialogs a tech would see (Chromebook laptop reminder, flow deviation) */
    const clicked = await g.evaluate(() => { const no = document.getElementById("v488No"); if (no) { no.click(); return "v488No"; }
      const got = Array.from(document.querySelectorAll(".v483-modal button")).find(b => /Got it/i.test(b.textContent)); if (got) { got.click(); return "Got it"; } return ""; });
    if (!clicked) break; await sleep(500);
  }
  const u2 = await train(g, "u2");
  check(`[${vp}] gate: STOP on a running sample still works (already-captured work can be finished)`, !!u2.endAt, JSON.stringify({ s: u2.status, e: u2.endAt, dialogs: g.dialogs }));
  const viewOk = await g.evaluate(() => { openTrain("u3"); return view.page === "train" && view.trainId === "u3"; });
  check(`[${vp}] gate: viewing records still works`, viewOk);
  await g.setOfflineMode(true); await sleep(700);
  const off = await g.evaluate(() => ({ forced: envssUpdate.state().forced, banner: !!document.getElementById("v4816Banner") }));
  check(`[${vp}] offline: gate lifted, device works as normal`, !off.forced && !off.banner, JSON.stringify(off));
  await shot(g, "08-offline-no-gate");
  await g.setOfflineMode(false); await sleep(400);
  const nav2 = g.waitForNavigation({ timeout: 40000 }).catch(() => null);
  o2.failTables = [];
  await g.evaluate(() => { view.page = "dash"; render(); envssUpdate.check("online"); envssSync.flushQueue(); });
  await nav2; const ok2 = await waitVer(g, "48.19"); await sleep(600);
  const fin = await g.evaluate(() => ({ st: (s => ({ reasons: envssUpdate.blockers(), pending: s.pending, log: s.log.slice(-12) }))(envssUpdate.state()), v: APP_VERSION, banner: !!document.getElementById("v4816Banner"), toast: (document.getElementById("v4816Toast") || {}).textContent || "" }));
  check(`[${vp}] back online + queue uploaded -> forced update applied: v48.19, banner gone, toast`, ok2 && !fin.banner && fin.toast === "Updated to v48.19", JSON.stringify(fin));
  const r3 = S2.envss_trains.get("u3");
  check(`[${vp}] the change queued under the gate reached Supabase (mock) and is on the device`, r3 && JSON.stringify(r3).includes("Queued before gate") && ((await train(g, "u3")) || {}).comments === "Queued before gate");
  const u2b = S2.envss_trains.get("u2");
  check(`[${vp}] the STOP made under the gate uploaded too`, u2b && u2b.payload && !!u2b.payload.endAt);
  await shot(g, "09-min-version-updated");
  check(`[${vp}] no page errors (gate run)`, g.errs.length === 0, g.errs.join(" | "));
  await g.ctx.close();

  /* ===== C: fail open on a bad / unreadable setting ===== */
  deploy.root = OLD;
  for (const [label, st, o] of [["value 'abc'", store("abc"), {}], ["table missing (404)", store("48.19"), { tableStatus: { app_settings: 404 } }], ["value '0'", store("0"), {}]]) {
    deploy.root = OLD;
    const p = await boot(vp, st, o); deploy.root = NEW;
    const r = await p.evaluate(() => envssUpdate.check("test").then(s => ({ forced: s.forced, min: s.min, minErr: s.minErr })));
    check(`[${vp}] setting ${label}: no minimum, nothing blocked (fail open)`, !r.forced && r.min === null, JSON.stringify(r));
    await p.ctx.close();
  }
}

const which = process.argv[2] ? [process.argv[2]] : ["chromebook", "pixel7"];
for (const vp of which) { try { await run(vp); } catch (e) { check(`[${vp}] run crashed`, false, e.stack); } }
await browser.close(); server.close();
const failed = results.filter(r => !r.ok);
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "test-results.json"), JSON.stringify(results, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
