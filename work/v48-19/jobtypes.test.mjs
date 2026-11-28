/* v48.19: Podio job types on existing events, and {job}-{type}-001 event codes (John 28 Nov 2026 AWST).
   Usage: ROOT=<worktree> OUT=/workspace/guard-shots/v4819 node work/v48-19/jobtypes.test.mjs [pixel7|chromebook]  (default: both)
   Supabase is mocked in memory; *.supabase.co is mapped to a dead port. Podio is never called. Fixture names are made up. */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "../v48-7/harness.mjs";
const OUT = process.env.OUT || "/workspace/guard-shots/v4819"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 700) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date());
const NOW = new Date().toISOString();
const D = n => { const d = new Date(TODAY + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const proj = (job, name) => ({ id: "podio-p" + job, payload: { id: "podio-p" + job, number: job, name, source: "podio", status: "Active", podioItemId: "p" + job, site: "Test site" }, updated_at: NOW });
const ev = (id, job, code, date, extra) => ({ id, payload: Object.assign({ id, projectId: "podio-p" + job, type: "hygiene", stage: "planned", date, code, multiDay: false, operators: [], audit: [] }, extra || {}), updated_at: NOW });
const jt = title => ({ title, app_id: 18249487, item_id: 1 });
const hygItem = (id, job, title, start, status, extra) => {
  extra = extra || {};
  const types = extra.types || "ACA";
  const typeField = String(types).split(/\s*,\s*/).map(t => extra.jtShape === "string" ? (t + ", " + (extra.jtLabel || t)) : jt(t + ", " + (extra.jtLabel || t)));
  return {
    item_id: id, title, last_edit_on: extra.lastEdit || NOW, synced_at: NOW,
    fields: Object.assign({
      project: { title: job + " " + title, item_id: 77000 + (typeof id === "number" ? id : 1) },
      "reference-3": extra.reference || (job + "-Test Client-HYG-" + types + "-" + title),
      "job-type-of-hyg-event": extra.jtShape === "string" ? typeField[0] : typeField,
      "site-works-start-date": start ? { start: start + " 00:00:00" } : null,
      "site-works-start-date-status": status || "Site Works Start Date is now Confirmed",
      "generate-final-report": "Pending",
      company: "Test Client", "first-name": "Pat", "last-name": "Contact"
    }, extra.fields || {})
  };
};
function remoteFixture() {
  return {
    envss_projects: new Map([proj("0019358", "Job type refresh"), proj("0019360", "Typed codes")].map(p => [p.id, p])),
    v_field_hyg_events: new Map([
      /* John's 0019358-001 case: Job Type is now ACA; the reference still has the old RFT,NSEOC-ACA,VENT list */
      hygItem(3394530475, "0019358", "Site works", D(2), "Site Works Start Date is now Confirmed", {
        types: "ACA", jtLabel: "Airborne Contaminant Assessment (HYG)",
        reference: "0019358-001-Test Client-HYG-RFT,NSEOC-ACA,VENT-Site works"
      }),
      /* a second unstarted HYG event on the same job, already ACA, to show per-type numbering */
      hygItem(3394530476, "0019358", "Plant area", D(3), "Site Works Start Date is now Confirmed", { types: "ACA", jtLabel: "Airborne Contaminant Assessment (HYG)" }),
      /* date fill: existing event has no date; Podio now has one */
      hygItem(3394530501, "0019358", "Undated visit", D(4), "Site Works Start Date is Tentative", { types: "ACA" }),
      /* tech-entered date must be kept; Podio moved the date */
      hygItem(3394530502, "0019358", "Moved visit", D(10), "Site Works Start Date is now Confirmed", { types: "VENT" }),
      /* started event with a sample: types refresh, code stays */
      hygItem(3394530503, "0019358", "Started visit", D(1), "Site Works Start Date is now Confirmed", { types: "ACA", jtLabel: "Airborne Contaminant Assessment (HYG)" }),
      /* other job: new auto-creates for unit codes */
      hygItem(4001, "0019360", "New ACA", D(2), "Site Works Start Date is now Confirmed", { types: "ACA" }),
      hygItem(4002, "0019360", "New multi", D(3), "Site Works Start Date is now Confirmed", { types: "RFT,NSEOC-ACA,VENT" })
    ].map(r => [String(r.item_id), r])),
    v_field_podio_events: new Map([
      [String(3394530600), { item_id: 3394530600, app_id: 30888384, title: "Onsite RFT", last_edit_on: NOW, synced_at: NOW,
        fields: { project: { title: "0019358 Job", item_id: 1 }, "event-reference": "0019358-Test Client-HYG-RFT-Onsite",
          "event-start-date": { start: D(2) + " 00:00:00" }, "event-start-date-status": "Site Works Start Date is now Confirmed",
          "report-status": "Pending", "job-type": [jt("RFT, Respirator Fit Testing")] } }],
      [String(4003), { item_id: 4003, app_id: 30888380, title: "Occ noise", last_edit_on: NOW, synced_at: NOW,
        fields: { project: { title: "0019360 Job", item_id: 2 }, "event-reference": "0019360-Test Client-HYG-NSEOC-Noise",
          "event-start-date": { start: D(2) + " 00:00:00" }, "event-start-date-status": "Site Works Start Date is now Confirmed",
          "report-status": "Pending", "job-type": [jt("NSEOC, Detailed Occupational Noise Assessment (HYG)")] } }],
      [String(4004), { item_id: 4004, app_id: 30888385, title: "Vent survey", last_edit_on: NOW, synced_at: NOW,
        fields: { project: { title: "0019360 Job", item_id: 2 }, "event-reference": "0019360-Test Client-HYG-VENT-Plant",
          "event-start-date": { start: D(3) + " 00:00:00" }, "event-start-date-status": "Site Works Start Date is now Confirmed",
          "report-status": "Pending", "job-type": [jt("VENT, Ventilation")] } }]
    ]),
    v_field_podio_sync: new Map([["24280319", { app_id: 24280319, checked_at: new Date().toISOString() }]]),
    envss_events: new Map([
      ev("e-podio-3394530475", "0019358", "0019358-001", D(2), {
        podioItemId: "3394530475", podioAuto: true, podioLinked: true,
        podioReference: "0019358-001-Test Client-HYG-RFT,NSEOC-ACA,VENT-Site works",
        podioTypes: ["RFT", "NSEOC-ACA", "VENT"], podioJobTypes: ["RFT", "NSEOC-ACA", "VENT"],
        podioSeen: { startDate: D(2), startStatus: "Confirmed", jobNumber: "0019358", reference: "0019358-001-Test Client-HYG-RFT,NSEOC-ACA,VENT-Site works" }
      }),
      ev("e-podio-3394530476", "0019358", "0019358-002", D(3), {
        podioItemId: "3394530476", podioAuto: true, podioLinked: true,
        podioTypes: ["ACA"], podioJobTypes: ["ACA"],
        podioSeen: { startDate: D(3), jobNumber: "0019358", reference: "x" }
      }),
      ev("e-podio-3394530501", "0019358", "0019358-003", "", {
        podioItemId: "3394530501", podioAuto: true, podioLinked: true,
        podioTypes: ["ACA"], podioJobTypes: ["ACA"],
        podioSeen: { startDate: "", jobNumber: "0019358", reference: "x" }
      }),
      ev("e-podio-3394530502", "0019358", "0019358-004", D(5), {
        podioItemId: "3394530502", podioAuto: true, podioLinked: true, notes: "Keep my date",
        podioTypes: ["VENT"], podioJobTypes: ["VENT"],
        podioSeen: { startDate: D(5), startStatus: "Confirmed", jobNumber: "0019358", reference: "x" }
      }),
      ev("e-podio-3394530503", "0019358", "0019358-005", D(1), {
        podioItemId: "3394530503", podioAuto: true, podioLinked: true,
        podioTypes: ["RFT", "NSEOC-ACA", "VENT"], podioJobTypes: ["RFT", "NSEOC-ACA", "VENT"],
        podioSeen: { startDate: D(1), jobNumber: "0019358", reference: "old" }
      }),
      ev("eFit9358", "0019358", "0019358-FIT-001", D(2), { type: "fit", podioUnplanned: true, podioLinked: false }),
      ev("eAfm9358", "0019358", "ENVSS-HYG-AFM-0019358-001-" + D(1).replace(/-/g, ""), D(1), { type: "fibre" })
    ].map(r => [r.id, r])),
    envss_trains: new Map([
      ["tStarted", { id: "tStarted", payload: { id: "tStarted", eventId: "e-podio-3394530503", trainKind: "airborne_personal", sampleNo: 1, pouch: "1", status: "running", startAt: NOW, startFlow: "2.0", person: { first: "Sam", last: "Tester" }, audit: [] }, updated_at: NOW }]
    ]),
    envss_deletions: new Map(), envss_hires: new Map()
  };
}

const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
async function boot(vp, store, keepStorage) {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); page.mlog = mockSupabase(page, store, {});
  page.on("request", r => { const u = r.url(); if (!u.startsWith(url) && !u.startsWith("data:") && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|\.supabase\.co\//.test(u)) ext.push(vp + " " + r.method() + " " + u.split("?")[0]); });
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" });
  if (!keepStorage) await page.evaluate(() => localStorage.clear());
  await page.evaluate(SESSION);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(1200);
  return page;
}
const evs = page => page.evaluate(() => JSON.parse(JSON.stringify(db.events)));
const byId = (list, id) => list.find(e => e.id === id);
const waitFor = async (page, fn, arg, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await sleep(150); } return false; };
const refresh = async page => { await page.evaluate(() => window.envssPodio.refresh()); await sleep(1000); };

async function run(vp) {
  const L = s => `${vp}: ${s}`;
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, `jobtypes-${n}-${vp}.png`), fullPage: true });
  const store = remoteFixture();
  const page = await boot(vp, store);
  const before = page.errs.length;
  await waitFor(page, () => typeof activityLoaded !== "undefined" && activityLoaded && typeof projectsLoaded !== "undefined" && projectsLoaded);
  await refresh(page);
  await waitFor(page, () => db.events.some(e => e.id === "e-podio-3394530475" && Array.isArray(e.podioJobTypes) && e.podioJobTypes[0] === "ACA"), null, 12000);

  const list = await evs(page);
  const e001 = byId(list, "e-podio-3394530475");
  check(L("0019358-001 keeps its internal id e-podio-3394530475"), e001 && e001.id === "e-podio-3394530475", e001 && e001.id);
  check(L("0019358-001 stored Job Types become ACA (no longer RFT, NSEOC-ACA, VENT)"), e001 && JSON.stringify(e001.podioJobTypes) === '["ACA"]' && JSON.stringify(e001.podioTypes) === '["ACA"]', JSON.stringify(e001 && e001.podioJobTypes));
  check(L("0019358-001 unstarted planned event is renamed 0019358-ACA-001"), e001 && e001.code === "0019358-ACA-001", e001 && e001.code);
  check(L("0019358-001 samples were none and stay none"), !(list.some(e => e.id === "e-podio-3394530475") && (await page.evaluate(() => db.trains.filter(t => t.eventId === "e-podio-3394530475").length))), "");
  check(L("refresh is audited on 0019358-001"), e001 && (e001.audit || []).some(a => a.action === "Updated from Podio" && /podioJobTypes/.test(a.field) && /code/.test(a.field)), JSON.stringify(e001 && e001.audit && e001.audit.slice(-1)));

  const e002 = byId(list, "e-podio-3394530476");
  check(L("second unstarted ACA event on the job is 0019358-ACA-002 (numbered per type)"), e002 && e002.code === "0019358-ACA-002", e002 && e002.code);

  const eDate = byId(list, "e-podio-3394530501");
  check(L("empty date is filled from Podio (safe header)"), eDate && eDate.date === D(4), eDate && eDate.date);

  const eKeep = byId(list, "e-podio-3394530502");
  check(L("tech-entered date is not overwritten when Podio moves it"), eKeep && eKeep.date === D(5) && eKeep.notes === "Keep my date", JSON.stringify(eKeep && { d: eKeep.date, n: eKeep.notes }));
  const flags = await page.evaluate(() => (envssAuto.flagsFor(db.events.find(e => e.id === "e-podio-3394530502")) || []).map(f => f.kind + ":" + (f.to || "")));
  check(L("moved date still raises the review flag (staff choose Use Podio date / Keep as is)"), flags.some(f => f.startsWith("date:")), JSON.stringify(flags));

  const eStarted = byId(list, "e-podio-3394530503");
  const sample = await page.evaluate(() => JSON.parse(JSON.stringify(db.trains.find(t => t.id === "tStarted"))));
  check(L("started event with a sample keeps its code 0019358-005"), eStarted && eStarted.code === "0019358-005", eStarted && eStarted.code);
  check(L("started event still picks up current Job Types (ACA) on the stored event and the list"), eStarted && JSON.stringify(eStarted.podioJobTypes) === '["ACA"]', JSON.stringify(eStarted && eStarted.podioJobTypes));
  check(L("the running sample is untouched"), sample && sample.status === "running" && sample.startAt && sample.person && sample.person.first === "Sam", JSON.stringify(sample && { s: sample.status, p: sample.person }));

  const eFit = byId(list, "eFit9358");
  const eFitNew = list.find(e => e.podioItemId === "3394530600");
  check(L("unstarted hand-made FIT-001 is renamed 0019358-RFT-001 (not FIT)"), eFit && eFit.type === "fit" && eFit.code === "0019358-RFT-001" && !eFit.podioItemId, eFit && eFit.code);
  check(L("new Onsite RFT event is created as 0019358-RFT-002, type fit, id e-podio-3394530600"), eFitNew && eFitNew.type === "fit" && eFitNew.code === "0019358-RFT-002" && eFitNew.id === "e-podio-3394530600", JSON.stringify(eFitNew && { t: eFitNew.type, c: eFitNew.code, i: eFitNew.id }));

  const eAfm = byId(list, "eAfm9358");
  check(L("AFM event keeps its existing ENVSS-HYG-AFM-… code"), eAfm && eAfm.type === "fibre" && /^ENVSS-HYG-AFM-0019358-001-/.test(eAfm.code), eAfm && eAfm.code);

  /* events list wording for 0019358 */
  await page.evaluate(() => openProject("podio-p0019358")); await sleep(600);
  const rows = await page.evaluate(() => [...document.querySelectorAll("#app .brand-type")].map(x => x.innerText.replace(/\s+/g, " ").trim()));
  check(L("events list shows 0019358-ACA-001 · ACA, not the old RFT, NSEOC-ACA, VENT"), rows.some(t => /0019358-ACA-001/.test(t) && /ACA/.test(t) && !/RFT, NSEOC-ACA, VENT/.test(t)), JSON.stringify(rows));
  check(L("events list shows 0019358-RFT-001 and 0019358-RFT-002, not FIT"), rows.some(t => /0019358-RFT-001/.test(t)) && rows.some(t => /0019358-RFT-002/.test(t)) && !rows.some(t => /0019358-FIT-/.test(t)), JSON.stringify(rows));
  check(L("events list still shows the started event as 0019358-005 · ACA"), rows.some(t => /0019358-005/.test(t) && /ACA/.test(t)), JSON.stringify(rows));
  await shot(page, "0019358-list");

  /* new auto-creates on the other job */
  const eAca = list.find(e => e.podioItemId === "4001");
  const eMulti = list.find(e => e.podioItemId === "4002");
  const eNseoc = list.find(e => e.podioItemId === "4003");
  const eVent = list.find(e => e.podioItemId === "4004");
  check(L("new HYG ACA event is coded 0019360-ACA-001"), eAca && eAca.code === "0019360-ACA-001" && eAca.id === "e-podio-4001", eAca && eAca.code);
  check(L("HYG event with several types (RFT, NSEOC-ACA, VENT) uses primary NSEOC-ACA (RFT skipped)"), eMulti && eMulti.code === "0019360-NSEOC-ACA-001" && eMulti.type === "hygiene", eMulti && eMulti.code);
  check(L("Occ Noise app event is coded 0019360-NSEOC-001"), eNseoc && eNseoc.code === "0019360-NSEOC-001" && eNseoc.podioEventKind === "noise", eNseoc && eNseoc.code);
  check(L("Vent Survey app event is coded 0019360-VENT-001"), eVent && eVent.code === "0019360-VENT-001" && eVent.podioEventKind === "vent", eVent && eVent.code);

  /* parsing shapes + primary-type helper */
  const unit = await page.evaluate(() => {
    const jt = t => ({ title: t });
    const map = envssPodio.map;
    const a = map.mapItem({ item_id: 1, title: "T", fields: { "job-type-of-hyg-event": [jt("ACA, Airborne Contaminant Assessment (HYG)")] } });
    const b = map.mapItem({ item_id: 2, fields: { "job-type-of-hyg-event": "ACA, Airborne Contaminant Assessment (HYG)" } });
    const c = map.mapItem({ item_id: 3, fields: { "job-type": { text: "VENT, Ventilation" } } });
    const d = map.mapItem({ item_id: 4, fields: { "job-type-of-hyg-event": [{ value: { title: "NSEOC, Detailed Occupational Noise Assessment (HYG)" } }] } });
    return {
      a: a.jobTypes, b: b.jobTypes, c: c.jobTypes, d: d.jobTypes, title: a.title,
      tok: envssAuto.codeToken({ jobTypes: ["RFT", "NSEOC-ACA", "VENT"] }, { kind: "" }),
      tokApp: envssAuto.codeToken({ jobTypes: ["ACA"] }, { kind: "noise" }),
      tokAcaNsed: envssAuto.codeToken({ jobTypes: ["ACA-NSED"] }, {}),
      tokUnknown: envssAuto.codeToken({ jobTypes: ["WBVIB"] }, {}),
      tokFallback: envssAuto.codeToken({}, { kind: "noise" }),
      tokFit: envssAuto.codeToken({}, { fieldType: "fit", kind: "fit" }),
      started: envssAuto.eventHasStartedWork(db.events.find(e => e.id === "e-podio-3394530503")),
      unstarted: envssAuto.canRenameCode(db.events.find(e => e.id === "e-podio-3394530475"))
    };
  });
  check(L("Job Type parse: array of {title}, plain string, {text}, and {value:{title}} all yield the code"),
    JSON.stringify(unit.a) === '["ACA"]' && JSON.stringify(unit.b) === '["ACA"]' && JSON.stringify(unit.c) === '["VENT"]' && JSON.stringify(unit.d) === '["NSEOC"]',
    JSON.stringify(unit));
  check(L("mapItem keeps the Podio item title"), unit.title === "T", unit.title);
  check(L("code uses the Podio Job Type exactly (ACA-NSED, WBVIB, …); app kind is only a fallback when no Job Type is set"),
    unit.tok === "NSEOC-ACA" && unit.tokApp === "ACA" && unit.tokAcaNsed === "ACA-NSED" && unit.tokUnknown === "WBVIB" && unit.tokFallback === "NSEOC" && unit.tokFit === "RFT", JSON.stringify(unit));
  check(L("canRenameCode is false for the started event and true for the unstarted one"), unit.started === true && unit.unstarted === true, JSON.stringify(unit));

  /* nothing deleted */
  const still = await page.evaluate(() => ({
    evs: db.events.map(e => e.id).sort(),
    trains: db.trains.map(t => t.id),
    dels: (db.deletions || []).length
  }));
  check(L("no rows deleted (events, samples, no new tombstones from the refresh)"),
    still.evs.includes("e-podio-3394530475") && still.evs.includes("eFit9358") && still.evs.includes("eAfm9358") && still.trains.includes("tStarted") && still.dels === 0,
    JSON.stringify(still));

  /* offline: stored types survive, no Podio writes */
  const writes = (page.mlog || []).filter(l => /^(POST|PATCH|PUT|DELETE) /.test(l) && /v_field_|podio/i.test(l));
  check(L("no writes to the Podio mirror views"), writes.length === 0, JSON.stringify(writes.slice(0, 5)));
  await page.evaluate(() => { try { store && (store.offline = true); } catch (e) {} });
  /* simulate offline by using the already-saved event */
  const offline = await page.evaluate(() => {
    const e = db.events.find(x => x.id === "e-podio-3394530475");
    return { code: e.code, jt: e.podioJobTypes, list: eventServiceCodes(e) };
  });
  check(L("offline: the stored event still shows ACA / 0019358-ACA-001 from the last mirror (no live fetch needed)"),
    offline.code === "0019358-ACA-001" && JSON.stringify(offline.jt) === '["ACA"]' && offline.list[0] === "ACA", JSON.stringify(offline));

  check(L("no page errors"), page.errs.length === before, JSON.stringify(page.errs));
  await page.close();
}

const vps = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of vps) { console.log("=== " + vp); await run(vp); }
check("no requests to podio.com or other external hosts", !ext.some(u => /podio\.com/.test(u)), ext.filter(u => /podio/.test(u)).join(" | "));
const fails = results.filter(r => !r.ok);
fs.writeFileSync(path.join(OUT, "jobtypes-test-results.json"), JSON.stringify({ at: new Date().toISOString(), total: results.length, failed: fails.length, results }, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
await browser.close(); server.close(); process.exit(fails.length ? 1 : 0);
