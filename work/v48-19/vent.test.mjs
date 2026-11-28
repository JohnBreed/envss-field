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
  check(L("Add measurement screen: only the four vent types"), JSON.stringify(pk.cards) === JSON.stringify(["Vent · Face velocity", "Vent · Capture velocity", "Vent · Other velocity reading", "Vent · Visual check only"]), JSON.stringify(pk.cards));
  check(L("Add measurement screen: no airborne / noise / blank options"), !/Airborne|Noise|Field blank|sample/i.test(pk.all), pk.all);
  await shot(page, "add-measurement");

  /* ---- 4. a face velocity measurement, offline ---- */
  page.store.offline = true;
  await tap(page, '[data-vt-add="face"]'); await sleep(300);
  let t = await NEWEST(page); const v1 = t.id;
  check(L("new vent measurement: trainKind vent on the vent event, number 1"), t.trainKind === "vent" && t.eventId === "eV" && Number(t.sampleNo) === 1 && t.vent && t.vent.type === "face", JSON.stringify({ k: t.trainKind, n: t.sampleNo, v: t.vent }));
  check(L("new vent measurement: no airborne defaults (rotameter / contaminant)"), !t.rotameter && !t.contaminantId, JSON.stringify({ r: t.rotameter, c: t.contaminantId }));
  check(L("measurement screen opens (Measurement 1, Face velocity)"), await page.evaluate(() => view.page === "vent" && /Measurement 1/.test(document.querySelector("#app h2").innerText)), await txt(page, "#app h2"));
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
  check(L("Another location: Measurement 2 copies unit, hood and condition"), Number(t.sampleNo) === 2 && t.vent.unit === "DMS downdraft table (dry lab)" && t.vent.hood === "Downdraft table" && t.vent.condition === "Extraction on, boxes moved off the bench" && t.vent.type === "face", JSON.stringify(t.vent));
  check(L("Another location: units already on the event offered"), /Units already on this event/.test(await txt(page)), "");
  await fill(page, "#vt-location", "Directly in front of the extraction face");
  await shot(page, "measurement-2-incomplete");

  /* ---- 7. event rows + Mark event complete / COC ---- */
  await openEv(page, "eV");
  et = await txt(page);
  check(L("event rows: 'Measurement 1 · Face velocity · unit' with avg (lowest–highest)"), /Measurement 1 · Face velocity · DMS downdraft table/.test(et) && /avg 1\.32 m\/s \(1\.01–1\.54\)/.test(et), et.slice(0, 900));
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
  check(L("CSV: Drive sheet headings"), /^"Extraction Unit\/Equipment","LEV\/Hood Type","Operating Condition","Measurement Type","Measurement Location","Distance From Extraction Face \(cm\)","Measurement Number","Measured Velocity \(m\/s\)","Average Velocity \(m\/s\)","Lowest Recorded Velocity \(m\/s\)","Highest Recorded Velocity \(m\/s\)"/.test(lines[0]), lines[0]);
  check(L("CSV: one row per reading, stats on the first row (1.32 / 1.01 / 1.54), anemometer"), lines.length === 1 + 5 + 3 && /"DMS downdraft table \(dry lab\)","Downdraft table".*"1","1.31","1.32","1.01","1.54","~60 cm"/.test(lines[1]) && /TSI 9545 VelociCalc SN T95450123/.test(lines[1]) && /^"","","","","","","5","1.54"/.test(lines[5]), lines.slice(0, 7).join("\n"));

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
