/* v48.7 draft tests: auto-create field events from Podio (open item 11, John 20 + 23 Nov 2026 AWST).
   Usage: ROOT=/workspace/envss-auto node work/v48-7/test.mjs [pixel7|chromebook]   (default: both)
   Supabase is mocked in memory and *.supabase.co is mapped to a dead local port, so nothing reaches production.
   Podio is never called (the app reads the mirror view v_field_hyg_events, mocked here). Fixture names are made up. */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
const OUT = process.env.OUT || "/workspace/auto-shots"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 600) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date());
const D = n => { const d = new Date(TODAY + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const NOW = new Date().toISOString();
const proj = (job, name) => ({ id: "podio-p" + job, payload: { id: "podio-p" + job, number: job, name, source: "podio", status: "Active", podioItemId: "p" + job, site: "Test site" }, updated_at: NOW });
const item = (id, job, title, start, status, extra) => ({ item_id: id, title, last_edit_on: (extra && extra.lastEdit) || NOW, synced_at: NOW,
  fields: Object.assign({ project: { title: job + " " + title, item_id: 77000 + id }, "reference-3": job + "-Test Client-HYG-" + ((extra && extra.types) || "ACA NSED") + "-" + title,
    "site-works-start-date": start ? { start: start + " 00:00:00" } : null, "site-works-start-date-status": status || null,
    company: "Test Client", "first-name": "Pat", "last-name": "Contact", "contact-number": "0400 000 000", "task-description": "<p>Dust and noise</p>",
    "which-laboratory-is-processing-samples": { title: "Test Lab", item_id: 5 }, "generate-final-report": "Pending" }, (extra && extra.fields) || {}) });
const ev = (id, job, code, date, extra) => ({ id, payload: Object.assign({ id, projectId: "podio-p" + job, type: "hygiene", stage: "planned", date, code, multiDay: false, operators: [], audit: [] }, extra || {}), updated_at: NOW, updated_by: "Other Device <minah@envss.com.au>" });

const REPORT_DONE_FIX = [[9021, "Invoiced"], [9022, "No Report Required"], [9023, "Canceled"], [9024, "Final Report Generated"], [9025, "*Send final Report to Client"],
  [9026, "Report Sent"], [9027, "Event Canceled"], [9032, "Cancelled"], [9033, "Report Generated - Not Sent"], [9034, "Report Sent to Client"]];
function remoteFixture() {
  return {
    envss_projects: new Map([proj("0019500", "Auto A"), proj("0019501", "Auto no date"), proj("0019502", "Old backlog"), proj("0019503", "Deleted before"),
      proj("0019504", "AFM only"), proj("0019401", "Leichhardt hand-made"), proj("0019508", "Moved"), proj("0019509", "Deleted in Podio"), proj("0019510", "Race"),
      proj("0019511", "Reuse hand-made"), proj("0019512", "Hand-made had samples"), proj("0019513", "Deleted auto"), proj("0019514", "Deleted linked"), proj("0019515", "Deleted unknown kind"), proj("0019516", "Deleted here"),
      proj("0019517", "Kerr-like"), proj("0019518", "Old no date"), proj("0019519", "Has fit event"), proj("0019520", "Like 0019389"), proj("0019521", "Like 0019300")].map(p => [p.id, p])),
    v_field_hyg_events: new Map([
      item(9001, "0019500", "Site A", D(2), "Site Works Start Date is now Confirmed"),
      item(9002, "0019501", "Site B", "", "Site Works Start Date is Tentative"),
      item(9003, "0019502", "Old site", D(-30), "Site Works Start Date is now Confirmed"),
      item(9004, "0019503", "Was deleted", D(1), "Site Works Start Date is now Confirmed"),
      item(9005, "0019504", "AFM job", D(1), "Site Works Start Date is now Confirmed", { types: "AFM" }),
      item(9006, "0019401", "Lake MacLeod", D(12), "Site Works Start Date is Tentative"),
      item(9008, "0019508", "Moved site", D(6), "Site Works Start Date is now Confirmed"),
      item(9010, "0019510", "Race site", D(4), "Site Works Start Date is now Confirmed"),
      item(9011, "0019500", "Not required", D(3), "Site Works Start Date is Not Required"),
      /* report stage at or after Final Report Generated, all inside the date window -> never auto-created */
      ...REPORT_DONE_FIX.map(([id, rs]) => item(id, "0019500", "Done " + id, D(1), "Site Works Start Date is now Confirmed", { fields: { "generate-final-report": rs } })),
      item(9028, "0019500", "Site works not required", D(1), "Site Works Not Required"),
      item(9029, "0019500", "Pending report", D(1), "Site Works Start Date is now Confirmed", { fields: { "generate-final-report": "Pending" } }),
      item(9030, "0019500", "Report drafted", D(1), "Site Works Start Date is now Confirmed", { fields: { "generate-final-report": "Report Drafted" } }),
      item(9040, "0019511", "Reuse", D(3), "Site Works Start Date is now Confirmed"),
      item(9041, "0019512", "Samples", D(3), "Site Works Start Date is now Confirmed"),
      item(9042, "0019513", "Auto deleted", D(3), "Site Works Start Date is now Confirmed"),
      item(9043, "0019514", "Linked deleted", D(3), "Site Works Start Date is now Confirmed"),
      item(9044, "0019515", "Unknown", D(3), "Site Works Start Date is now Confirmed"),
      item(9050, "0019502", "Fit only", D(2), "Site Works Start Date is now Confirmed", { types: "RFT,HPFT" }),
      item(9051, "0019517", "Kerr-like", D(5), "Site Works Start Date is Tentative", { types: "RFT,NSEOC-ACA,VENT", fields: { "task-description": '<p>---------- Forwarded message ---------<br>From: Client &lt;client@example.com&gt;<br>Subject: FW: Airborne Contaminate Report</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p><p>Please quote respirator fit testing (RFT), occupational noise and airborne contaminants plus ventilation checks for the workshop.</p>' } }),
      item(9053, "0019518", "Old no date", "", "Site Works Start Date is Tentative", { lastEdit: new Date(Date.now() - 200 * 864e5).toISOString() }),
      item(9052, "0019519", "Hyg beside fit", D(4), "Site Works Start Date is now Confirmed"),
      item(9054, "0019520", "Like 0019389", D(6), "Site Works Start Date is now Confirmed"),
      /* 0019300-like: two Podio HYG events on one project + date; the second names -001 in its reference */
      item(9055, "0019521", "Kewdale", D(19), "Site Works Start Date is now Confirmed"),
      item(9056, "0019521", "Kewdale again", D(19), "Site Works Start Date is now Confirmed", { fields: { "reference-3": "0019521-001-Test Client-HYG-ACA NSED-Kewdale" } }),
      item(9031, "0019508", "Cancelled later", D(9), "Site Works Start Date is now Confirmed", { fields: { "generate-final-report": "Canceled" } })
    ].map(r => [String(r.item_id), r])),
    envss_events: new Map([
      ev("e-podio-9004", "0019503", "0019503-001", D(1), { podioItemId: "9004", podioAuto: true }),
      ev("eHand", "0019401", "0019401-001", D(12), { podioUnplanned: true, podioLinked: false, minesAct: true }),
      ev("e-podio-9008", "0019508", "0019508-001", D(5), { podioItemId: "9008", podioAuto: true, podioLinked: true, podioSeen: { startDate: D(5), startStatus: "Confirmed", jobNumber: "0019508", reference: "x" } }),
      ev("eOld9009", "0019509", "0019509-001", D(2), { podioItemId: "9009", podioLinked: true }),
      /* deleted events (tombstoned above): only eHandDel may give its code back */
      ev("eHandDel", "0019511", "0019511-001", D(3), { podioUnplanned: true, podioLinked: false }),
      ev("eHandS", "0019512", "0019512-001", D(3), { podioUnplanned: true, podioLinked: false }),
      ev("e-podio-9099", "0019513", "0019513-001", D(3), { podioItemId: "9099", podioAuto: true, podioLinked: true }),
      ev("eLinkDel", "0019514", "0019514-001", D(3), { podioItemId: "9098", podioLinked: true }),
      ev("eUnk", "0019515", "0019515-001", D(3), {}),
      ev("eFit", "0019519", "0019519-FIT-001", D(4), { type: "fit", podioUnplanned: true, podioLinked: false }),
      ev("eHand20", "0019520", "0019520-001", D(6), { podioUnplanned: true, podioLinked: false }),
      ev("eFitDel", "0019520", "0019520-FIT-001", D(6), { type: "fit", podioUnplanned: true, podioLinked: false }),
      ev("e-podio-9031", "0019508", "0019508-002", D(9), { podioItemId: "9031", podioAuto: true, podioLinked: true, podioSeen: { startDate: D(9), startStatus: "Site Works Start Date is now Confirmed", reportStatus: "Pending", jobNumber: "0019508", reference: "x" } })
    ].map(r => [r.id, r])),
    envss_deletions: new Map([...[["eHandDel", "0019511"], ["eHandS", "0019512"], ["e-podio-9099", "0019513"], ["eLinkDel", "0019514"], ["eUnk", "0019515"]].map(([id, job]) =>
      [id, { id, payload: { id, tombstone: "event", deletedEventId: id, eventId: id, projectId: "podio-p" + job, code: job + "-001", type: "hygiene", at: NOW, detail: "event deleted" }, updated_at: NOW }]),
      ["eFitDel", { id: "eFitDel", payload: { id: "eFitDel", tombstone: "event", deletedEventId: "eFitDel", eventId: "eFitDel", projectId: "podio-p0019520", code: "0019520-FIT-001", type: "fit", podioUnplanned: true, sampleCount: 0, at: NOW, detail: "event deleted" }, updated_at: NOW }],
      ["tS1", { id: "tS1", payload: { id: "tS1", trainId: "tS1", eventId: "eHandS", pouch: 1, kind: "airborne_personal", at: NOW, detail: "event deleted" }, updated_at: NOW }],
      ["e-podio-9004", { id: "e-podio-9004", payload: { id: "e-podio-9004", tombstone: "event", deletedEventId: "e-podio-9004", eventId: "e-podio-9004", projectId: "podio-p0019503", code: "0019503-001", type: "hygiene", at: NOW, detail: "event deleted" }, updated_at: NOW }]]),
    /* v48.15: the staff-only sync view: when the Podio sync last read each event app */
    v_field_podio_sync: new Map([["24280319", { app_id: 24280319, checked_at: new Date(Date.now() - 7 * 60e3).toISOString() }], ["30888380", { app_id: 30888380, checked_at: new Date(Date.now() - 9 * 60e3).toISOString() }]]),
    envss_trains: new Map([["tS1", { id: "tS1", payload: { id: "tS1", eventId: "eHandS", trainKind: "airborne_personal", sampleNo: 1, status: "prepped", pumpSerial: "88001" }, updated_at: NOW }]]), envss_hires: new Map()
  };
}

const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
async function boot(vp, store, keepStorage, pre, mopts) {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());   /* own storage + IndexedDB = a separate device */
  const page = await ctx.newPage();
  if (pre) await page.evaluateOnNewDocument(pre); page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "warning" && /v48\.7/.test(m.text())) page.errs.push(m.text()); });
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); page.mlog = mockSupabase(page, store, mopts || {});
  page.on("request", r => { const u = r.url(); if (!u.startsWith(url) && !u.startsWith("data:") && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|\.supabase\.co\//.test(u)) ext.push(vp + " " + r.method() + " " + u.split("?")[0]); });
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" });
  if (!keepStorage) await page.evaluate(() => localStorage.clear());
  await page.evaluate(SESSION);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(1200);
  return page;
}
const evs = page => page.evaluate(() => JSON.parse(JSON.stringify(db.events)));
const byItem = (list, item) => list.filter(e => String(e.podioItemId || "") === String(item));
const waitFor = async (page, fn, arg, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await sleep(150); } return false; };
const refresh = async page => { await page.evaluate(() => window.envssPodio.refresh()); await sleep(900); };

async function run(vp) {
  const shot = (page, n, full = true) => page.screenshot({ path: path.join(OUT, `${vp}-${n}.png`), fullPage: full });
  const store = remoteFixture();
  const page = await boot(vp, store);
  check(`[${vp}] app is v48.16`, await page.evaluate(() => APP_VERSION === "48.16" && document.getElementById("appVersion").textContent === "v48.16" && document.title === "ENVSS Field v48.16"));
  await waitFor(page, () => activityLoaded && projectsLoaded);
  const appsDefault = await page.evaluate(() => envssAuto.apps().map(a => [a.appId, a.fieldType, a.kind, a.enabled]));
  check(`[${vp}] default Podio event apps: HYG 24280319 hygiene; Occ Noise 30888380 hygiene/noise; Vent Survey 30888385 hygiene/vent; Onsite RFT 30888384 fit`,
    JSON.stringify(appsDefault) === JSON.stringify([["24280319", "hygiene", "", true], ["30888380", "hygiene", "noise", true], ["30888385", "hygiene", "vent", true], ["30888384", "fit", "fit", true]]), JSON.stringify(appsDefault));

  /* 0. not ready (events / tombstones not pulled yet) -> nothing created */
  const notReady = await page.evaluate(() => { activityLoaded = false; const before = db.events.length;
    window.dispatchEvent(new CustomEvent("envss:podio-hyg", { detail: { rows: [{ itemId: "9001", lastEdit: new Date().toISOString(), payload: Object.assign(envssPodio.map.mapItem({ item_id: 9001, fields: {} }), { planned: true, jobNumber: "0019500", startDate: "2099-01-01", itemId: "9001" }) }], complete: false } }));
    const after = db.events.length; activityLoaded = true; return [before, after, envssAuto.last().waiting]; });
  check(`[${vp}] before this device has pulled events + tombstones, nothing is created (waits)`, notReady[0] === notReady[1] && notReady[2] === true, JSON.stringify(notReady));

  /* 1. Refresh from Podio -> auto-create */
  await refresh(page);
  await waitFor(page, () => db.events.some(e => e.id === "e-podio-9001"));
  let list = await evs(page);
  const e1 = list.find(e => e.id === "e-podio-9001"), e2 = list.find(e => e.id === "e-podio-9002");
  check(`[${vp}] confirmed Podio event -> field event e-podio-9001 on the right project with Podio details`, e1 && e1.projectId === "podio-p0019500" && e1.date === D(2) && e1.podioAuto === true && e1.podioLinked === true && e1.lab === "Test Lab" && e1.poc.first === "Pat" && /^0019500-00\d$/.test(e1.code) && e1.podioSeen.startDate === D(2), JSON.stringify(e1));
  check(`[${vp}] audit says 'Created automatically from Podio'`, e1 && e1.audit.length === 1 && e1.audit[0].action === "Created automatically from Podio", JSON.stringify(e1 && e1.audit));
  check(`[${vp}] tentative Podio event with no date is created too (no wait for confirmed), date left blank`, e2 && e2.date === "" && e2.podioItemId === "9002", JSON.stringify(e2));
  check(`[${vp}] v48.14: backlog event (start 30 days ago) IS auto-created now (no date window)`, byItem(list, "9003").length === 1 && byItem(list, "9003")[0].podioAuto === true, JSON.stringify(byItem(list, "9003")));
  check(`[${vp}] v48.14: Podio event with no date, last edited 200 days ago, is auto-created too`, byItem(list, "9053").length === 1);
  check(`[${vp}] fit-testing-only HYG item (RFT,HPFT) is not made into a hygiene event`, byItem(list, "9050").length === 0);
  const k = byItem(list, "9051")[0];
  check(`[${vp}] Kerr-like item (RFT,NSEOC-ACA,VENT + long forwarded email) -> ONE hygiene event, never a fit event`, byItem(list, "9051").length === 1 && k.type === "hygiene" && /^0019517-00\d$/.test(k.code) && !list.some(e => e.projectId === "podio-p0019517" && e.type === "fit"), JSON.stringify(k && { type: k.type, code: k.code }));
  check(`[${vp}] long Podio task text kept in full on the record (nothing trimmed), notes left empty`, k && k.taskDesc.length > 3000 && /Forwarded message/.test(k.taskDesc) && !k.notes, k && k.taskDesc.length);
  check(`[${vp}] Podio scope stored from the reference: RFT, NSEOC-ACA, VENT`, k && JSON.stringify(k.podioTypes) === '["RFT","NSEOC-ACA","VENT"]', JSON.stringify(k && k.podioTypes));
  const fitE = list.find(e => e.id === "eFit"), h19 = byItem(list, "9052");
  check(`[${vp}] hygiene event beside a fit event on the same job + date: hygiene auto-created, no link offer to the fit event`, h19.length === 1 && h19[0].type === "hygiene" && /^0019519-00\d$/.test(h19[0].code) && !(await page.evaluate(() => envssAuto.offers()))["9052"], JSON.stringify(h19.map(e => e.code)));
  check(`[${vp}] fit event untouched (type, code, no Podio link, no audit added)`, fitE && fitE.type === "fit" && fitE.code === "0019519-FIT-001" && !fitE.podioItemId && !fitE.podioLinked && (fitE.audit || []).length === 0, JSON.stringify(fitE));
  const offers20 = (await page.evaluate(() => envssAuto.offers()))["9054"];
  const e20 = byItem(list, "9054");
  check(`[${vp}] v48.15 0019389-like (hand-made -001 alive + tombstoned FIT event): Podio event auto-created as its own event (-002), no link offer, hand-made untouched, FIT code not reused`, e20.length === 1 && e20[0].code === "0019520-002" && e20[0].type === "hygiene" && !offers20 && !list.find(e => e.id === "eHand20").podioItemId && !list.some(e => e.projectId === "podio-p0019520" && e.type === "fit") && JSON.stringify(await page.evaluate(() => envssAuto.reusableCodes("podio-p0019520"))) === "[]", JSON.stringify([e20.map(e => e.code), offers20]));
  check(`[${vp}] event deleted here (tombstone) is NOT re-created`, byItem(list, "9004").length === 0 && !list.some(e => e.id === "e-podio-9004"));
  check(`[${vp}] AFM-only HYG item is skipped (AFM flow owns it)`, byItem(list, "9005").length === 0);
  check(`[${vp}] Podio 'Not required' item is not created`, byItem(list, "9011").length === 0);
  const doneMade = REPORT_DONE_FIX.map(([id, rs]) => [rs, byItem(list, id).length]).filter(x => x[1]);
  check(`[${vp}] report stage Invoiced / No Report Required / Canceled / Cancelled / Final Report Generated / Send final / Report Sent / legacy texts: none auto-created`, !doneMade.length, JSON.stringify(doneMade));
  check(`[${vp}] start status 'Site Works Not Required' (exact Podio option) is not created`, byItem(list, "9028").length === 0);
  check(`[${vp}] earlier report stages still count as planned: Pending and Report Drafted are created`, byItem(list, "9029").length === 1 && byItem(list, "9030").length === 1);
  const unit = await page.evaluate(() => { const P = (rs, st, coc) => envssPodio.map.isPlanned({ reportStatus: rs, startStatus: st || "Site Works Start Date is now Confirmed", cocStatus: coc || "" });
    return { invoiced: P("Invoiced"), nrr: P("No Report Required"), canceled: P("Canceled"), cancelled: P("Cancelled"), cancelledCase: P(" cancelled "), frg: P("Final Report Generated"), send: P("*Send final Report to Client"),
      sent: P("Report Sent"), legacyCancel: P("Event Canceled"), legacyNotSent: P("Report Generated - Not Sent"), legacySent: P("Report Sent to Client"), swnr: P("", "Site Works Not Required"), lab: P("", "", "Lab Results Received"),
      pending: P("Pending"), drafted: P("Report Drafted"), review: P("Report in Review"), authorise: P("I have conducted a review and authorise the report to be sent to client once Pdf'd"), blank: P(""), tentative: P("", "Site Works Start Date is Tentative"), nostatus: P("", "") }; });
  const off = ["invoiced", "nrr", "canceled", "cancelled", "cancelledCase", "frg", "send", "sent", "legacyCancel", "legacyNotSent", "legacySent", "swnr", "lab"], on = ["pending", "drafted", "review", "authorise", "blank", "tentative", "nostatus"];
  check(`[${vp}] isPlanned on exact Podio option texts: done stages false, earlier stages true`, off.every(k => unit[k] === false) && on.every(k => unit[k] === true), JSON.stringify(unit));
  check(`[${vp}] v48.15 (John: "if created in Podio just add"): Podio event beside hand-made 0019401-001 on the same date is created (0019401-002), no link offer, hand-made untouched`, byItem(list, "9006").length === 1 && byItem(list, "9006")[0].code === "0019401-002" && JSON.stringify(await page.evaluate(() => envssAuto.offers())) === "{}" && !list.find(e => e.id === "eHand").podioItemId, JSON.stringify([byItem(list, "9006").map(e => e.code), await page.evaluate(() => envssAuto.offers())]));
  check(`[${vp}] already-linked events are not duplicated (9008 stays one event)`, byItem(list, "9008").length === 1);
  const last = await page.evaluate(() => envssAuto.last());
  check(`[${vp}] 0019300-like: two Podio events on one project + date -> two field events (Podio is the source), no link offer between them`, byItem(list, "9055").length === 1 && byItem(list, "9056").length === 1 && !(await page.evaluate(() => envssAuto.offers()))["9056"]);
  check(`[${vp}] 0019300-like: the Podio event whose reference says -001 gets 0019521-001; the other gets -002`, byItem(list, "9056")[0].code === "0019521-001" && byItem(list, "9055")[0].code === "0019521-002", JSON.stringify([byItem(list, "9055")[0].code, byItem(list, "9056")[0].code]));
  check(`[${vp}] run summary created 18 (9001, 9002, 9003, 9006, 9010, 9029, 9030, 9040-9044, 9051-9056)`, last.created.length === 18, JSON.stringify(last));
  /* code reuse (John, 23 Nov 2026 20:05 AWST) */
  const codeOf = i => (byItem(list, i)[0] || {}).code;
  check(`[${vp}] deleted hand-made duplicate with no samples: auto event reuses its code (0019511-001)`, codeOf("9040") === "0019511-001", codeOf("9040"));
  check(`[${vp}] the deleted hand-made event itself is not re-created`, !list.some(e => e.id === "eHandDel") && store.envss_events.get("eHandDel").payload.podioUnplanned === true && !store.envss_events.get("eHandDel").payload.podioItemId);
  check(`[${vp}] deleted hand-made event that had samples keeps its code reserved (0019512-002)`, codeOf("9041") === "0019512-002", codeOf("9041"));
  check(`[${vp}] deleted auto-created event keeps its code reserved (0019513-002)`, codeOf("9042") === "0019513-002", codeOf("9042"));
  check(`[${vp}] deleted Podio-linked event keeps its code reserved (0019514-002)`, codeOf("9043") === "0019514-002", codeOf("9043"));
  check(`[${vp}] deleted event of unknown kind (no hand-made flag) keeps its code reserved (0019515-002)`, codeOf("9044") === "0019515-002", codeOf("9044"));
  await waitFor(page, () => !syncState.pending["events:e-podio-9001"] && !syncState.pending["events:e-podio-9010"]);
  check(`[${vp}] auto-created events reach Supabase (mock) as upserts`, store.envss_events.has("e-podio-9001") && store.envss_events.get("e-podio-9001").payload.podioItemId === "9001" && store.envss_events.get("e-podio-9001").project_id === "podio-p0019500");

  /* 2. idempotent: refresh again + reload -> no duplicates */
  await page.evaluate(() => { envssPodio.state(); }); await refresh(page); await page.evaluate(() => envssAuto.run());
  await page.reload({ waitUntil: "networkidle0" }); await sleep(1200); await waitFor(page, () => activityLoaded && projectsLoaded); await refresh(page); await page.evaluate(() => envssAuto.run()); await sleep(600);
  list = await evs(page);
  const dupes = ["9001", "9002", "9008", "9009", "9010", "9040", "9041", "9042", "9043", "9044"].map(i => byItem(list, i).length);
  check(`[${vp}] idempotent: after 3 more runs and a reload, exactly one field event per Podio event`, dupes.every(n => n === 1), JSON.stringify(dupes));
  const evRows = [...store.envss_events.values()].filter(r => r.payload && r.payload.podioItemId === "9001");
  check(`[${vp}] idempotent in Supabase: one envss_events row for Podio 9001`, evRows.length === 1, evRows.length);

  /* 3. project page: auto-created card + screenshots */
  await page.evaluate(() => openProject("podio-p0019500")); await sleep(700);
  const card1 = await page.evaluate(() => (document.querySelector('[data-podio-item="9001"]') || {}).textContent || "");
  const cardInfo = await page.evaluate(() => { const c = document.querySelector('[data-podio-item="9001"]'); const e = db.events.find(x => x.podioItemId === "9001"); return { openBtn: !!(c && c.querySelector("[data-v487-open]")), anyBtn: c ? c.querySelectorAll("button").length : -1, text: c ? (c.querySelector(".v4815-ev") || {}).textContent || "" : "", code: e ? e.code : "", rowInList: !!e && [...document.querySelectorAll("#app .wrap *")].some(el => el.children.length === 0 && el.textContent.trim() === e.code) }; });
  check(`[${vp}] v48.15 Planned in Podio card: no Open button; says the event code, that it is in the events list; the event row is in the list`, !cardInfo.openBtn && cardInfo.anyBtn === 0 && cardInfo.text.includes(cardInfo.code) && /events list below/.test(cardInfo.text) && cardInfo.rowInList, JSON.stringify(cardInfo));
  const ui2 = await page.evaluate(() => {
    const bar = (document.getElementById("syncBar") || {}).textContent || "";
    const menu = document.getElementById("projectMenu"), imp = document.getElementById("importCsv");
    const job = document.querySelector("#app .proj-job"), fab = document.querySelector(".fab");
    return { bar, menuTopRight: !!menu && menu.getBoundingClientRect().right > menu.closest(".wrap").getBoundingClientRect().right - 40 && menu.getBoundingClientRect().top + window.scrollY < 300,
      importInMenu: !!imp && !!imp.closest("#projectMenu"), importLabel: imp ? imp.closest("label").textContent.trim() : "",
      importHiddenUntilOpen: !!menu && !menu.open,
      jobText: job ? job.textContent.trim() : "", jobPx: job ? parseFloat(getComputedStyle(job).fontSize) : 0,
      oldImportOutside: [...document.querySelectorAll("#app label")].some(l => /Import field CSV/.test(l.textContent) && !l.closest("#projectMenu")) };
  });
  const pnote = await page.evaluate(hygCheck => { return { note: envssPodio.state().note || "", bar: (document.getElementById("syncBar") || {}).textContent || "", expect: "Checked Podio " + fmtWhen(hygCheck) }; }, store.v_field_podio_sync.get("24280319").checked_at);
  check(`[${vp}] v48.15 Podio status: 'Checked Podio <sync check time of the HYG app> · last Podio change <time> · N planned Podio events', no 'Podio jobs updated'`, pnote.note.startsWith(pnote.expect + " · last Podio change ") && /· \d+ planned Podio events?\.$/.test(pnote.note) && !/Podio jobs updated/.test(pnote.bar) && pnote.bar.includes(pnote.note), JSON.stringify(pnote));
  const unitSt = await page.evaluate(() => [envssPodioStatus("", "2026-11-26T06:50:57Z", 19), envssPodioStatus("", "", 1), fmtWhen(new Date(Date.now() - 864e5).toISOString()).startsWith("yesterday ")]);
  check(`[${vp}] v48.15 status without a sync time: 'Last Podio change … · 19 planned Podio events.' (no made-up check time)`, /^Last Podio change .+ · 19 planned Podio events\.$/.test(unitSt[0]) && unitSt[1] === "1 planned Podio event." && unitSt[2], JSON.stringify(unitSt));
  check(`[${vp}] status bar in plain English: 'Last synced', 'Project list updated', no 'Supabase', no 'pending'`, /Last synced /.test(ui2.bar) && /Project list updated /.test(ui2.bar) && !/Supabase/i.test(ui2.bar) && !/pending/.test(ui2.bar) && !/last sync /.test(ui2.bar), ui2.bar);
  check(`[${vp}] Import field CSV is in the ☰ menu at the top right (closed until tapped), not on the page`, ui2.menuTopRight && ui2.importInMenu && ui2.importLabel === "Import field CSV" && ui2.importHiddenUntilOpen && !ui2.oldImportOutside, JSON.stringify(ui2));
  check(`[${vp}] job number is a heading (0019500, at least 22px)`, ui2.jobText === "0019500" && ui2.jobPx >= 22, JSON.stringify(ui2));
  await page.evaluate(() => { document.querySelector("#projectMenu summary").click(); });
  const menuOpen = await page.evaluate(() => { const m = document.getElementById("projectMenu"), l = document.getElementById("importCsv").closest("label"); return m.open && l.getBoundingClientRect().height > 30; });
  check(`[${vp}] tapping ☰ shows Import field CSV`, menuOpen);
  await page.evaluate(() => { const m = document.getElementById("projectMenu"); if (m) m.open = false; });
  check(`[${vp}] project's Podio list says created automatically, names the event (no Open, no Start fieldwork)`, /created automatically/.test(card1) && /0019500-00\d/.test(card1) && !/Open project event/.test(card1) && !/Start fieldwork/.test(card1), card1);
  await shot(page, "01-project-auto-created");
  await page.evaluate(() => openEvent("e-podio-9001")); await sleep(400);
  const autoNote = await page.evaluate(() => (document.getElementById("v487Auto") || {}).textContent || "");
  check(`[${vp}] event screen shows 'Created automatically from Podio' note`, /Created automatically from Podio/.test(autoNote), autoNote);
  await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "02-event-auto-note", false);

  /* 4. Start fieldwork stays as the fallback (here: a fit-testing-only HYG item that is not auto-created) */
  await page.evaluate(() => openProject("podio-p0019502")); await sleep(700);
  const card3 = await page.evaluate(() => (document.querySelector('[data-podio-item="9050"]') || {}).textContent || "");
  check(`[${vp}] item that is not auto-created still shows Start fieldwork (fallback)`, /Start fieldwork/.test(card3), card3);
  const ui = await page.evaluate(() => { const t = document.getElementById("btnNewEventTop"), f = document.querySelector(".fab"), u = document.getElementById("btnUnplanned"), nb = document.querySelector('[data-go="add"]'), mi = document.getElementById("menuAddEvent");
    return { top: !!t, fabShown: !!f && !f.hidden && getComputedStyle(f).display !== "none", un: !!u, hint: (document.getElementById("v4814Hint") || {}).textContent || "", navAddHidden: !nb || getComputedStyle(nb).visibility === "hidden" || nb.disabled, menuItem: mi ? mi.textContent : "", inMenu: !!mi && !!mi.closest("#projectMenu") }; });
  check(`[${vp}] v48.14 project page: no floating '+', no header or Podio-card add button, no bottom-bar '+'; 'Add event not in Podio' is in the ☰ menu`, !ui.top && !ui.fabShown && !ui.un && ui.navAddHidden && ui.menuItem === "Add event not in Podio" && ui.inMenu && /☰/.test(ui.hint), JSON.stringify(ui));
  const before = (await evs(page)).length;
  await page.evaluate(() => { document.querySelector("#projectMenu summary").click(); }); await sleep(150);
  await page.evaluate(() => document.getElementById("menuAddEvent").click()); await sleep(300);
  const pgNew = await page.evaluate(() => view.page);
  check(`[${vp}] ☰ › Add event not in Podio opens the new-event form for this project (nothing made until saved)`, pgNew === "newEvent" && (await evs(page)).length === before, pgNew);
  await page.evaluate(() => openProject("podio-p0019517")); await sleep(500);
  const longCard = await page.evaluate(() => { const c = document.querySelector('[data-podio-item="9051"]'); return c ? { det: !!c.querySelector("details.v4814-task"), open: !!(c.querySelector("details.v4814-task") || {}).open, show: /Show all/.test(c.textContent) } : null; });
  const afm = await page.evaluate(() => ({ btn: !!document.getElementById("btnAfmPodioRefresh"), note: !!document.getElementById("afmPodioNote") }));
  check(`[${vp}] Planned in Podio card: long forwarded email collapsed behind 'Show all' (closed)`, longCard && longCard.det && !longCard.open && longCard.show, JSON.stringify(longCard));
  await page.evaluate(() => openProject("podio-p0019502")); await sleep(500);
  check(`[${vp}] AFM card: no 'Refresh AFM from Podio' button and no refresh note`, !afm.btn && !afm.note, JSON.stringify(afm));
  await shot(page, "03-project-fallback-start-fieldwork");
  await page.evaluate(() => document.querySelector('[data-podio-start="9050"]').click()); await sleep(500);
  list = await evs(page);
  const e3 = byItem(list, "9050");
  check(`[${vp}] Start fieldwork creates one event, deterministic id, not marked auto`, e3.length === 1 && e3[0].id === "e-podio-9050" && e3[0].podioAuto === false && e3[0].audit[0].action === "Started from Podio (Start fieldwork)", JSON.stringify(e3));
  await page.evaluate(() => openProject("podio-p0019500")); await sleep(500);
  const fab2 = await page.evaluate(() => { const f = document.querySelector(".fab"); return f && f.className; });
  await page.evaluate(() => openEvent("e-podio-9001")); await sleep(400);
  const fab3 = await page.evaluate(() => { const f = document.querySelector(".fab"); return [f && f.className, f && f.textContent]; });
  check(`[${vp}] floating '+ Add sample' still on the event screen (wide screens)`, /Add sample/.test(fab3[1]), JSON.stringify([fab2, fab3]));

  /* 4b. Kerr-like event screen: scope line + long task text collapsed */
  await page.evaluate(() => openProject("podio-p0019517")); await sleep(600);
  await shot(page, "03b-project-kerr-like-in-events-list");
  await page.evaluate(() => openEvent("e-podio-9051")); await sleep(500);
  const ks = await page.evaluate(() => ({ scope: (document.getElementById("v4814Scope") || {}).textContent || "", det: !!document.querySelector("#podioPrefill details.v4814-task"), open: (document.querySelector("#podioPrefill details.v4814-task") || {}).open, sum: ((document.querySelector("#podioPrefill details.v4814-task summary") || {}).textContent || "").length }));
  check(`[${vp}] event shows 'Podio scope' with occupational noise in this event and fit testing as separate`, /NSEOC-ACA — occupational noise \+ airborne contaminants/.test(ks.scope) && /RFT — respirator fit testing \(a separate fit-test event/.test(ks.scope), ks.scope);
  check(`[${vp}] long Podio task text shown collapsed (short preview + Show all)`, ks.det && !ks.open && ks.sum < 360, JSON.stringify(ks));
  await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "03c-event-kerr-like-scope", false);

  /* 5. tombstoned Podio event: card wording + deliberate re-create gets a fresh id */
  await page.evaluate(() => openProject("podio-p0019503")); await sleep(700);
  const card4 = await page.evaluate(() => (document.querySelector('[data-podio-item="9004"]') || {}).textContent || "");
  check(`[${vp}] deleted event's card says it will not be created again, offers Start fieldwork again`, /will not be created again/.test(card4) && /Start fieldwork again/.test(card4), card4);
  await shot(page, "04-project-deleted-not-recreated");

  /* 6. v48.15: hand-made event on the same job + date -> no prompt, the Podio event has its own field event */
  await page.evaluate(() => openProject("podio-p0019401")); await sleep(700);
  const card6 = await page.evaluate(() => (document.querySelector('[data-podio-item="9006"]') || {}).textContent || "");
  check(`[${vp}] v48.15 project card: no 'Link' / 'Create a separate event' prompt; says 0019401-002 was created automatically`, !/Link 0019401-001/.test(card6) && !/Create a separate event/.test(card6) && /0019401-002 was created automatically/.test(card6), card6);
  const rows6 = await page.evaluate(() => [...document.querySelectorAll("#app .brand-type")].map(x => x.textContent.trim()));
  check(`[${vp}] v48.15 events list shows both 0019401-001 (hand-made) and 0019401-002 (Podio)`, rows6.some(x => /^0019401-001/.test(x)) && rows6.some(x => /^0019401-002/.test(x)), JSON.stringify(rows6));
  await shot(page, "05-project-no-link-prompt");
  await page.evaluate(() => openEvent("eHand")); await sleep(400);
  const offerEv = await page.evaluate(() => document.querySelectorAll("[data-v487-offer],[data-v487-link],[data-v487-separate]").length);
  check(`[${vp}] v48.15 hand-made event screen: no 'Link to this Podio event' prompt`, offerEv === 0, String(offerEv));
  list = await evs(page);
  const hand = list.find(e => e.id === "eHand");
  check(`[${vp}] hand-made event unchanged (no Podio link, date and Mines Act kept)`, !hand.podioItemId && hand.date === D(12) && hand.minesAct === true, JSON.stringify(hand));

  /* 7. Podio event moved -> flagged, never changed automatically */
  const moved = list.find(e => e.id === "e-podio-9008");
  check(`[${vp}] Podio moved 9008 (start +5 -> +6): field event date NOT changed`, moved.date === D(5), moved.date);
  await page.evaluate(() => { view.page = "dash"; render(); }); await sleep(300);
  const dash = await page.evaluate(() => (document.getElementById("v487Dash") || {}).textContent || "");
  check(`[${vp}] dashboard lists events that changed in Podio (0019508-001 moved, 0019509-001 gone)`, /0019508-001/.test(dash) && /0019509-001/.test(dash), dash);
  await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "07-dashboard-review", false);
  await page.evaluate(() => openEvent("e-podio-9008")); await sleep(400);
  const flag = await page.evaluate(() => (document.getElementById("v487Flags") || {}).textContent || "");
  check(`[${vp}] event screen flag: 'Moved in Podio' + Use Podio date + Keep as is`, /Moved in Podio/.test(flag) && /Use Podio date/.test(flag) && /Keep as is/.test(flag) && /Nothing here was changed automatically/.test(flag), flag);
  await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "08-event-moved-flag", false);
  await page.click('[data-v487-usedate="e-podio-9008"]'); await sleep(400);
  const m2 = (await evs(page)).find(e => e.id === "e-podio-9008");
  check(`[${vp}] Use Podio date (staff tap, confirmed) changes the date and audits it; flag clears`, m2.date === D(6) && m2.audit.some(a => a.action === "Date changed to match Podio" && a.from === D(5) && a.to === D(6)) && !(await page.evaluate(() => !!document.getElementById("v487Flags"))), JSON.stringify(m2.audit));

  /* 7b. Podio report status changed to Canceled after the field event was made -> flagged, not changed */
  await page.evaluate(() => openEvent("e-podio-9031")); await sleep(400);
  const canc = await page.evaluate(() => (document.getElementById("v487Flags") || {}).textContent || "");
  const c9031 = (await evs(page)).find(e => e.id === "e-podio-9031");
  check(`[${vp}] linked event later Canceled in Podio: 'Marked Canceled in Podio' flag, event untouched`, /Marked Canceled in Podio/.test(canc) && c9031 && c9031.date === D(9) && c9031.stage === "planned", canc);
  await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "10-event-cancelled-flag", false);

  /* 8. deleted in Podio -> flagged, Keep as is */
  await page.evaluate(() => openEvent("eOld9009")); await sleep(400);
  const gone = await page.evaluate(() => (document.getElementById("v487Flags") || {}).textContent || "");
  check(`[${vp}] linked event whose Podio item is gone: 'no longer in Podio' flag, event untouched`, /no longer in Podio/.test(gone) && /Keep as is/.test(gone) && !/Use Podio date/.test(gone), gone);
  await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "09-event-gone-flag", false);
  await page.click('[data-v487-keep="eOld9009"]'); await sleep(400);
  const g2 = (await evs(page)).find(e => e.id === "eOld9009");
  check(`[${vp}] Keep as is records the review (audit) and clears the flag; event still there`, g2 && g2.podioSeen && g2.podioSeen.gone === true && g2.audit.some(a => /kept as is/.test(a.action)) && !(await page.evaluate(() => !!document.getElementById("v487Flags"))), JSON.stringify(g2));

  /* 9. staff delete an auto-created event -> tombstone with podioItemId -> never re-created (this device and a fresh device) */
  await page.evaluate(() => { isAdmin = () => true; window.isAdmin = isAdmin; deleteEvent("e-podio-9002"); }); await sleep(600);
  await waitFor(page, () => !Object.keys(syncState.pending).length);
  const tomb = store.envss_deletions.get("e-podio-9002");
  check(`[${vp}] delete writes a tombstone with the Podio item id (no row delete)`, tomb && tomb.payload.podioItemId === "9002" && tomb.payload.tombstone === "event" && store.envss_events.has("e-podio-9002"), JSON.stringify(tomb && tomb.payload));
  await refresh(page); await page.evaluate(() => envssAuto.run()); await sleep(500);
  check(`[${vp}] next sync does not re-create the deleted event`, byItem(await evs(page), "9002").length === 0);
  const fresh = await boot(vp, store);    /* another device, empty storage, same Supabase */
  await waitFor(fresh, () => activityLoaded && projectsLoaded); await refresh(fresh); await fresh.evaluate(() => envssAuto.run()); await sleep(600);
  const fl = await evs(fresh);
  check(`[${vp}] fresh device: same codes (reuse only for the hand-made one), no new events`, byItem(fl, "9040").length === 1 && byItem(fl, "9040")[0].code === "0019511-001" && byItem(fl, "9041")[0].code === "0019512-002" && !fl.some(e => e.id === "eHandDel" || e.id === "eHandS"), JSON.stringify(["9040", "9041"].map(i => byItem(fl, i).map(e => e.code))));
  check(`[${vp}] fresh device: deleted event not re-created; others not duplicated`, byItem(fl, "9002").length === 0 && byItem(fl, "9004").length === 0 && byItem(fl, "9001").length === 1 && byItem(fl, "9006").length === 1, JSON.stringify(["9001", "9002", "9004", "9006"].map(i => byItem(fl, i).length)));
  await fresh.close();

  /* 9b. hand-made event deleted on THIS device (new tombstone fields), then the Podio event appears -> reuses -001 */
  await page.evaluate(() => { db.events.push({ id: "eLocalHand", projectId: "podio-p0019516", type: "hygiene", stage: "planned", date: "", code: "0019516-001", multiDay: false, operators: [], audit: [], podioUnplanned: true, podioLinked: false }); commit(); });
  await sleep(600);
  await page.evaluate(() => deleteEvent("eLocalHand")); await sleep(800);
  const lt = await page.evaluate(() => (db.deletions.find(d => d.deletedEventId === "eLocalHand") || {}));
  check(`[${vp}] local delete tombstone records hand-made + sample count`, lt.podioUnplanned === true && lt.podioAuto === false && lt.sampleCount === 0 && lt.podioItemId === "", JSON.stringify(lt));
  store.v_field_hyg_events.set("9045", item(9045, "0019516", "Deleted here", D(4), "Site Works Start Date is now Confirmed"));
  await refresh(page); await page.evaluate(() => envssAuto.run()); await sleep(300);
  const l16 = await evs(page);
  check(`[${vp}] after deleting a hand-made event here, the Podio event gets 0019516-001; the deleted one stays deleted`, (byItem(l16, "9045")[0] || {}).code === "0019516-001" && !l16.some(e => e.id === "eLocalHand"), JSON.stringify(byItem(l16, "9045")));

  /* 10. race: another device creates + edits the same event between this device's run and its first send -> Supabase wins */
  const race = await boot(vp, store);
  await waitFor(race, () => activityLoaded && projectsLoaded);
  store.v_field_hyg_events.set("9012", item(9012, "0019510", "Race two", D(5), "Site Works Start Date is now Confirmed"));
  await race.evaluate(() => { flushing = true; });            /* hold this device's queue */
  await refresh(race); await race.evaluate(() => envssAuto.run());
  const localMade = await race.evaluate(() => !!db.events.find(e => e.id === "e-podio-9012"));
  store.envss_events.set("e-podio-9012", ev("e-podio-9012", "0019510", "0019510-002", D(5), { podioItemId: "9012", podioAuto: true, operators: ["Minah"], notes: "edited on the other device" }));
  await race.evaluate(() => { flushing = false; flushQueue(); }); await sleep(1200);
  const rRow = store.envss_events.get("e-podio-9012"), rLocal = (await evs(race)).find(e => e.id === "e-podio-9012");
  check(`[${vp}] race: Supabase row made/edited by another device is kept, never overwritten; this device adopts it`, localMade && rRow.updated_by === "Other Device <minah@envss.com.au>" && rRow.payload.notes === "edited on the other device" && rLocal && rLocal.notes === "edited on the other device" && JSON.stringify(rLocal.operators) === '["Minah"]' && (await race.evaluate(() => envssAuto.last().adopted)).includes("e-podio-9012"), JSON.stringify({ rRow, rLocal }));
  /* race with a tombstone: another device deleted it already */
  store.v_field_hyg_events.set("9013", item(9013, "0019510", "Race three", D(6), "Site Works Start Date is now Confirmed"));
  await race.evaluate(() => { flushing = true; }); await refresh(race); await race.evaluate(() => envssAuto.run());
  store.envss_events.set("e-podio-9013", ev("e-podio-9013", "0019510", "0019510-003", D(6), { podioItemId: "9013", podioAuto: true }));
  store.envss_deletions.set("e-podio-9013", { id: "e-podio-9013", payload: { id: "e-podio-9013", tombstone: "event", deletedEventId: "e-podio-9013", eventId: "e-podio-9013", projectId: "podio-p0019510", code: "0019510-003", podioItemId: "9013", at: NOW }, updated_at: NOW });
  await race.evaluate(() => { flushing = false; flushQueue(); }); await sleep(1000);
  await race.evaluate(() => pullActivity()); await sleep(600); await race.evaluate(() => envssAuto.run()); await sleep(300);
  check(`[${vp}] race with a delete on another device: row not overwritten, event hidden, not re-created`, store.envss_events.get("e-podio-9013").updated_by === "Other Device <minah@envss.com.au>" && byItem(await evs(race), "9013").length === 0);
  await race.close();

  /* 10b. background: a device that just opens the app (no Refresh tap) creates new Podio events within seconds, top-bar note untouched */
  store.v_field_hyg_events.set("9014", item(9014, "0019500", "Opened only", D(8), "Site Works Start Date is Tentative"));
  const bg = await boot(vp, store);
  const bgOk = await waitFor(bg, () => db.events.some(e => e.id === "e-podio-9014"), null, 15000);
  const bgNote = await bg.evaluate(() => envssPodio.state().note || "");
  check(`[${vp}] background read (no tap) auto-creates a new Podio event; top-bar note unchanged`, bgOk && !/Refreshed from Podio/.test(bgNote), JSON.stringify({ bgOk, bgNote }));
  await bg.close();

  /* 11. safety */
  const methods = page.mlog.map(l => l.split(" ")[0]);
  check(`[${vp}] no DELETE requests to Supabase`, !methods.includes("DELETE"), JSON.stringify([...new Set(methods)]));
  const writes = page.mlog.filter(l => /^(POST|PATCH)/.test(l)).map(l => l.split(" ")[1].split("?")[0]);
  check(`[${vp}] writes only go to envss_events / envss_deletions / login log (never Podio, never views)`, writes.every(w => /\/rest\/v1\/(envss_events|envss_deletions|envss_trains|envss_app_opens|envss_login_log|envss_sign_ins|rpc\/envss_log_app_open)|\/functions\/v1\//.test(w)) && !writes.some(w => /v_field|podio/i.test(w)), JSON.stringify([...new Set(writes)]));
  check(`[${vp}] no page errors`, !page.errs.length, page.errs.join(" | "));
  await page.close();
}
/* v48.14: per-app config — new Podio event apps (ids given later by John) map to field event types */
async function runApps(vp) {
  const store = remoteFixture();
  store.envss_projects.set("podio-p0019530", proj("0019530", "New apps")); store.envss_projects.set("podio-p0019531", proj("0019531", "Hand-made fit"));
  const ni = (app, id, job, title, start, extraF) => Object.assign(item(id, job, title, start, "Site Works Start Date is now Confirmed", { fields: extraF || {} }), { app_id: app });
  store.v_field_podio_events = new Map([
    ni(7001, 9601, "0019530", "Occ noise", D(3)), ni(7002, 9602, "0019530", "Vent", D(3)), ni(7003, 9603, "0019530", "Onsite fit", D(3)), ni(7004, 9604, "0019530", "Switched off", D(3)),
    ni(7003, 9605, "0019531", "Fit beside hand-made fit", D(5)),
    /* labels of the new apps give other external ids: aliases map them */
    Object.assign({ item_id: 9606, app_id: 7001, title: "aliases", last_edit_on: NOW, synced_at: NOW, fields: { project: { title: "0019530 x", item_id: 1 }, "event-reference": "0019530-Test Client-HYG-NSEOC-Aliases",
      "site-works-start-date": { start: D(9) + " 00:00:00" }, "site-works-start-date-status": "Site Works Start Date is now Confirmed", "report-status": "Pending", "poc-first-name": "Alia" } }),
    Object.assign({ item_id: 9607, app_id: 7002, title: "done", last_edit_on: NOW, synced_at: NOW, fields: { project: { title: "0019530 x", item_id: 1 }, "event-reference": "0019530-Test Client-HYG-VENT-Done",
      "site-works-start-date": { start: D(2) + " 00:00:00" }, "report-status": "Invoiced" } })
  ].map(r => [String(r.item_id), r]));
  store.envss_events.set("eFitHand", ev("eFitHand", "0019531", "0019531-FIT-001", D(5), { type: "fit", podioUnplanned: true, podioLinked: false }));
  const pre = () => { window.ENVSS_PODIO_EVENT_APPS = [
    { appId: "24280319", name: "HYG Assessment Event", fieldType: "hygiene", kind: "", enabled: true },
    { appId: "7001", name: "Occ Noise Event", fieldType: "hygiene", kind: "noise", enabled: true },
    { appId: "7002", name: "Ventilation Survey Event", fieldType: "hygiene", kind: "vent", enabled: true },
    { appId: "7003", name: "Onsite Respirator Fit Test Event", fieldType: "fit", kind: "fit", enabled: true },
    { appId: "7004", name: "Later app", fieldType: "hygiene", kind: "", enabled: false }]; };
  const page = await boot(vp, store, false, pre);
  await waitFor(page, () => activityLoaded && projectsLoaded);
  await refresh(page); await waitFor(page, () => db.events.some(e => e.id === "e-podio-9603"), null, 10000);
  const list = await evs(page);
  const g = id => list.find(e => e.id === "e-podio-" + id);
  check(`[${vp}] apps: HYG rows still auto-create alongside new apps`, !!g(9001));
  check(`[${vp}] apps: Occ Noise Event -> hygiene event, kind noise, app id kept`, g(9601) && g(9601).type === "hygiene" && g(9601).podioEventKind === "noise" && g(9601).podioAppId === "7001" && /^0019530-00\d$/.test(g(9601).code), JSON.stringify(g(9601) && { t: g(9601).type, k: g(9601).podioEventKind, c: g(9601).code }));
  check(`[${vp}] apps: Ventilation Survey Event -> hygiene event, kind vent`, g(9602) && g(9602).type === "hygiene" && g(9602).podioEventKind === "vent");
  check(`[${vp}] apps: Onsite Fit Test Event -> fit event {job}-FIT-001`, g(9603) && g(9603).type === "fit" && g(9603).code === "0019530-FIT-001", JSON.stringify(g(9603) && { t: g(9603).type, c: g(9603).code }));
  check(`[${vp}] apps: switched-off app creates nothing`, !g(9604));
  check(`[${vp}] apps: new-app field labels (event-reference, report-status, poc-first-name) are mapped`, g(9606) && g(9606).date === D(9) && g(9606).poc.first === "Alia" && /Aliases/.test(g(9606).podioReference), JSON.stringify(g(9606) && { d: g(9606).date, p: g(9606).poc }));
  check(`[${vp}] apps: finished new-app item (Report Status Invoiced) not created`, !g(9607));
  const off = await page.evaluate(() => envssAuto.offers());
  check(`[${vp}] v48.15 apps: Podio fit event beside a hand-made fit event on the same date -> created as its own fit event (0019531-FIT-002), no offer`, g(9605) && g(9605).type === "fit" && g(9605).code === "0019531-FIT-002" && JSON.stringify(off) === "{}", JSON.stringify([g(9605) && g(9605).code, off]));
  check(`[${vp}] apps: HYG records unchanged (no podioAppId on HYG events)`, g(9001) && !("podioAppId" in g(9001)));
  await page.evaluate(() => openEvent("e-podio-9601")); await sleep(500);
  const lbl = await page.evaluate(() => (document.getElementById("v4814App") || {}).textContent || "");
  check(`[${vp}] apps: event says which Podio app it came from`, /From Podio app: Occ Noise Event \(noise\)/.test(lbl), lbl);
  const evHead = await page.evaluate(() => [...document.querySelectorAll("#app .muted")].map(x => x.textContent.trim()).find(x => /^(Hygiene event|Noise event|Vent survey|Airborne fibre monitoring|Respirator fit testing)$/.test(x)) || "");
  check(`[${vp}] v48.15: Occ Noise event screen says 'Noise event'`, evHead === "Noise event", evHead);
  await page.evaluate(() => openProject("podio-p0019530")); await sleep(700);
  const rowLabels = await page.evaluate(() => Object.fromEntries(db.events.filter(e => e.projectId === "podio-p0019530").map(e => { const leaf = [...document.querySelectorAll("#app .brand-type")].find(el => el.textContent.trim().split(" · ")[0] === e.code); const row = leaf && leaf.parentElement; const m = row && row.querySelector(".muted"); return [e.podioItemId || e.id, m ? m.textContent.split("·")[0].trim() : ""]; })));
  check(`[${vp}] v48.15 events list labels: Occ Noise 'Noise event', Vent Survey 'Vent survey', fit 'Respirator fit testing', HYG still 'Hygiene event'`, rowLabels["9601"] === "Noise event" && rowLabels["9602"] === "Vent survey" && rowLabels["9603"] === "Respirator fit testing" && rowLabels["9606"] === "Noise event" && Object.entries(rowLabels).filter(([k]) => !["9601","9602","9603","9605","9606","eFitHand"].includes(k)).every(([, v]) => v === "Hygiene event"), JSON.stringify(rowLabels));
  check(`[${vp}] v48.15: hire / label helper uses the same type label`, await page.evaluate(() => eventTypeLabel({ type: "hygiene", podioEventKind: "noise" }) === "Noise event" && eventTypeLabel({ type: "hygiene", podioEventKind: "vent" }) === "Vent survey" && eventTypeLabel({ type: "hygiene" }) === "Hygiene event" && eventTypeLabel({ type: "fibre" }) === "Airborne fibre monitoring"));
  const svc = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#app .brand-type")].map(x => [x.textContent.split(" · ")[0].trim(), ((x.querySelector(".ev-svc") || {}).textContent || "").replace(/^\s*·\s*/, "")])));
  const codeOfItem = i => (g(i) || {}).code;
  check(`[${vp}] v48.15 service codes on rows: Occ Noise -> NSEOC, Vent -> VENT, Onsite RFT -> RFT (app defaults)`, svc[codeOfItem(9601)] === "NSEOC" && svc[codeOfItem(9602)] === "VENT" && svc[codeOfItem(9603)] === "RFT", JSON.stringify(svc));
  const unitSvc = await page.evaluate(() => {
    const jt = t => ({ title: t, app_id: 18249487, item_id: 1 });
    const pl = envssPodio.map.mapItem({ item_id: 1, fields: [{ external_id: "job-type-of-hyg-event", values: [{ value: jt("DMIRS-SRS, DMIRS - Safety Regulation System Monitoring") }, { value: jt("NSEOC, Detailed Occupational Noise Assessment (HYG)") }, { value: jt("RFT, Respirator Fit Testing") }] }] });
    const pl2 = envssPodio.map.mapItem({ item_id: 2, fields: { "job-type-of-hyg-event": [jt("ACA NSED, Airborne contaminants and noise dose")] } });
    return { jt: pl.jobTypes, jt2: pl2.jobTypes,
      hyg: eventServiceCodes({ type: "hygiene", podioItemId: "x", podioJobTypes: ["DMIRS-SRS", "NSEOC", "RFT"] }),
      noise: eventServiceCodes({ type: "hygiene", podioEventKind: "noise", podioItemId: "x", podioJobTypes: ["DMIRS-SRS", "NSEOC", "RFT"] }),
      noiseAca: eventServiceCodes({ type: "hygiene", podioEventKind: "noise", podioItemId: "x", podioJobTypes: ["NSEOC-ACA", "VENT", "RFT"] }),
      vent: eventServiceCodes({ type: "hygiene", podioEventKind: "vent", podioItemId: "x", podioJobTypes: ["NSEOC-ACA", "VENT", "RFT"] }),
      fit: eventServiceCodes({ type: "fit", podioItemId: "x", podioJobTypes: ["NSEOC-ACA", "VENT", "RFT"] }),
      handMade: eventServiceCodes({ type: "hygiene" }), fibre: eventServiceCodes({ type: "fibre", podioItemId: "x" }),
      fromRef: eventServiceCodes({ type: "hygiene", podioItemId: "x", podioTypes: ["ACA", "NSED"] }) }; });
  check(`[${vp}] v48.15 Job Type codes read from Podio titles; HYG shows all, noise/vent/fit keep their own; hand-made + AFM show none`, JSON.stringify(unitSvc.jt) === '["DMIRS-SRS","NSEOC","RFT"]' && JSON.stringify(unitSvc.jt2) === '["ACA NSED"]' && unitSvc.hyg.join() === "DMIRS-SRS,NSEOC,RFT" && unitSvc.noise.join() === "NSEOC" && unitSvc.noiseAca.join() === "NSEOC-ACA" && unitSvc.vent.join() === "VENT" && unitSvc.fit.join() === "RFT" && !unitSvc.handMade.length && !unitSvc.fibre.length && unitSvc.fromRef.join() === "ACA,NSED", JSON.stringify(unitSvc));
  /* undated Podio event (as live 0019389-002): row says "No date in Podio", not a blank (test copy only) */
  const nod = await page.evaluate(() => { db.events.push({ id: "tNoDate", code: "0019530-099", projectId: "podio-p0019530", type: "hygiene", podioEventKind: "noise", podioItemId: "99", date: "", stage: "planned" }); render();
    const el = [...document.querySelectorAll("#app .brand-type")].find(x => /^0019530-099/.test(x.textContent.trim())); const m = el && el.parentElement.querySelector(".muted"); const out = m ? m.textContent : "";
    db.events = db.events.filter(e => e.id !== "tNoDate"); return out; });
  check(`[${vp}] v48.15 undated Podio event row: 'Noise event · No date in Podio · 0 samples'`, nod === "Noise event · No date in Podio · 0 samples", nod);
  if (vp === "chromebook") { await page.evaluate(() => { render(); }); await sleep(300); await page.screenshot({ path: path.join(OUT, vp + "-20-new-apps-events-list.png"), fullPage: true }); }
  /* view missing (404): HYG keeps working, nothing from new apps, nothing flagged gone */
  const store2 = remoteFixture(); const p2 = await boot(vp, store2, false, pre, { tableStatus: { v_field_podio_events: 404, v_field_podio_sync: 404 } });
  await waitFor(p2, () => activityLoaded && projectsLoaded);
  await refresh(p2); await waitFor(p2, () => db.events.some(e => e.id === "e-podio-9001"), null, 8000);
  const l2 = await evs(p2);
  check(`[${vp}] apps: extra view missing -> HYG still auto-creates, no new-app events, no errors`, l2.some(e => e.id === "e-podio-9001") && !l2.some(e => e.podioAppId) && !p2.errs.length, p2.errs.join(" | "));
  const n2 = await p2.evaluate(() => envssPodio.state().note || "");
  check(`[${vp}] v48.15: sync view missing (404) -> 'Last Podio change …', no 'Checked Podio', no error`, /^Last Podio change .+ planned Podio events?\.$/.test(n2) && !/Checked Podio/.test(n2) && !p2.errs.length, n2);
  await p2.close(); await page.close();
}
const which = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of which) { try { await run(vp); } catch (e) { check(`[${vp}] run completed`, false, e && e.stack || e); } }
for (const vp of which) { try { await runApps(vp); } catch (e) { check(`[${vp}] apps run completed`, false, e && e.stack || e); } }
check("no requests left the box except the local server (and fonts/CDN)", !ext.some(u => /podio\.com|supabase\.co/.test(u)), ext.join(" | "));
await browser.close(); server.close();
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "test-results.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
