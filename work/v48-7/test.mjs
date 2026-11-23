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
      proj("0019504", "AFM only"), proj("0019401", "Leichhardt hand-made"), proj("0019508", "Moved"), proj("0019509", "Deleted in Podio"), proj("0019510", "Race")].map(p => [p.id, p])),
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
      item(9031, "0019508", "Cancelled later", D(9), "Site Works Start Date is now Confirmed", { fields: { "generate-final-report": "Canceled" } })
    ].map(r => [String(r.item_id), r])),
    envss_events: new Map([
      ev("e-podio-9004", "0019503", "0019503-001", D(1), { podioItemId: "9004", podioAuto: true }),
      ev("eHand", "0019401", "0019401-001", D(12), { podioUnplanned: true, podioLinked: false, minesAct: true }),
      ev("e-podio-9008", "0019508", "0019508-001", D(5), { podioItemId: "9008", podioAuto: true, podioLinked: true, podioSeen: { startDate: D(5), startStatus: "Confirmed", jobNumber: "0019508", reference: "x" } }),
      ev("eOld9009", "0019509", "0019509-001", D(2), { podioItemId: "9009", podioLinked: true }),
      ev("e-podio-9031", "0019508", "0019508-002", D(9), { podioItemId: "9031", podioAuto: true, podioLinked: true, podioSeen: { startDate: D(9), startStatus: "Site Works Start Date is now Confirmed", reportStatus: "Pending", jobNumber: "0019508", reference: "x" } })
    ].map(r => [r.id, r])),
    envss_deletions: new Map([["e-podio-9004", { id: "e-podio-9004", payload: { id: "e-podio-9004", tombstone: "event", deletedEventId: "e-podio-9004", eventId: "e-podio-9004", projectId: "podio-p0019503", code: "0019503-001", type: "hygiene", at: NOW, detail: "event deleted" }, updated_at: NOW }]]),
    envss_trains: new Map(), envss_hires: new Map()
  };
}

const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
async function boot(vp, store, keepStorage) {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());   /* own storage + IndexedDB = a separate device */
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "warning" && /v48\.7/.test(m.text())) page.errs.push(m.text()); });
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
const byItem = (list, item) => list.filter(e => String(e.podioItemId || "") === String(item));
const waitFor = async (page, fn, arg, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await sleep(150); } return false; };
const refresh = async page => { await page.evaluate(() => window.envssPodio.refresh()); await sleep(900); };

async function run(vp) {
  const shot = (page, n, full = true) => page.screenshot({ path: path.join(OUT, `${vp}-${n}.png`), fullPage: full });
  const store = remoteFixture();
  const page = await boot(vp, store);
  check(`[${vp}] app is v48.7`, await page.evaluate(() => APP_VERSION === "48.7" && document.getElementById("appVersion").textContent === "v48.7" && document.title === "ENVSS Field v48.7"));
  await waitFor(page, () => activityLoaded && projectsLoaded);

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
  check(`[${vp}] backlog event (start 30 days ago) is NOT auto-created (Start fieldwork fallback)`, byItem(list, "9003").length === 0);
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
  check(`[${vp}] hand-made 0019401-001 on the same job + date blocks a duplicate: link offered instead`, byItem(list, "9006").length === 0 && JSON.stringify((await page.evaluate(() => envssAuto.offers()))["9006"]) === '["eHand"]', JSON.stringify(await page.evaluate(() => envssAuto.offers())));
  check(`[${vp}] already-linked events are not duplicated (9008 stays one event)`, byItem(list, "9008").length === 1);
  const last = await page.evaluate(() => envssAuto.last());
  check(`[${vp}] run summary created 5 (9001, 9002, 9010, 9029, 9030)`, last.created.length === 5, JSON.stringify(last));
  await waitFor(page, () => !syncState.pending["events:e-podio-9001"] && !syncState.pending["events:e-podio-9010"]);
  check(`[${vp}] auto-created events reach Supabase (mock) as upserts`, store.envss_events.has("e-podio-9001") && store.envss_events.get("e-podio-9001").payload.podioItemId === "9001" && store.envss_events.get("e-podio-9001").project_id === "podio-p0019500");

  /* 2. idempotent: refresh again + reload -> no duplicates */
  await page.evaluate(() => { envssPodio.state(); }); await refresh(page); await page.evaluate(() => envssAuto.run());
  await page.reload({ waitUntil: "networkidle0" }); await sleep(1200); await waitFor(page, () => activityLoaded && projectsLoaded); await refresh(page); await page.evaluate(() => envssAuto.run()); await sleep(600);
  list = await evs(page);
  const dupes = ["9001", "9002", "9008", "9009", "9010"].map(i => byItem(list, i).length);
  check(`[${vp}] idempotent: after 3 more runs and a reload, exactly one field event per Podio event`, dupes.every(n => n === 1), JSON.stringify(dupes));
  const evRows = [...store.envss_events.values()].filter(r => r.payload && r.payload.podioItemId === "9001");
  check(`[${vp}] idempotent in Supabase: one envss_events row for Podio 9001`, evRows.length === 1, evRows.length);

  /* 3. project page: auto-created card + screenshots */
  await page.evaluate(() => openProject("podio-p0019500")); await sleep(700);
  const card1 = await page.evaluate(() => (document.querySelector('[data-podio-item="9001"]') || {}).textContent || "");
  check(`[${vp}] project's Podio list says created automatically, with Open (no Start fieldwork)`, /created automatically/.test(card1) && /Open 0019500-/.test(card1) && !/Start fieldwork/.test(card1), card1);
  await shot(page, "01-project-auto-created");
  await page.evaluate(() => openEvent("e-podio-9001")); await sleep(400);
  const autoNote = await page.evaluate(() => (document.getElementById("v487Auto") || {}).textContent || "");
  check(`[${vp}] event screen shows 'Created automatically from Podio' note`, /Created automatically from Podio/.test(autoNote), autoNote);
  await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "02-event-auto-note", false);

  /* 4. backlog event keeps Start fieldwork (fallback) and it still works */
  await page.evaluate(() => openProject("podio-p0019502")); await sleep(700);
  const card3 = await page.evaluate(() => (document.querySelector('[data-podio-item="9003"]') || {}).textContent || "");
  check(`[${vp}] older event still shows Start fieldwork (fallback)`, /Start fieldwork/.test(card3), card3);
  await shot(page, "03-project-backlog-start-fieldwork");
  await page.click('[data-podio-start="9003"]'); await sleep(500);
  list = await evs(page);
  const e3 = byItem(list, "9003");
  check(`[${vp}] Start fieldwork creates one event, deterministic id, not marked auto`, e3.length === 1 && e3[0].id === "e-podio-9003" && e3[0].podioAuto === false && e3[0].audit[0].action === "Started from Podio (Start fieldwork)", JSON.stringify(e3));

  /* 5. tombstoned Podio event: card wording + deliberate re-create gets a fresh id */
  await page.evaluate(() => openProject("podio-p0019503")); await sleep(700);
  const card4 = await page.evaluate(() => (document.querySelector('[data-podio-item="9004"]') || {}).textContent || "");
  check(`[${vp}] deleted event's card says it will not be created again, offers Start fieldwork again`, /will not be created again/.test(card4) && /Start fieldwork again/.test(card4), card4);
  await shot(page, "04-project-deleted-not-recreated");

  /* 6. hand-made duplicate -> link offer */
  await page.evaluate(() => openProject("podio-p0019401")); await sleep(700);
  const card6 = await page.evaluate(() => (document.querySelector('[data-podio-item="9006"]') || {}).textContent || "");
  check(`[${vp}] project shows 'Link 0019401-001' and 'Create a separate event'`, /Link 0019401-001/.test(card6) && /Create a separate event/.test(card6), card6);
  await shot(page, "05-project-link-offer");
  await page.evaluate(() => openEvent("eHand")); await sleep(400);
  const offerEv = await page.evaluate(() => (document.querySelector('[data-v487-offer="9006"]') || {}).textContent || "");
  check(`[${vp}] hand-made event screen offers 'Link to this Podio event'`, /Link to this Podio event/.test(offerEv), offerEv);
  await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "06-event-link-offer", false);
  await page.click('[data-v487-link="eHand"]'); await sleep(500);
  list = await evs(page);
  const hand = list.find(e => e.id === "eHand");
  check(`[${vp}] Link: hand-made event becomes linked (no new event), blanks filled, date and Mines Act kept`, hand.podioItemId === "9006" && hand.podioUnplanned === false && hand.podioLinked === true && hand.lab === "Test Lab" && hand.date === D(12) && hand.minesAct === true && byItem(list, "9006").length === 1 && hand.audit.some(a => a.action === "Linked to Podio event"), JSON.stringify(hand));

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
  check(`[${vp}] fresh device: deleted event not re-created; others not duplicated`, byItem(fl, "9002").length === 0 && byItem(fl, "9004").length === 0 && byItem(fl, "9001").length === 1 && byItem(fl, "9006").length === 1, JSON.stringify(["9001", "9002", "9004", "9006"].map(i => byItem(fl, i).length)));
  await fresh.close();

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
const which = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of which) { try { await run(vp); } catch (e) { check(`[${vp}] run completed`, false, e && e.stack || e); } }
check("no requests left the box except the local server (and fonts/CDN)", !ext.some(u => /podio\.com|supabase\.co/.test(u)), ext.join(" | "));
await browser.close(); server.close();
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "test-results.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
