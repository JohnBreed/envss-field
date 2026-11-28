/* v48.19 vent survey tests (vent.js; John 28 Nov 2026 AWST "Vent apps working today").
   Usage: ROOT=<worktree> OUT=/workspace/guard-shots/v4819 node work/v48-19/vent.test.mjs [pixel7|chromebook]   (default: both)
   Covers: vent event wording + Add measurement, anemometer once per event, unit / location / readings with automatic
   average / lowest / highest, photo, offline save + sync, reload, mark complete / no COC, CSV export, delete tombstone,
   plus airborne (hygiene) and noise regressions on the same device. Supabase is mocked in memory and *.supabase.co is
   mapped to a dead local port, so nothing reaches production. Fixture names are made up. */
import fs from "fs"; import path from "path";
import { fileURLToPath } from "url";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || "/workspace/guard-shots/v4819"; fs.mkdirSync(OUT, { recursive: true });
const PHOTO = path.join(__dir, "vent-test-photo.png");
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 700) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date());
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const person = (first, last) => ({ first, last, sex: "male", sexSet: true, dob: "1985-03-04", dobD: "04", dobM: "03", dobY: "1985", occupation: "Fitter", company: "Acme Mining", hours: "12", daysOn: "8", daysOff: "6" });
const H = (id, ev, n, extra) => Object.assign({ id, eventId: ev, trainKind: "airborne_personal", mode: "personal", sampleNo: n, pouch: String(n), contaminantId: "INH", pumpSerial: "7700" + n, headId: "IESS-" + id, mediaId: "C-" + id,
  startFlow: "2.0", endFlow: "", rotameter: "FR4A40BNBN-NL-02", shiftDate: TODAY, shiftKind: "day", status: "prepped", startAt: "", endAt: "", comments: "", location: "",
  person: person("Sam", "Testone"), rpd: {}, hpd: {}, audit: [] }, extra || {});
const NZ = (id, ev, n, extra) => Object.assign({ id, eventId: ev, trainKind: "noise_personal", mode: "personal", sampleNo: n, pouch: String(n), contaminantId: "NOISE", dosimeterSerial: "D-" + id, fieldCalibrator: "59311", shiftDate: TODAY, status: "prepped", startAt: "", endAt: "", person: person("Sam", "Testone"), audit: [] }, extra || {});
const cal = { [TODAY]: { start: { ref: "94.0", reading: "94.1", at: ago(2), by: "test" } } };
function fixture() {
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }, { id: "NOISE", name: "Noise dose", code: "NOISE", kind: "noise" }],
      pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p1", number: "0019919", name: "v48.19 field test", source: "field", site: "Test site", client: "Acme Mining" }],
    events: [{ id: "eH", projectId: "p1", code: "0019919-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      { id: "eN", projectId: "p1", code: "0019919-002", type: "hygiene", podioEventKind: "noise", date: TODAY, stage: "planned", audit: [], noiseCal: cal },
      { id: "eV", projectId: "p1", code: "0019919-003", type: "hygiene", podioEventKind: "vent", podioAppId: "30888385", date: TODAY, stage: "planned", audit: [] }],
    trains: [H("h1", "eH", 1), H("h2", "eH", 2, { trainKind: "airborne_static", mode: "static", location: "Bay 2" }), NZ("hn", "eH", 3), NZ("n1", "eN", 1)],
    deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
  };
}
const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
async function boot(vp) {
  const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "warning" && /vent\.js|noise\.js/.test(m.text())) page.errs.push(m.text()); });
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); const store = {}; page.store = store; page.mlog = mockSupabase(page, store, {});
  page.on("request", r => { const u = r.url(); if (!u.startsWith(url) && !u.startsWith("data:") && !u.startsWith("blob:") && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|\.supabase\.co\//.test(u)) ext.push(vp + " " + r.method() + " " + u.split("?")[0]); });
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  const fx = fixture(); await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); }, fx);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(d => { window.ENVSS_CONFIG.admins = ["field.test@envss.com.au"]; db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains)); db.catalogs = Object.assign(db.catalogs || {}, d.catalogs); persist(); }, fx);
  await sleep(200); return page;
}
const metrics = page => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
const tap = async (page, sel) => { await page.evaluate(s => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: "center", behavior: "instant" }); }, sel); await sleep(120); await page.click(sel); await sleep(300); };
const T = (page, id) => page.evaluate(i => { const t = db.trains.find(x => x.id === i); return t ? JSON.parse(JSON.stringify(t)) : null; }, id);
const EV = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(db.events.find(x => x.id === i))), id);
const openEv = async (page, id) => { await page.evaluate(i => openEvent(i), id); await sleep(400); };
const txt = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel || "#app");
const has = (page, sel) => page.evaluate(s => !!document.querySelector(s), sel);
const NEWEST = page => page.evaluate(() => JSON.parse(JSON.stringify(db.trains[db.trains.length - 1])));
async function fill(page, sel, v) { await page.evaluate(s => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: "center", behavior: "instant" }); }, sel); await sleep(80); await page.click(sel); await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace"); if (v) await page.type(sel, v); await page.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(250); }
const SHEET_HEAD = '"Extraction Unit/Equipment","Measurement Number","Measured Velocity (m/s)","Average Velocity (m/s)","Lowest Recorded Velocity (m/s)","Highest Recorded Velocity (m/s)","Distance From Extraction Face at which velocity < 0.5 m/s (m)","Comments"';
const SUM_HEAD = '"Extraction Unit","Number of Measurements","Average Velocity (m/s)","Lowest Recorded Velocity (m/s)","Highest Recorded Velocity (m/s)","Distance From Extraction Face at which velocity < 0.5 m/s (m)"';
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === "updatedAt" || k === "syncedAt" ? undefined : v)));

async function run(vp) {
  const L = s => `${vp}: ${s}`; const shot = (page, n) => page.screenshot({ path: path.join(OUT, `vent-${n}-${vp}.png`), fullPage: n.endsWith("-full") });
  const page = await boot(vp);
  check(L("vent.js loaded beside noise.js"), await page.evaluate(() => !!(window.ENVSS_VENT && ENVSS_VENT.loaded && window.ENVSS_NOISE && ENVSS_NOISE.loaded)), "");
  const beforeRows = await page.evaluate(() => JSON.parse(JSON.stringify(db.trains)));

  /* ---- 1. project list ---- */
  await page.evaluate(() => openProject("p1")); await sleep(500);
  const ptxt = await txt(page);
  check(L("project page: vent event row says Vent survey and 0 measurements"), /Vent survey/.test(ptxt) && /0 measurements/.test(ptxt), ptxt.slice(0, 600));
  check(L("project page: hygiene event row still says samples"), /3 samples/.test(ptxt), ptxt.slice(0, 600));
  await shot(page, "project-list");

  /* ---- 2. event page ---- */
  await openEv(page, "eV");
  let et = await txt(page); const fab = await page.evaluate(() => { const f = document.querySelector(".fab"); const n = document.querySelector('nav.bnav [data-go="add"] span'); return { fab: f && !f.hidden ? f.textContent : "(hidden)", nav: n ? n.textContent : "" }; });
  check(L("vent event: Add measurement, no 'sample' wording"), /Add measurement/.test(et + fab.fab) && !/sample/i.test(et + (fab.fab === "(hidden)" ? "" : fab.fab)), et.slice(0, 500) + " | " + JSON.stringify(fab));
  check(L("vent event: bottom bar says Measure on a phone"), vp === "chromebook" ? true : fab.nav === "Measure", fab.nav);
  check(L("vent event: 'No measurements yet.'"), /No measurements yet/.test(et), et.slice(0, 400));
  check(L("vent event: code stays {job}-NNN"), /0019919-003/.test(et) && !/VENT-0/.test(et), "");
  check(L("vent event: anemometer card shown once"), await page.evaluate(() => document.querySelectorAll("#vtEquip").length === 1), "");
  await fill(page, "#vtEqMake", "TSI"); await fill(page, "#vtEqModel", "9545 VelociCalc"); await fill(page, "#vtEqSerial", "T95450123");
  let ev = await EV(page, "eV");
  check(L("anemometer make / model / serial saved on the event"), ev.ventEquip && ev.ventEquip.make === "TSI" && ev.ventEquip.model === "9545 VelociCalc" && ev.ventEquip.serial === "T95450123", JSON.stringify(ev.ventEquip));
  check(L("anemometer change audited on the event log"), (ev.audit || []).some(a => /Anemometer serial/.test(a.action || "")), JSON.stringify((ev.audit || []).slice(-3)));
  await shot(page, "event-empty");

  /* ---- 3. Add measurement screen ---- */
  await page.evaluate(() => openPickType("eV")); await sleep(300);
  const pk = await page.evaluate(() => ({ h: document.querySelector("#app h2").innerText, cards: [...document.querySelectorAll("#app .card strong")].map(x => x.innerText), all: document.getElementById("app").innerText }));
  check(L("Add measurement screen: title"), pk.h === "Add measurement", pk.h);
  check(L("Add measurement screen: the five vent types, Face velocity still offered"), JSON.stringify(pk.cards) === JSON.stringify(["Vent · Face velocity grid", "Vent · Face velocity", "Vent · Capture velocity", "Vent · Other velocity reading", "Vent · Visual check only"]), JSON.stringify(pk.cards));
  check(L("Add measurement screen: no airborne / noise / blank options"), !/Airborne|Noise|Field blank|sample/i.test(pk.all), pk.all);
  await shot(page, "add-measurement");

  /* ---- 4. a capture velocity measurement (single location, free list of readings), offline ---- */
  page.store.offline = true;
  await tap(page, '[data-vt-add="capture"]'); await sleep(300);
  let t = await NEWEST(page); const v1 = t.id;
  check(L("new vent measurement: trainKind vent on the vent event, number 1"), t.trainKind === "vent" && t.eventId === "eV" && Number(t.sampleNo) === 1 && t.vent && t.vent.type === "capture", JSON.stringify({ k: t.trainKind, n: t.sampleNo, v: t.vent }));
  check(L("new vent measurement: no airborne defaults (rotameter / contaminant)"), !t.rotameter && !t.contaminantId, JSON.stringify({ r: t.rotameter, c: t.contaminantId }));
  check(L("measurement screen opens (Measurement 1, Capture velocity)"), await page.evaluate(() => view.page === "vent" && /Measurement 1/.test(document.querySelector("#app h2").innerText)), await txt(page, "#app h2"));
  check(L("measurement screen: anemometer from the event is shown"), /T95450123/.test(await txt(page)), "");
  check(L("measurement screen: 'Still needed' lists unit, location, reading"), /Extraction unit/.test(await txt(page, "#vtChecks")) && /Measurement location/.test(await txt(page, "#vtChecks")) && /velocity reading/.test(await txt(page, "#vtChecks")), await txt(page, "#vtChecks"));
  await shot(page, "measurement-new");
  await fill(page, "#vt-unit", "DMS downdraft table (dry lab)");
  await fill(page, "#vt-hood", "Downdraft table");
  await fill(page, "#vt-condition", "Extraction on, boxes moved off the bench");
  await fill(page, "#vt-location", "At the source, 15 cm from the outer edge");
  await fill(page, "#vt-distanceCm", "35");
  await fill(page, "#vt-r0", "1.31"); await fill(page, "#vt-r1", "1.33"); await fill(page, "#vt-r2", "1.01");
  /* Enter on the last box adds the next numbered box */
  await page.click("#vt-r2"); await page.keyboard.press("End"); await page.keyboard.press("Enter"); await sleep(250);
  check(L("Enter on the last reading adds reading 4 and focuses it"), await page.evaluate(() => document.activeElement && document.activeElement.id === "vt-r3"), await page.evaluate(() => document.activeElement && document.activeElement.id));
  await page.keyboard.type("1.39"); await page.evaluate(() => document.activeElement.blur()); await sleep(200);
  await tap(page, "#vtAddRead"); await page.keyboard.type("1.54"); await page.evaluate(() => document.activeElement.blur()); await sleep(250);
  t = await T(page, v1);
  check(L("five readings saved in order"), JSON.stringify(t.vent.readings) === JSON.stringify(["1.31", "1.33", "1.01", "1.39", "1.54"]), JSON.stringify(t.vent.readings));
  const sTxt = await txt(page, "#vtStats");
  check(L("average / lowest / highest worked out (1.32 / 1.01 / 1.54)"), /1\.32/.test(sTxt) && /1\.01/.test(sTxt) && /1\.54/.test(sTxt) && /\b5\b/.test(sTxt), sTxt);
  check(L("stats helper agrees"), await page.evaluate(i => { const s = ENVSS_VENT.stats(db.trains.find(x => x.id === i)); return s.n === 5 && Math.abs(s.avg - 1.316) < 1e-9 && s.min === 1.01 && s.max === 1.54; }, v1), "");
  check(L("complete: status ended, location mirrored, 'Measurement complete' shown"), t.status === "ended" && t.location === "At the source, 15 cm from the outer edge" && /Measurement complete/.test(await txt(page, "#vtChecks")), JSON.stringify({ s: t.status, l: t.location }));
  await fill(page, "#vt-below05", "~60 cm");
  await fill(page, "#vt-comments", "Strong induced airflow at the work position");
  t = await T(page, v1);
  check(L("below 0.5 m/s distance and comments saved"), t.vent.below05 === "~60 cm" && t.vent.comments === "Strong induced airflow at the work position" && t.comments === t.vent.comments, JSON.stringify(t.vent));
  check(L("edits audited once per field (shared change audit), not per keystroke"), (t.audit || []).filter(a => a.field === "vent.unit").length === 1 && (t.audit || []).some(a => a.field === "vent.readings") && (t.audit || []).filter(a => a.field === "vent.readings").length <= 5, JSON.stringify((t.audit || []).map(a => a.field + ":" + a.detail).slice(-12)));
  /* photo */
  const inp = await page.$('input[data-vt-take]'); await inp.uploadFile(PHOTO);
  await sleep(1500);
  t = await T(page, v1);
  check(L("photo saved on the device as an envss-photo reference"), Array.isArray(t.vent.photos) && t.vent.photos.length === 1 && /^envss-photo:/.test(t.vent.photos[0]) && t.photoRefs && Object.keys(t.photoRefs).length === 1, JSON.stringify({ p: t.vent.photos, r: t.photoRefs && Object.keys(t.photoRefs) }));
  check(L("photo thumbnail shown"), await has(page, ".vt-photo img"), "");
  /* a bad reading warns, never blocks */
  await tap(page, "#vtAddRead"); await page.keyboard.type("88"); await page.evaluate(() => document.activeElement.blur()); await sleep(250);
  check(L("out-of-range reading (88 m/s) warns, not a block"), /looks wrong/.test(await txt(page, "#vtChecks")) && (await T(page, v1)).status === "ended", await txt(page, "#vtChecks"));
  await fill(page, "#vt-r5", "");
  await shot(page, "measurement-complete");
  await shot(page, "measurement-complete-full");
  const pend = await page.evaluate(i => Object.keys(syncState.pending).filter(k => k === "trains:" + i || k === "events:eV"), v1);
  check(L("offline: the measurement and event are queued on the device"), pend.length === 2, JSON.stringify(pend));
  check(L("offline: nothing reached the server yet"), !(page.store.envss_trains && page.store.envss_trains.get(v1)), "");

  /* ---- 5. reload (device copy) then back online: synced like other samples ---- */
  await page.reload({ waitUntil: "networkidle0" }); await sleep(900);
  t = await T(page, v1);
  check(L("after reload: all vent fields still on the device"), t && t.vent && t.vent.readings.filter(Boolean).length === 5 && t.vent.unit === "DMS downdraft table (dry lab)" && (await EV(page, "eV")).ventEquip.serial === "T95450123", JSON.stringify(t && t.vent));
  page.store.offline = false;
  await page.evaluate(() => { try { flushQueue(); } catch (e) { scheduleFlush(10); } }); await sleep(2500);
  const row = page.store.envss_trains && page.store.envss_trains.get(v1);
  check(L("online: envss_trains row carries the vent payload (event_id set)"), !!row && row.event_id === "eV" && row.payload && row.payload.trainKind === "vent" && row.payload.vent.readings.length >= 5 && row.payload.vent.unit === "DMS downdraft table (dry lab)", JSON.stringify(row || null).slice(0, 400));
  const erow = page.store.envss_events && page.store.envss_events.get("eV");
  check(L("online: envss_events row carries ventEquip"), !!erow && erow.payload && erow.payload.ventEquip && erow.payload.ventEquip.serial === "T95450123", JSON.stringify(erow || null).slice(0, 300));
  check(L("online: queue empty for the vent rows"), await page.evaluate(i => !syncState.pending["trains:" + i] && !syncState.pending["events:eV"], v1), "");

  /* ---- 6. another location on the same unit ---- */
  await page.evaluate(i => openTrain(i), v1); await sleep(400);
  check(L("openTrain on a vent measurement opens the vent screen (deep links / rows)"), await page.evaluate(() => view.page === "vent" && !!document.getElementById("vtPage")), "");
  await tap(page, "[data-vt-again]"); await sleep(300);
  t = await NEWEST(page); const v2 = t.id;
  check(L("Another location: Measurement 2 copies unit, hood and condition"), Number(t.sampleNo) === 2 && t.vent.unit === "DMS downdraft table (dry lab)" && t.vent.hood === "Downdraft table" && t.vent.condition === "Extraction on, boxes moved off the bench" && t.vent.type === "capture", JSON.stringify(t.vent));
  check(L("Another location: units already on the event offered"), /Units already on this event/.test(await txt(page)), "");
  await fill(page, "#vt-location", "Directly in front of the extraction face");
  await shot(page, "measurement-2-incomplete");

  /* ---- 7. event rows + Mark event complete / COC ---- */
  await openEv(page, "eV");
  et = await txt(page);
  check(L("event rows: 'Measurement 1 · Face velocity · unit' with avg (lowest–highest)"), /Measurement 1 · Capture velocity · DMS downdraft table/.test(et) && /avg 1\.32 m\/s \(1\.01–1\.54\)/.test(et), et.slice(0, 900));
  check(L("event rows: no 'Sample' wording, no pump / cassette dashes"), !/sample/i.test(et) && !/· — · — · —/.test(et), et.slice(0, 900));
  check(L("event list (project page): 2 measurements"), await page.evaluate(() => { openProject("p1"); return true; }) && /2 measurements/.test(await (async () => { await sleep(400); return txt(page); })()), "");
  await openEv(page, "eV");
  await shot(page, "event-rows");
  page.dialogs.length = 0;
  await page.evaluate(() => markEventUpload("eV")); await sleep(300);
  check(L("Mark complete blocked while Measurement 2 has no readings (lists what is missing)"), page.dialogs.some(d => /Measurement 2: At least one velocity reading/.test(d)) && !(await EV(page, "eV")).uploadReady, JSON.stringify(page.dialogs));
  await page.evaluate(i => openTrain(i), v2); await sleep(300);
  await fill(page, "#vt-r0", "2.10"); await fill(page, "#vt-r1", "2.14"); await fill(page, "#vt-r2", "2.02");
  page.dialogs.length = 0;
  await page.evaluate(() => markEventUpload("eV")); await sleep(400);
  ev = await EV(page, "eV");
  check(L("Mark complete: done when every measurement is complete, no COC offered"), ev.uploadReady === true && page.dialogs.some(d => /no COC/.test(d)) && !page.dialogs.some(d => /Create COC now/.test(d)), JSON.stringify(page.dialogs));
  page.dialogs.length = 0;
  const cocR = await page.evaluate(async () => { view.eventId = "eV"; return await createCoc(); });
  check(L("Create COC on a vent event: refused with a plain message"), cocR === false && page.dialogs.some(d => /no COC/.test(d)), JSON.stringify(page.dialogs));
  await openEv(page, "eV");
  await shot(page, "event-complete");

  /* ---- 8. CSV export (Drive field sheet columns) ---- */
  const csv = await page.evaluate(() => ENVSS_VENT.exportCsv("eV"));
  const lines = csv.split("\r\n");
  check(L("CSV: 0019340 Sheet1 headings first, app columns to the right"), lines[0].startsWith(SHEET_HEAD) && /,"Unit","Operating Condition","LEV\/Hood Type"/.test(lines[0]) && /"Opening Width \(mm\)","Opening Height \(mm\)","Grid \(columns x rows\)","Horizontal Spacing \(mm\)","Vertical Spacing \(mm\)"/.test(lines[0]), lines[0]);
  check(L("CSV: one row per reading, stats + comments on the first row (1.32 / 1.01 / 1.54), anemometer"), /^"DMS downdraft table \(dry lab\) – Extraction on, boxes moved off the bench","1","1.31","1.32","1.01","1.54","~60 cm","Strong induced airflow at the work position"/.test(lines[1]) && /TSI 9545 VelociCalc SN T95450123/.test(lines[1]) && /^"","5","1.54","","","","",""/.test(lines[5]) && /^"DMS downdraft table \(dry lab\) – Extraction on/.test(lines[6]), lines.slice(0, 7).join("\n"));
  check(L("CSV: summary block after the measurements (Summary tab columns)"), lines[9] === "" && lines[10] === '"Summary"' && lines[11].startsWith(SUM_HEAD) && /^"DMS downdraft table \(dry lab\)","5","1.32","1.01","1.54","~60 cm"/.test(lines[12]) && lines.length === 14, lines.slice(8).join("\n"));

  /* ---- 9. visual check + delete ---- */
  await page.evaluate(() => ENVSS_VENT.addMeasurement("eV", "visual")); await sleep(300);
  t = await NEWEST(page); const v3 = t.id;
  await fill(page, "#vt-unit", "Electrowinning cells"); await fill(page, "#vt-location", "Enclosed cells");
  check(L("visual check: needs a comment, not readings"), /Comments \(what was seen\)/.test(await txt(page, "#vtChecks")) && !/velocity reading/.test(await txt(page, "#vtChecks")), await txt(page, "#vtChecks"));
  await fill(page, "#vt-comments", "Fully enclosed, no face to measure");
  check(L("visual check: complete with a comment"), (await T(page, v3)).status === "ended", "");
  await shot(page, "visual-check");
  await page.evaluate(() => { window.ENVSS_CONFIG.admins = ["field.test@envss.com.au"]; render(); }); await sleep(300);
  page.dialogs.length = 0;
  await tap(page, "[data-vt-delete]"); await sleep(300);
  const delOk = await page.evaluate(i => !db.trains.some(x => x.id === i) && (db.deletions || []).some(d => d.trainId === i && d.eventId === "eV"), v3);
  check(L("delete: shared confirm ('Delete Measurement 3?'), tombstone in envss_deletions, back on the event"), delOk && page.dialogs.some(d => /Delete Measurement 3\?/.test(d)) && await page.evaluate(() => view.page === "event"), JSON.stringify(page.dialogs));

  const afterRows = await page.evaluate(() => JSON.parse(JSON.stringify(db.trains.filter(t => t.trainKind !== "vent"))));
  const diffs = []; beforeRows.forEach(b => { const a = afterRows.find(x => x.id === b.id); const sb = strip(b), sa = strip(a || {}); Object.keys(Object.assign({}, sb, sa)).forEach(k => { if (JSON.stringify(sb[k]) !== JSON.stringify(sa[k])) diffs.push(b.id + "." + k + ": " + JSON.stringify(sb[k]) + " -> " + JSON.stringify(sa[k])); }); });
  check(L("existing hygiene / noise rows not rewritten by vent.js"), diffs.length === 0, diffs.join(" | ").slice(0, 900));

  /* ==== G. face velocity grid (AS/NZS 2243.8:2014 Appendix B, B4.2(c); John 28 Nov 2026 2:08 PM AWST "go by the standard") ==== */
  const gshot = (n, full) => page.screenshot({ path: path.join(OUT, `vent-grid-${n}-${vp}.png`), fullPage: !!full });
  /* G0. grid helper: several opening sizes */
  const gf = await page.evaluate(() => [[2000, 1800], [600, 500], [1200, 700], [1800, 1000], [1500, 750], [250, 250], [150, 150], ["", 500], ["abc", 500]].map(([w, h]) => ENVSS_VENT.gridFor(w, h)));
  check(L("gridFor 2000×1800 → 5 columns × 8 rows = 40, spacing 450 / 229 mm"), JSON.stringify(gf[0]) === JSON.stringify({ cols: 5, rows: 8, gapX: 450, gapY: 229, points: 40 }), JSON.stringify(gf[0]));
  check(L("gridFor 600×500 → 2 × 3 = 6, spacing 400 / 150 mm"), JSON.stringify(gf[1]) === JSON.stringify({ cols: 2, rows: 3, gapX: 400, gapY: 150, points: 6 }), JSON.stringify(gf[1]));
  check(L("gridFor 1200×700 → 3 × 3 = 9, spacing exactly 500 / 250 mm (limits are 'not more than')"), JSON.stringify(gf[2]) === JSON.stringify({ cols: 3, rows: 3, gapX: 500, gapY: 250, points: 9 }), JSON.stringify(gf[2]));
  check(L("gridFor 1800×1000 → 5 × 5 = 25, spacing 400 / 200 mm"), JSON.stringify(gf[3]) === JSON.stringify({ cols: 5, rows: 5, gapX: 400, gapY: 200, points: 25 }), JSON.stringify(gf[3]));
  check(L("gridFor 1500×750 → 4 × 4 = 16, spacing 433 / 183 mm"), JSON.stringify(gf[4]) === JSON.stringify({ cols: 4, rows: 4, gapX: 433, gapY: 183, points: 16 }), JSON.stringify(gf[4]));
  check(L("gridFor small openings: 250×250 → 2 × 2 (50 mm), 150×150 → single centre point"), gf[5].cols === 2 && gf[5].rows === 2 && gf[5].gapX === 50 && gf[6].cols === 1 && gf[6].rows === 1, JSON.stringify([gf[5], gf[6]]));
  check(L("gridFor: blank or non-numeric size → no grid"), gf[7] === null && gf[8] === null, JSON.stringify([gf[7], gf[8]]));
  const sweep = await page.evaluate(() => { const bad = []; for (let w = 201; w <= 6000; w += 37) for (let h = 201; h <= 3000; h += 53) { const q = ENVSS_VENT.gridFor(w, h), sx = (w - 200) / (q.cols - 1), sy = (h - 200) / (q.rows - 1); const fewX = q.cols === 2 || (w - 200) / (q.cols - 2) > 500, fewY = q.rows === 2 || (h - 200) / (q.rows - 2) > 250; if (sx > 500 + 1e-9 || sy > 250 + 1e-9 || !fewX || !fewY) bad.push(w + "x" + h); } return bad; });
  check(L("gridFor sweep (≈2,500 sizes): spacing never over 500 / 250 mm and always the fewest lines"), sweep.length === 0, sweep.slice(0, 10).join(", "));

  /* G1. new grid measurement from the Add screen, offline */
  page.store.offline = true;
  await page.evaluate(() => openPickType("eV")); await sleep(300);
  await tap(page, '[data-vt-add="grid"]'); await sleep(300);
  t = await NEWEST(page); const g1 = t.id;
  check(L("grid: new measurement is type grid, location 'Extraction face', no grid until the opening is entered"), t.vent.type === "grid" && t.vent.location === "Extraction face" && t.vent.grid && t.vent.grid.cols === 0 && t.vent.grid.basis === "standard", JSON.stringify(t.vent));
  let ck = await txt(page, "#vtChecks");
  check(L("grid: 'Still needed' lists unit, fans condition, opening, a velocity"), /Extraction unit/.test(ck) && /How many fans are running/.test(ck) && /Opening width and height/.test(ck) && /grid point velocity/.test(ck), ck);
  const help = await txt(page, "#vgOpening");
  check(L("grid: help text cites AS/NZS 2243.8:2014 Appendix B, B4.2(c) with 100 / 250 / 500 mm"), /AS\/NZS 2243\.8:2014 Appendix B, B4\.2\(c\)/.test(help) && /100 mm in from the edges/.test(help) && /250 mm apart vertically/.test(help) && /500 mm apart horizontally/.test(help) && /fewest lines/.test(help), help);
  check(L("grid: cl 3.1.2 indicator explained before readings"), /AS\/NZS 2243\.8:2014 cl\. 3\.1\.2/.test(await txt(page, "#vgCheck")) && /Indicator only/.test(await txt(page, "#vgCheck")), await txt(page, "#vgCheck"));
  await gshot("new");
  await fill(page, "#vt-unit", "Fume cupboard FC-2 (Lab 1.04)");
  await fill(page, "#vt-hood", "Fume cupboard");
  await fill(page, "#vt-hoodMake", "Dynaflow"); await fill(page, "#vt-hoodModel", "DF-1800"); await fill(page, "#vt-hoodSerial", "FC2-0042");
  await tap(page, '[data-vt-fans="1"]');
  t = await T(page, g1);
  check(L("grid: fans chip 2 sets 'Two extraction fans in operation'; hood make / model / serial saved"), t.vent.condition === "Two extraction fans in operation" && t.vent.hoodMake === "Dynaflow" && t.vent.hoodModel === "DF-1800" && t.vent.hoodSerial === "FC2-0042", JSON.stringify(t.vent));
  await fill(page, "#vg-w", "2000"); await fill(page, "#vg-h", "1800");
  t = await T(page, g1);
  const geo = await txt(page, "#vgGeom");
  check(L("grid 2000×1800: 5 × 8 = 40 points, 450 / 229 mm shown and saved"), t.vent.grid.cols === 5 && t.vent.grid.rows === 8 && t.vent.grid.gapX === 450 && t.vent.grid.gapY === 229 && /5 × 8 = 40 points/.test(geo) && /horizontal spacing 450 mm/.test(geo) && /vertical spacing 229 mm/.test(geo) && /100 mm in from each edge of the 2000 × 1800 mm opening/.test(geo), geo + " " + JSON.stringify(t.vent.grid));
  const cells = await page.evaluate(() => ({ n: document.querySelectorAll("[data-vg-cell]").length, heads: [...document.querySelectorAll(".vg-colh")].map(x => x.innerText.toLowerCase()), l: [0, 7, 8, 39].map(i => document.querySelector(`[data-vg-cell="${i}"] .vg-num`).innerText), order: [...document.querySelectorAll("[data-vg-cell]")].slice(0, 6).map(x => +x.dataset.vgCell) }));
  check(L("grid 2000×1800: 40 cells, numbered down each column then across"), cells.n === 40 && JSON.stringify(cells.order) === JSON.stringify([0, 8, 16, 24, 32, 1]), JSON.stringify(cells));
  check(L("grid labels like the 0019340 sheet: 1 Top left corner, 8 Bottom left corner, 40 Bottom right corner"), /^1 Top left corner/.test(cells.l[0]) && /^8 Bottom left corner/.test(cells.l[1]) && /^9 Top column 2/.test(cells.l[2]) && /^40 Bottom right corner/.test(cells.l[3]) && cells.heads[0] === "left" && cells.heads[4] === "right", JSON.stringify(cells));
  /* G2. velocities, Enter moves down the column */
  const vals = Array.from({ length: 40 }, (_, i) => (0.45 + ((i * 37) % 50) / 100).toFixed(2));
  await page.evaluate(() => document.getElementById("vg-v0").scrollIntoView({ block: "center" })); await page.click("#vg-v0");
  for (let i = 0; i < 40; i++) { await page.keyboard.type(vals[i]); await page.keyboard.press("Enter"); if (i === 0) { await sleep(150); check(L("grid: Enter moves to the next point (2, down the column)"), await page.evaluate(() => document.activeElement && document.activeElement.id === "vg-v1"), await page.evaluate(() => document.activeElement && document.activeElement.id)); } }
  await sleep(300);
  t = await T(page, g1);
  const nums = vals.map(Number), avg = nums.reduce((a, b) => a + b, 0) / 40, mn = Math.min(...nums), mx = Math.max(...nums);
  check(L("grid: 40 velocities saved as point 1..40"), Object.keys(t.vent.grid.v).length === 40 && t.vent.grid.v["point 1"] === vals[0] && t.vent.grid.v["point 40"] === vals[39], JSON.stringify(t.vent.grid.v).slice(0, 300));
  const gs = await txt(page, "#vtStats");
  check(L(`grid: n / avg / lowest / highest across the grid (40, ${avg.toFixed(2)}, ${mn.toFixed(2)}, ${mx.toFixed(2)})`), /40/.test(gs) && gs.includes(avg.toFixed(2)) && gs.includes(mn.toFixed(2)) && gs.includes(mx.toFixed(2)), gs);
  check(L("grid: cl 3.1.2 shows Meets (avg ≥ 0.5, none < 0.3)"), /✓ Meets AS\/NZS 2243\.8:2014 cl\. 3\.1\.2/.test(await txt(page, "#vgCheck")), await txt(page, "#vgCheck"));
  check(L("grid: complete (status ended) with unit, condition, grid and readings"), t.status === "ended" && /Measurement complete/.test(await txt(page, "#vtChecks")), JSON.stringify({ s: t.status, c: await txt(page, "#vtChecks") }));
  await fill(page, "#vg-v4", "0.21");
  const fl = await txt(page, "#vgCheck"); t = await T(page, g1);
  check(L("grid: a 0.21 m/s point → 'Does not meet', 1 point below 0.3, indicator only (still complete)"), /✗ Does not meet/.test(fl) && /1 point below 0\.3 m\/s \(lowest 0\.21\)/.test(fl) && t.status === "ended" && await page.evaluate(() => document.querySelector('[data-vg-cell="4"]').classList.contains("vg-low")), fl);
  await fill(page, "#vg-d0", "~1"); await fill(page, "#vg-d7", "1.2 m");
  await page.evaluate(() => { const d = document.querySelector(".vg-labels"); if (d) d.open = true; }); await sleep(100);
  await fill(page, "#vg-l3", "Behind sash stop");
  await fill(page, "#vt-comments", "Sash at 500 mm working height. Bench clutter near the right side.");
  t = await T(page, g1);
  check(L("grid: distance < 0.5 m/s and a custom label saved per point; comments once per condition"), t.vent.grid.d["point 1 below 0.5"] === "~1" && t.vent.grid.d["point 8 below 0.5"] === "1.2 m" && t.vent.grid.label["point 4 label"] === "Behind sash stop" && t.vent.comments.startsWith("Sash at 500 mm") && /Behind sash stop/.test(await txt(page, '[data-vg-cell="3"] .vg-num')), JSON.stringify({ d: t.vent.grid.d, l: t.vent.grid.label }));
  const big = (t.audit || []).filter(a => String(a.detail || "").length > 300);
  check(L("grid: audit is one readable line per point (no big JSON blobs)"), big.length === 0 && (t.audit || []).some(a => /Point 5/i.test(String(a.label || a.field || "") + String(a.detail || ""))), JSON.stringify((t.audit || []).slice(-6)));
  await gshot("2000x1800"); await gshot("2000x1800-full", true);
  const gm = await metrics(page);
  check(L("grid screen fits the width (grid scrolls inside its card, not the page)"), gm.sw <= gm.iw + 1, JSON.stringify(gm));
  /* G3. a smaller opening that would drop filled points is refused, nothing lost */
  page.dialogs.length = 0;
  await fill(page, "#vg-w", "600");
  t = await T(page, g1);
  check(L("grid: shrinking 2000→600 mm wide (would drop points 17-40) refused, width and readings kept"), page.dialogs.some(d => /drop the readings/.test(d) && /Nothing has been changed/.test(d)) && t.vent.grid.widthMm === "2000" && t.vent.grid.cols === 5 && Object.keys(t.vent.grid.v).length === 40 && await page.evaluate(() => document.getElementById("vg-w").value === "2000"), JSON.stringify({ d: page.dialogs, w: t.vent.grid.widthMm, c: t.vent.grid.cols }));
  /* G4. offline queue, reload, sync */
  check(L("grid offline: queued on the device, nothing on the server"), await page.evaluate(i => !!syncState.pending["trains:" + i], g1) && !(page.store.envss_trains && page.store.envss_trains.get(g1)), "");
  await page.reload({ waitUntil: "networkidle0" }); await sleep(900);
  t = await T(page, g1);
  check(L("grid after reload: all 40 points, distances, label, opening still on the device"), t && Object.keys(t.vent.grid.v).length === 40 && t.vent.grid.v["point 5"] === "0.21" && t.vent.grid.d["point 8 below 0.5"] === "1.2 m" && t.vent.grid.widthMm === "2000" && t.vent.grid.heightMm === "1800", JSON.stringify(t && t.vent && t.vent.grid).slice(0, 300));
  page.store.offline = false;
  await page.evaluate(() => { try { flushQueue(); } catch (e) { scheduleFlush(10); } }); await sleep(2500);
  const grow = page.store.envss_trains && page.store.envss_trains.get(g1);
  check(L("grid online: envss_trains row carries the grid"), !!grow && grow.payload && grow.payload.vent.grid && grow.payload.vent.grid.v["point 40"] === vals[39] && grow.payload.vent.grid.cols === 5, JSON.stringify(grow || null).slice(0, 300));
  /* G5. another condition on the same unit */
  await page.evaluate(i => openTrain(i), g1); await sleep(400);
  await tap(page, "[data-vt-again]"); await sleep(300);
  t = await NEWEST(page); const g2 = t.id;
  check(L("+ Another condition: same unit, hood, make/model/serial and opening; new empty grid, no condition"), t.vent.type === "grid" && t.vent.unit === "Fume cupboard FC-2 (Lab 1.04)" && t.vent.hoodMake === "Dynaflow" && t.vent.hoodSerial === "FC2-0042" && t.vent.grid.widthMm === "2000" && t.vent.grid.cols === 5 && t.vent.grid.rows === 8 && Object.keys(t.vent.grid.v).length === 0 && t.vent.condition === "", JSON.stringify(t.vent));
  check(L("+ Another condition: asks how many fans; links the other condition"), /How many fans are running/.test(await txt(page, "#vtChecks")) && /Other conditions on this unit/.test(await txt(page)), "");
  await fill(page, "#vt-condition", "Four extraction fans in operation, sash 300 mm");
  await fill(page, "#vg-v0", "0.95"); await fill(page, "#vg-v1", "1.02"); await fill(page, "#vg-v2", "0.88");
  await fill(page, "#vt-hoodSerial", "FC2-0042B");
  check(L("hood serial edit flows to the other condition on the unit (was the same)"), (await T(page, g1)).vent.hoodSerial === "FC2-0042B", (await T(page, g1)).vent.hoodSerial);
  check(L("partly filled grid warns about blank points, does not block"), /37 of 40 points still blank/.test(await txt(page, "#vtChecks")) && (await T(page, g2)).status === "ended", await txt(page, "#vtChecks"));
  await gshot("condition-2");
  /* G6. manual grid: dimensions unknown → 4 × 7 = 28, reason recorded */
  await page.evaluate(() => ENVSS_VENT.addMeasurement("eV", "grid")); await sleep(300);
  t = await NEWEST(page); const g3 = t.id;
  await fill(page, "#vt-unit", "Spray booth 1"); await tap(page, '[data-vt-fans="0"]');
  await tap(page, "[data-vg-manual]");
  t = await T(page, g3);
  ck = await txt(page, "#vtChecks");
  check(L("manual grid: 4 × 7 = 28 points; reason field present but optional (not in Still needed)"), t.vent.grid.basis === "manual" && t.vent.grid.cols === 4 && t.vent.grid.rows === 7 && /4 × 7 = 28 points \(manual grid\)/.test(await txt(page, "#vgGeom")) && await has(page, "#vg-reason") && !/Reason for the manual grid/.test(ck) && /grid point velocity/.test(ck) && await page.evaluate(() => document.querySelectorAll("[data-vg-cell]").length === 28), ck);
  const ml = await page.evaluate(() => [0, 6, 7, 13, 14, 21, 27].map(i => document.querySelector(`[data-vg-cell="${i}"] .vg-num`).innerText));
  check(L("manual 4 × 7 labels match the 0019340 sheet (Top left corner, Top left central, Top right central, Bottom right corner)"), /^1 Top left corner/.test(ml[0]) && /^7 Bottom left corner/.test(ml[1]) && /^8 Top left central/.test(ml[2]) && /^14 Bottom left central/.test(ml[3]) && /^15 Top right central/.test(ml[4]) && /^22 Top right corner/.test(ml[5]) && /^28 Bottom right corner/.test(ml[6]), JSON.stringify(ml));
  await fill(page, "#vg-v0", "0.42");
  page.dialogs.length = 0;
  await page.evaluate(() => markEventUpload("eV")); await sleep(300);
  check(L("Mark complete is not blocked by a blank optional manual-grid reason"), !page.dialogs.some(d => /Reason for the manual grid/.test(d)) && (await EV(page, "eV")).uploadReady === true, JSON.stringify(page.dialogs));
  await page.evaluate(i => openTrain(i), g3); await sleep(300);
  await fill(page, "#vg-reason", "Opening size not measurable (booth doors removed)");
  await fill(page, "#vg-rows", "5");
  t = await T(page, g3);
  check(L("manual grid: rows editable (4 × 5) with nothing entered; reason saved"), t.vent.grid.rows === 5 && t.vent.grid.reason === "Opening size not measurable (booth doors removed)", JSON.stringify(t.vent.grid));
  await fill(page, "#vg-rows", "7");
  for (const [i, v] of [[0, "0.42"], [6, "0.38"], [27, "0.61"]]) await fill(page, "#vg-v" + i, v);
  page.dialogs.length = 0;
  await fill(page, "#vg-cols", "3");
  check(L("manual grid: dropping a column with a reading in it is refused"), page.dialogs.some(d => /drop the readings/.test(d)) && (await T(page, g3)).vent.grid.cols === 4, JSON.stringify(page.dialogs));
  t = await T(page, g3);
  check(L("manual grid complete; avg 0.47 → Does not meet (indicator)"), t.status === "ended" && /Does not meet/.test(await txt(page, "#vgCheck")), JSON.stringify({ s: t.status, c: await txt(page, "#vgCheck") }));
  await gshot("manual-4x7");
  /* G7. 600 × 500 opening in the UI */
  await page.evaluate(() => ENVSS_VENT.addMeasurement("eV", "grid")); await sleep(300);
  t = await NEWEST(page); const g4 = t.id;
  await fill(page, "#vt-unit", "Small benchtop hood"); await tap(page, '[data-vt-fans="0"]');
  await fill(page, "#vg-w", "600"); await fill(page, "#vg-h", "500");
  t = await T(page, g4);
  const sl = await page.evaluate(() => [0, 1, 2, 3, 5].map(i => document.querySelector(`[data-vg-cell="${i}"] .vg-num`).innerText));
  check(L("grid 600×500: 2 × 3 = 6 points, 400 / 150 mm; corner labels"), t.vent.grid.cols === 2 && t.vent.grid.rows === 3 && /2 × 3 = 6 points · horizontal spacing 400 mm · vertical spacing 150 mm/.test(await txt(page, "#vgGeom")) && /^1 Top left corner/.test(sl[0]) && sl[1] === "2" && /^3 Bottom left corner/.test(sl[2]) && /^4 Top right corner/.test(sl[3]) && /^6 Bottom right corner/.test(sl[4]), JSON.stringify(sl) + " " + (await txt(page, "#vgGeom")));
  for (let i = 0; i < 6; i++) await fill(page, "#vg-v" + i, ["0.55", "0.61", "0.58", "0.66", "0.70", "0.52"][i]);
  check(L("grid 600×500: Meets cl 3.1.2 (avg 0.60)"), /✓ Meets/.test(await txt(page, "#vgCheck")) && /0\.60/.test(await txt(page, "#vtStats")), await txt(page, "#vgCheck"));
  await fill(page, "#vg-w", "1200");
  t = await T(page, g4);
  check(L("growing 600→1200 mm wide re-sets the grid (3 × 3) and keeps every reading in its column / row"), t.vent.grid.cols === 3 && t.vent.grid.rows === 3 && t.vent.grid.v["point 1"] === "0.55" && t.vent.grid.v["point 3"] === "0.58" && t.vent.grid.v["point 4"] === "0.66" && t.vent.grid.v["point 6"] === "0.52" && Object.keys(t.vent.grid.v).length === 6, JSON.stringify(t.vent.grid));
  await fill(page, "#vg-w", "600");
  t = await T(page, g4);
  check(L("and back to 600 mm (no data in the extra column) → 2 × 3 again"), t.vent.grid.cols === 2 && Object.keys(t.vent.grid.v).length === 6, JSON.stringify(t.vent.grid));
  await gshot("600x500");
  /* G8. event summary table */
  await openEv(page, "eV");
  const sum = await page.evaluate(() => { const tb = document.querySelector("#vtSummary table"); return tb ? [...tb.rows].map(r => [...r.cells].map(c => c.innerText.trim())) : null; });
  const r1 = sum && sum.find(r => r[1] === "Two extraction fans in operation");
  check(L("event summary: columns unit / condition / n / avg / min / max / < 0.5 m/s / opening / grid · spacing / 2243.8"), !!sum && JSON.stringify(sum[0]) === JSON.stringify(["Unit", "Condition", "n", "Avg", "Min", "Max", "<0.5 m/s at", "Opening (mm)", "Grid · spacing (mm)", "2243.8"]), JSON.stringify(sum && sum[0]));
  const avgF = ((nums.reduce((a, b) => a + b, 0) - nums[4] + 0.21) / 40).toFixed(2);
  check(L("event summary: FC-2 two fans row (40, avg, 0.21, max, ~1 to 1.2 m, 2000 × 1800, 5 × 8 · 450 × 229, Does not meet)"), !!r1 && r1[0] === "Fume cupboard FC-2 (Lab 1.04)" && r1[2] === "40" && r1[3] === avgF && r1[4] === "0.21" && r1[5] === mx.toFixed(2) && r1[6] === "~1 to 1.2 m" && r1[7] === "2000 × 1800" && r1[8] === "5 × 8 · 450 × 229" && r1[9] === "Does not meet", JSON.stringify(r1));
  check(L("event summary: manual and 600 × 500 rows"), sum.some(r => r[0] === "Spray booth 1" && r[8] === "4 × 7 · manual") && sum.some(r => r[0] === "Small benchtop hood" && r[7] === "600 × 500" && r[8] === "2 × 3 · 400 × 150" && r[9] === "Meets"), JSON.stringify(sum));
  check(L("event rows: grid line shows grid, n, avg and 2243.8"), /Face velocity grid · Fume cupboard FC-2 \(Lab 1\.04\) · Two extraction fans in operation/.test(await txt(page)) && /5 × 8 grid \(2000 × 1800 mm\) · 40 of 40 points · avg/.test(await txt(page)), (await txt(page)).slice(0, 1200));
  const em = await metrics(page);
  check(L("event page with summary fits the width"), em.sw <= em.iw + 1, JSON.stringify(em));
  await gshot("event-summary"); await gshot("event-summary-full", true);
  /* G9. CSV in the 0019340 layout */
  const gcsv = (await page.evaluate(() => ENVSS_VENT.exportCsv("eV"))).split("\r\n");
  const gi = gcsv.findIndex(l => l.startsWith('"Fume cupboard FC-2 (Lab 1.04) – Two extraction fans in operation"'));
  check(L("grid CSV: block first row = unit – condition, '1 - Top left corner', velocity, avg / min / max, distance, comments"), gi > 0 && gcsv[gi].startsWith(`"Fume cupboard FC-2 (Lab 1.04) – Two extraction fans in operation","1 - Top left corner","${vals[0]}","${avgF}","0.21","${mx.toFixed(2)}","~1","Sash at 500 mm working height. Bench clutter near the right side."`), gcsv[gi]);
  check(L("grid CSV: app columns on the first row (opening, grid, spacing, standard, cl 3.1.2, anemometer)"), /"AS\/NZS 2243\.8:2014 Appendix B, B4\.2\(c\)","2000","1800","5 × 8","450","229","","Does not meet"/.test(gcsv[gi]) && /Dynaflow","DF-1800","FC2-0042B"/.test(gcsv[gi]) && /TSI 9545 VelociCalc SN T95450123/.test(gcsv[gi]), gcsv[gi]);
  check(L("grid CSV: 40 point rows, later rows number + label only, stats blank"), gcsv[gi + 1].startsWith(`"","2","${vals[1]}","","","","",""`) && gcsv[gi + 3].startsWith('"","4 - Behind sash stop"') && gcsv[gi + 7].startsWith('"","8 - Bottom left corner","' + vals[7] + '","","","","1.2 m",""') && gcsv[gi + 39].startsWith('"","40 - Bottom right corner"') && !gcsv[gi + 40].startsWith('"","41'), [gcsv[gi + 1], gcsv[gi + 7], gcsv[gi + 39]].join("\n"));
  const si = gcsv.indexOf('"Summary"');
  check(L("grid CSV: summary section with opening, grid and spacing"), si > gi && gcsv[si - 1] === "" && gcsv[si + 1].startsWith(SUM_HEAD) && gcsv.slice(si + 2).some(l => l.startsWith(`"Fume cupboard FC-2 (Lab 1.04)","40","${avgF}","0.21","${mx.toFixed(2)}","~1 to 1.2 m","Two extraction fans in operation","2000","1800","5 × 8","450","229"`)) && gcsv.slice(si + 2).some(l => /^"Spray booth 1","3",.*"4 × 7","","","Manual: Opening size not measurable/.test(l)), gcsv.slice(si).join("\n"));
  check(L("grid CSV: manual grid block has 28 rows"), gcsv.filter(l => /^"(Spray booth 1 – One extraction fan in operation)?","(\d+)( - [^"]*)?"/.test(l) && !/^"","\d+","\d/.test("x")).length >= 0 && (() => { const a = gcsv.findIndex(l => l.startsWith('"Spray booth 1 – One extraction fan in operation","1 - Top left corner"')); return a > 0 && gcsv[a + 27].startsWith('"","28 - Bottom right corner"'); })(), "");

  /* ---- 10. regressions: airborne (hygiene) event ---- */
  await openEv(page, "eH");
  const ht = await txt(page);
  check(L("hygiene event: still 'Sample' rows, no anemometer card, no vent export"), /Sample 1/.test(ht) && !(await has(page, "#vtEquip")) && !(await has(page, "[data-vt-export]")), ht.slice(0, 500));
  await page.evaluate(() => openPickType("eH")); await sleep(300);
  const hp = await page.evaluate(() => ({ h: document.querySelector("#app h2").innerText, cards: [...document.querySelectorAll("#app .card strong")].map(x => x.innerText) }));
  check(L("hygiene event: Add sample screen unchanged (airborne + blank + noise, no vent)"), hp.h === "Add sample" && hp.cards.includes("Airborne · personal") && hp.cards.includes("Field blank") && !hp.cards.some(c => /Vent/.test(c)), JSON.stringify(hp));
  await page.evaluate(() => openTrain("h1")); await sleep(400);
  check(L("airborne sample still opens the normal sample screen (pump field, flow)"), await page.evaluate(() => view.page === "train" && !!document.getElementById("pump") && !document.getElementById("vtPage")), "");
  check(L("airborne sample status unchanged by vent.js"), await page.evaluate(() => displayStatus(db.trains.find(x => x.id === "h1")) === "prepped" && startGaps(db.trains.find(x => x.id === "h1")).length >= 0), "");
  await shot(page, "regress-airborne");

  /* ---- 11. regressions: noise event ---- */
  await openEv(page, "eN");
  const nt = await txt(page);
  check(L("noise event: no anemometer card, no vent wording"), !(await has(page, "#vtEquip")) && !/\bVent\b|anemometer/i.test(nt), (nt.match(/.{0,60}(\bVent\b|anemometer).{0,60}/i) || [""])[0]);
  await page.evaluate(() => openPickType("eN")); await sleep(300);
  const np = await page.evaluate(() => ({ h: document.querySelector("#app h2").innerText, cards: [...document.querySelectorAll("#app .card strong")].map(x => x.innerText), v20: !!(window.ENVSS_NOISE && ENVSS_NOISE.addMeasurement) }));
  check(L("noise event: noise Add screen is noise.js's, no vent types"), !np.cards.some(c => /Vent/.test(c)) && (np.v20 ? np.h === "Add measurement" && np.cards.length === 3 && np.cards.every(c => /^Noise/.test(c)) : np.h === "Add sample"), JSON.stringify(np));
  await page.evaluate(() => openTrain("n1")); await sleep(400);
  check(L("noise sample still opens the normal noise screen"), await page.evaluate(() => view.page === "train" && !!document.getElementById("dosimeter")), "");
  await shot(page, "regress-noise");

  /* ---- 12. existing rows untouched; layout; errors ---- */
  await page.evaluate(i => openTrain(i), v1); await sleep(400);
  const m = await metrics(page);
  check(L("measurement screen fits the width (no sideways scroll)"), m.sw <= m.iw + 1, JSON.stringify(m));
  check(L("no page errors"), page.errs.length === 0, page.errs.join(" | "));
  await page.browserContext().close();
}
const which = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
try { for (const vp of which) await run(vp); }
catch (e) { check("run crashed", false, e && e.stack); }
check("no requests to outside hosts", ext.length === 0, ext.slice(0, 5).join(" | "));
await browser.close(); server.close();
const pass = results.filter(r => r.ok).length, fail = results.length - pass;
fs.writeFileSync(path.join(__dir, "vent-test-results.json"), JSON.stringify({ at: new Date().toISOString(), root: process.env.ROOT || "", pass, fail, results }, null, 2));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
