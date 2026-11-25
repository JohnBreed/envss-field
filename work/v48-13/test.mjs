/* v48.13 browser tests: standalone fit event (no hygiene picker), Fit-Tests Drive name, offline on-device OCR fallback.
   Usage: ROOT=<repo> OUT=/workspace/fit-shots/v4813 [REAL_PHOTO=/path/to/tsi.jpg] node work/v48-13/test.mjs [pixel7|chromebook]
   Supabase and Vision are mocked in memory (no production writes). The real Tesseract run downloads the pinned
   Tesseract.js assets from jsDelivr once, then reads REAL_PHOTO with the browser offline. Fixture names are made up. */
import fs from "fs"; import path from "path"; import os from "os";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION, root as REPO } from "../v48-9/harness.mjs";
import { fieldChecks } from "./expect.mjs";
const OUT = process.env.OUT || "/workspace/fit-shots/v4813"; fs.mkdirSync(OUT, { recursive: true });
const REAL = process.env.REAL_PHOTO || "";
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 700) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date());
const DEVICE_FX = JSON.parse(fs.readFileSync(path.join(REPO, "work/v48-13/fixtures/tesseract-tsi-reference-2000-psm11.json"), "utf8"));
const VISION_TEXT = `FIT TEST REPORT 25/11/2026
ID NUMBER VISION1
LAST NAME Breed
FIRST NAME John
COMPANY ENVSS
LOCATION Various
TEST DATE 25/11/2026 10:45
DUE DATE 25/11/2027
PORTACOUNT S/N 8048192704
N95-COMPANION Yes
MANUFACTURER 3M
MODEL Aura 9322A+
PROTOCOL OSHA FAST-FILTERING FACE
PASS LEVEL 100
EXERCISE DURATION FIT FACTOR PASS
BENDING OVER 50 200+ Yes
TALKING 30 200+ Yes
HEAD SIDE TO SIDE 30 200+ Yes
HEAD UP AND DOWN 30 200+ Yes
OVERALL FF 200+ Yes
FITTEST OPERATOR EA
NAME John Breed`;

function fixture() {
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }], pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p4813", number: "0019913", name: "v48.13 fit-test", source: "field", site: "Test site" }],
    events: [
      { id: "eH", projectId: "p4813", code: "0019913-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      /* Legacy v48.9–v48.12 payload: parentEventId must simply be ignored. */
      { id: "eFit", projectId: "p4813", code: "0019913-FIT-001", type: "fit", date: TODAY, stage: "planned", parentEventId: "eH", audit: [] }
    ],
    trains: [{ id: "h1", eventId: "eH", trainKind: "airborne_personal", mode: "personal", sampleNo: 1, pouch: "1", contaminantId: "INH", status: "prepped", person: { first: "Sam", last: "Tester" }, rpd: {}, audit: [] }],
    hires: [], fitReports: [], deletions: []
  };
}
/* Blank 2000x1125 JPEG: the mocked reader returns words recorded at that size, so page size must match. */
const TINY = process.env.BLANK_JPEG || path.join(os.tmpdir(), "v4813-blank-2000.jpg");
if (!fs.existsSync(TINY)) throw new Error("Make a blank 2000x1125 JPEG at " + TINY + " (e.g. PIL Image.new('RGB',(2000,1125),'white'))");

const { server, base: url } = await serve();
const browser = await launch();

async function boot(vp) {
  /* Fresh context per page: no shared HTTP cache / Cache Storage between runs (a real Tesseract download must not leak into a mocked run). */
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); page.ctx = ctx; page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true);
  const store = { ocrStatus: 200, ocrBody: { text: VISION_TEXT } };
  page.store = store; page.mlog = mockSupabase(page, store, {});
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  const fx = fixture(); await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); }, fx);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(async () => { try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } catch (e) {} });
  await page.evaluate(async () => { for (const k of await caches.keys()) if (k.startsWith("envss-ocr-")) await caches.delete(k); });
  await page.evaluate(d => {
    db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains));
    db.fitReports = []; db.catalogs = Object.assign(db.catalogs || {}, d.catalogs);
    persist(); pullActivity = async function () {}; window.pullActivity = pullActivity;
  }, fx);
  await sleep(300); return page;
}
async function uploadPhoto(page, file) {
  await page.evaluate(() => { view.fitScreen = ""; view.fitReportId = ""; openEvent("eFit"); }); await sleep(400);
  const before = await page.evaluate(() => db.fitReports.length);
  const inp = await page.$("#fitNewPhoto"); await inp.uploadFile(file);
  for (let i = 0; i < 600; i++) {
    const st = await page.evaluate(n => { const r = db.fitReports[n]; return r ? r.ocrStatus : ""; }, before);
    if (st && st !== "running" && await page.$("#fitConfirm")) break;
    await sleep(500);
  }
  await sleep(300);
  return page.evaluate(n => JSON.parse(JSON.stringify(db.fitReports[n] || null)), before);
}
async function mockTesseract(page) {
  await page.evaluate(async (fx) => {
    const A = envssFit.tesseractAssets;
    const c = await caches.open(A.cache);
    for (const u of [A.lib, A.worker, A.coreSimd, A.core, A.lang]) await c.put(u, new Response("/* test stand-in */", { headers: { "Content-Type": "text/javascript" } }));
    const blocks = [{ paragraphs: [{ lines: [{ words: fx.words.map(w => ({ text: w.t, confidence: w.c, bbox: { x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 } })) }] }] }];
    window.__tess = { created: 0, terminated: 0 };
    window.Tesseract = { createWorker: async (lang, oem, opts) => {
      window.__tess.created++; window.__tess.lang = lang; window.__tess.oem = oem; window.__tess.opts = { workerPath: String(opts.workerPath).slice(0, 5), workerBlobURL: opts.workerBlobURL, langPath: opts.langPath, cacheMethod: opts.cacheMethod };
      return { setParameters: async p => { window.__tess.params = p; }, recognize: async () => ({ data: { text: fx.text, blocks } }), terminate: async () => { window.__tess.terminated++; } };
    } };
  }, DEVICE_FX);
}

async function run(vp) {
  const shot = (page, n, full = false) => page.screenshot({ path: path.join(OUT, `${vp}-${n}.png`), fullPage: full });
  const page = await boot(vp);
  check(`[${vp}] app is v48.13`, await page.evaluate(() => APP_VERSION === "48.13" && document.title === "ENVSS Field v48.13" && envssFit.version === "48.13"), await page.evaluate(() => [APP_VERSION, document.title, envssFit.version].join(" ")));

  await page.evaluate(() => openEvent("eFit")); await sleep(400);
  const ui = await page.evaluate(() => ({ picker: !!document.getElementById("fitParent"), linked: /linked hygiene|hygiene event/i.test(document.getElementById("fitEvent").innerText), /* the v48.4 ‹ previous / next › event arrows are project navigation, not a link */
    hygCode: (document.getElementById("fitEvent").innerText.split("\n").find(l => l.includes("0019913-001") && !/^\s*‹|›\s*$/.test(l)) || ""), add: !!document.getElementById("fitAddReport"), code: document.body.innerText.includes("0019913-FIT-001") }));
  check(`[${vp}] fit event screen has no linked hygiene event picker or hygiene reference`, !ui.picker && !ui.linked && !ui.hygCode && ui.add && ui.code, JSON.stringify(ui));
  check(`[${vp}] legacy parentEventId on an old fit event is ignored (left in data, not shown)`, await page.evaluate(() => eventById("eFit").parentEventId === "eH" && !document.querySelector("[id*=Parent]")));
  await shot(page, "01-fit-event-no-picker");

  await page.evaluate(() => openNewEvent("p4813")); await sleep(300);
  const form = await page.evaluate(() => { const s = document.getElementById("ntype"); s.value = "fit"; toggleEventTypeFields(); const box = document.getElementById("fitEventFields"); return { opt: !!s.querySelector("option[value=fit]"), shown: box && box.style.display !== "none", text: box ? box.innerText : "" }; });
  check(`[${vp}] new-event form offers Respirator fit testing with no hygiene wording`, form.opt && form.shown && /FIT-001/.test(form.text) && !/hygiene|link/i.test(form.text), JSON.stringify(form));
  const created = await page.evaluate(() => { const ev = createEvent(); return ev ? JSON.parse(JSON.stringify(ev)) : null; });
  check(`[${vp}] new fit event is {job}-FIT-002 with no parentEventId`, created && created.code === "0019913-FIT-002" && created.type === "fit" && !("parentEventId" in created), JSON.stringify(created));
  const hygUntouched = await page.evaluate(() => { const h = eventById("eH"); return h.type === "hygiene" && !("parentEventId" in h) && db.trains.length === 1; });
  check(`[${vp}] hygiene event untouched`, hygUntouched);
  check(`[${vp}] Drive subfolder name is Fit-Tests`, await page.evaluate(() => envssFit.driveSubfolder === "Fit-Tests"));

  await mockTesseract(page);
  await page.setOfflineMode(true); await sleep(200);
  check(`[${vp}] browser reports offline`, await page.evaluate(() => navigator.onLine === false));
  page.mlog.length = 0;
  const rep = await uploadPhoto(page, TINY);
  const t = await page.evaluate(() => window.__tess);
  check(`[${vp}] offline photo is read on the device (no Vision call)`, rep && rep.ocrSource === "device" && rep.ocrStatus === "ok" && rep.ocrOfflineReason === "offline" && !page.mlog.some(l => l.includes("/functions/v1/")), JSON.stringify({ src: rep && rep.ocrSource, st: rep && rep.ocrStatus, why: rep && rep.ocrOfflineReason, msg: rep && rep.ocrMessage }));
  check(`[${vp}] Tesseract runs eng LSTM, PSM 11, from a blob worker, language from our cache, terminated after`, t && t.lang === "eng" && t.oem === 1 && t.params && t.params.tessedit_pageseg_mode === "11" && t.opts.workerPath === "blob:" && t.opts.workerBlobURL === false && t.opts.cacheMethod === "none" && t.terminated === t.created, JSON.stringify(t));
  const conf = await page.evaluate(() => ({ screen: !!document.getElementById("fitConfirm"), badge: (document.getElementById("fitDeviceBadge") || {}).textContent || "", msg: (document.getElementById("fitOcrMsg") || {}).textContent || "", last: document.getElementById("fitLast").value, first: document.getElementById("fitFirst").value, sn: document.getElementById("fitPorta").value, rows: document.querySelectorAll("[data-fit-ex]").length, sign: !!document.getElementById("fitToSign") }));
  check(`[${vp}] confirm screen is still mandatory and shows "Read on device"`, conf.screen && conf.badge === "Read on device" && /re-read with Google Vision/i.test(conf.msg) && conf.sign, JSON.stringify(conf));
  const acc = fieldChecks(rep, rep.exercises);
  check(`[${vp}] device-read fields filled through the TSI parser (${acc.filter(c => c.ok).length}/${acc.length})`, acc.every(c => c.ok), acc.filter(c => !c.ok).map(c => c.field + "=" + c.got).join("; "));
  check(`[${vp}] photo kept on this device for the Vision re-read`, rep.ocrPendingVision === true && await page.evaluate(async id => !!(await envssFit.loadPending(id)), rep.id));
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(150);
  await shot(page, "02-offline-read-confirm");
  await shot(page, "02-offline-read-confirm-full", true);

  await page.setOfflineMode(false); await sleep(200);
  /* The app's own 'online' listener may also start the re-read; whichever runs first does it, so check state (count 0 or 1). */
  const n1 = await page.evaluate(() => envssFit.rereadPending());
  let r1 = null;
  for (let i = 0; i < 40; i++) { r1 = await page.evaluate(id => JSON.parse(JSON.stringify(db.fitReports.find(r => r.id === id))), rep.id); if (r1.ocrSource === "vision") break; await sleep(250); }
  await sleep(300);
  check(`[${vp}] back online: unedited device read is re-read with Vision`, (n1 === 0 || n1 === 1) && r1.ocrSource === "vision" && r1.idNumber === "VISION1" && r1.ocrPendingVision === false && /Re-read with Google Vision/.test(r1.ocrMessage), JSON.stringify({ n1, src: r1.ocrSource, id: r1.idNumber, p: r1.ocrPendingVision, m: r1.ocrMessage }));
  check(`[${vp}] re-read photo copy removed, badge gone`, !(await page.evaluate(async id => !!(await envssFit.loadPending(id)), rep.id)) && !(await page.$("#fitDeviceBadge")));
  check(`[${vp}] re-read is in the event audit`, await page.evaluate(() => (eventById("eFit").audit || []).some(a => /re-read with Google Vision/i.test(a.action))));
  await shot(page, "03-after-vision-reread");

  await page.setOfflineMode(true); await sleep(200);
  const rep2 = await uploadPhoto(page, TINY);
  await page.evaluate(() => { document.getElementById("fitLast").value = ""; }); await page.type("#fitLast", "Smith"); await sleep(300);
  const r2a = await page.evaluate(id => JSON.parse(JSON.stringify(db.fitReports.find(r => r.id === id))), rep2.id);
  check(`[${vp}] typing in a field cancels the pending Vision re-read`, r2a.fieldsEdited === true && r2a.ocrPendingVision === false && !(await page.evaluate(async id => !!(await envssFit.loadPending(id)), rep2.id)), JSON.stringify({ e: r2a.fieldsEdited, p: r2a.ocrPendingVision }));
  await page.setOfflineMode(false); await sleep(200);
  const n2 = await page.evaluate(() => envssFit.rereadPending()); await sleep(300);
  const r2b = await page.evaluate(id => JSON.parse(JSON.stringify(db.fitReports.find(r => r.id === id))), rep2.id);
  const domLast = await page.evaluate(() => (document.getElementById("fitLast") || {}).value);
  check(`[${vp}] edited report is not re-read (typed value kept, still device read)`, n2 === 0 && r2b.ocrSource === "device" && r2b.idNumber === "ENVSS1" && domLast === "Smith", JSON.stringify({ n2, src: r2b.ocrSource, id: r2b.idNumber, domLast }));
  await page.evaluate(() => { const b = document.getElementById("fitToSign"); if (b) b.click(); }); await sleep(300);
  const r2c = await page.evaluate(id => JSON.parse(JSON.stringify(db.fitReports.find(r => r.id === id))), rep2.id);
  check(`[${vp}] confirmed value saved from the form`, r2c.lastName === "Smith", r2c.lastName);

  /* From PR #24: one Drive copy per fit-test PDF (download() already queues it; v48.12 queued it twice -> name_2.pdf). */
  const q = await page.evaluate(async id => {
    const D = window.envssDrive, orig = D.enqueueExport, names = [];
    D.enqueueExport = function (b, n) { names.push(n); };
    const fdl = window.download; const dls = [];
    window.download = function (b, n) { dls.push(n); D.enqueueExport(b, n); };
    try { await envssFit.finishPdf(db.fitReports.find(r => r.id === id), eventById("eFit"), false); }
    finally { D.enqueueExport = orig; window.download = fdl; }
    return { names, dls };
  }, rep2.id);
  check(`[${vp}] a fit-test PDF is queued to Drive once (no _2 copy)`, q.names.length === 1 && q.dls.length === 1 && /\.pdf$/.test(q.names[0]), JSON.stringify(q));
  await page.evaluate(() => { view.fitScreen = ""; view.fitReportId = ""; openEvent("eFit"); }); await sleep(300);
  const howto = await page.evaluate(() => { const a = document.querySelector("#fitHowTo a"); return a ? { href: a.getAttribute("href"), t: a.textContent, tgt: a.target } : null; });
  check(`[${vp}] fit event shows the How to record a fit test link (help/fit-test.html)`, howto && howto.href === "help/fit-test.html" && /How to record a fit test/.test(howto.t) && howto.tgt === "_blank", JSON.stringify(howto));

  page.store.offline = true;
  const rep3 = await uploadPhoto(page, TINY);
  page.store.offline = false;
  check(`[${vp}] Vision network failure falls back to the on-device read`, rep3.ocrSource === "device" && rep3.ocrOfflineReason === "network" && rep3.ocrPendingVision === true, JSON.stringify({ s: rep3.ocrSource, w: rep3.ocrOfflineReason }));
  page.store.ocrStatus = 504; page.store.ocrBody = {};
  const rep4 = await uploadPhoto(page, TINY);
  page.store.ocrStatus = 200; page.store.ocrBody = { text: VISION_TEXT };
  check(`[${vp}] Vision 504 falls back to the on-device read`, rep4.ocrSource === "device" && rep4.ocrOfflineReason === "network", JSON.stringify({ s: rep4.ocrSource, w: rep4.ocrOfflineReason }));
  page.store.ocrStatus = 503; page.store.ocrBody = { error: "OCR_NOT_CONFIGURED", message: "OCR not set up yet, enter manually" };
  const rep5 = await uploadPhoto(page, TINY);
  page.store.ocrStatus = 200; page.store.ocrBody = { text: VISION_TEXT };
  check(`[${vp}] OCR_NOT_CONFIGURED is unchanged (manual entry, no device read)`, rep5.ocrStatus === "not_configured" && rep5.ocrSource !== "device", JSON.stringify({ st: rep5.ocrStatus, s: rep5.ocrSource }));

  await page.evaluate(async () => { await caches.delete(envssFit.tesseractAssets.cache); delete window.Tesseract; });
  await page.setOfflineMode(true); await sleep(200);
  const rep6 = await uploadPhoto(page, TINY);
  check(`[${vp}] offline with no downloaded reader: clear message, manual entry, Vision re-read queued`, rep6.ocrStatus === "failed" && /not been downloaded yet/.test(rep6.ocrMessage) && rep6.ocrPendingVision === true && !!(await page.$("#fitConfirm")), JSON.stringify({ st: rep6.ocrStatus, m: rep6.ocrMessage }));
  await page.setOfflineMode(false);
  check(`[${vp}] no page errors`, page.errs.length === 0, page.errs.join(" | "));
  check(`[${vp}] envss_fit_reports payloads never carry parentEventId`, [...((page.store.envss_fit_reports || new Map()).values())].every(r => !JSON.stringify(r).includes("parentEventId")));
  await page.close(); await page.ctx.close();
}

async function runReal(vp) {
  if (!REAL || !fs.existsSync(REAL)) { console.log(`[${vp}] REAL_PHOTO not set; real Tesseract run skipped`); return null; }
  const page = await boot(vp);
  const t0 = Date.now();
  const warmed = await page.evaluate(() => envssFit.warmDeviceOcr(true));
  const sizes = await page.evaluate(async () => { const A = envssFit.tesseractAssets; const c = await caches.open(A.cache); const out = {}; for (const k of await c.keys()) { const r = await c.match(k); out[k.url.split("/npm/")[1]] = (await r.arrayBuffer()).byteLength; } return out; });
  const ready = await page.evaluate(() => envssFit.deviceOcrReady());
  check(`[${vp}] one online load caches the reader (worker, core wasm, eng traineddata)`, warmed && ready && Object.keys(sizes).length >= 4, JSON.stringify({ warmed, ready, sizes }));
  console.log(`[${vp}] download ${Date.now() - t0} ms, cached bytes`, JSON.stringify(sizes));
  await page.setOfflineMode(true); await sleep(200);
  const t1 = Date.now();
  const rep = await uploadPhoto(page, REAL);
  const ms = Date.now() - t1;
  check(`[${vp}] real Tesseract read of the TSI photo works with no signal`, rep && rep.ocrSource === "device" && rep.ocrStatus === "ok", JSON.stringify({ s: rep && rep.ocrSource, st: rep && rep.ocrStatus, m: rep && rep.ocrMessage }));
  const acc = fieldChecks(rep || {}, (rep || {}).exercises);
  console.log(`[${vp}] REAL on-device accuracy ${acc.filter(c => c.ok).length}/${acc.length} in ${ms} ms (headless Chrome on this box)`);
  acc.filter(c => !c.ok).forEach(c => console.log(`   miss: ${c.field} => ${c.got}`));
  fs.writeFileSync(path.join(OUT, `${vp}-real-tesseract-result.json`), JSON.stringify({ ms, sizes, accuracy: acc, words: rep && rep.ocrWords, text: rep && rep.ocrText }, null, 1));
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(150);
  await page.screenshot({ path: path.join(OUT, `${vp}-04-offline-real-tesseract-confirm.png`) });
  await page.screenshot({ path: path.join(OUT, `${vp}-04-offline-real-tesseract-confirm-full.png`), fullPage: true });
  check(`[${vp}] real run: no page errors`, page.errs.length === 0, page.errs.join(" | "));
  await page.setOfflineMode(false); await page.close(); await page.ctx.close();
  return { ok: acc.filter(c => c.ok).length, total: acc.length, ms };
}

const vps = process.argv[2] ? [process.argv[2]] : ["chromebook", "pixel7"];
const real = {};
for (const vp of vps) await run(vp);
for (const vp of vps) real[vp] = await runReal(vp);
await browser.close(); server.close();
const sw = fs.readFileSync(path.join(REPO, "sw-field.js"), "utf8");
check("sw-field.js precaches fit-test.js?v=<version> (fit testing loads offline)", /"fit-test\.js\?v=" \+ VERSION/.test(sw) && /envss-field-v48-13/.test(sw));
check("sw-field.js only deletes envss-field-* caches (envss-ocr-* survives app updates)", /k\.startsWith\("envss-field-"\)/.test(sw));
const html = fs.readFileSync(path.join(REPO, "field.html"), "utf8");
check("help/fit-test.html guide is in the branch (from PR #24)", fs.existsSync(path.join(REPO, "help/fit-test.html")) && fs.existsSync(path.join(REPO, "help/assets/fit-test/fit-test-how-to.mp4")));
check("field.html does not load Tesseract on first paint", !/<script[^>]+tesseract/i.test(html));
fs.writeFileSync(path.join(OUT, "test-results.json"), JSON.stringify({ results, real }, null, 1));
console.log("\n" + results.filter(r => r.ok).length + " passed, " + results.filter(r => !r.ok).length + " failed");
process.exit(results.every(r => r.ok) ? 0 : 1);
