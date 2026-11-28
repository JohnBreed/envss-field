/* v48.19: one field event per Podio job-type group (John t737u) + manual event creation switched off (t739u).
   Usage: ROOT=<worktree> OUT=/workspace/guard-shots/v4819 node work/v48-19/multi.test.mjs [pixel7|chromebook]  (default: both)
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

const hy = (id, job, title, start, types, extra) => hygItem(id, job, title, start, "Site Works Start Date is now Confirmed", Object.assign({ types, jtLabel: "label" }, extra || {}));
const tomb = (id, job, code, extra) => [id, { id, payload: Object.assign({ id, tombstone: "event", deletedEventId: id, eventId: id, projectId: "podio-p" + job, code, type: "hygiene", at: NOW, detail: "event deleted" }, extra || {}), updated_at: NOW }];
const run0 = (id, job, code, date, extra) => ev(id, job, code, date, Object.assign({ podioAuto: true, podioLinked: true, podioItemId: String(id).replace(/^e-podio-(\d+).*$/, "$1") }, extra || {}));
function remoteFixture() {
  const jobs = ["0019358", "0019359", "0019361", "0019362", "0019363", "0019364", "0019365", "0019366"];
  return {
    envss_projects: new Map(jobs.map(j => proj(j, "Multi " + j)).map(p => [p.id, p])),
    v_field_hyg_events: new Map([
      /* worked example 0019358: ACA + ACA-NSED (same type) + VENT + RFT */
      hy(5001, "0019358", "Worked example", D(2), "ACA,ACA-NSED,VENT,RFT"),
      /* 0019359: unknown codes need no app update; fit-only / AFM-only items make no hygiene event */
      hy(5002, "0019359", "Three types", D(3), "ACA,NSEOC,WBVIB"),
      hy(5003, "0019359", "One type", D(4), "ACA"),
      hy(5004, "0019359", "Fit only", D(4), "RFT,HPFT"),
      hy(5008, "0019359", "Fibre only", D(4), "AFM"),
      /* 0019361: existing single events get their extra type */
      hy(5005, "0019361", "Legacy unstarted", D(2), "ACA,VENT"),
      hy(5006, "0019361", "Legacy started", D(3), "ACA,VENT"),
      /* 0019362: types removed in Podio */
      hy(5007, "0019362", "Types removed", D(2), "ACA"),
      /* 0019363: tombstones */
      hy(5009, "0019363", "Vent deleted", D(2), "ACA,VENT"),
      hy(5010, "0019363", "Old tombstone", D(3), "ACA,VENT"),
      hy(5011, "0019363", "Primary deleted", D(4), "ACA,VENT"),
      /* 0019364: type changed on an unstarted single event */
      hy(5012, "0019364", "Type changed", D(2), "NSEOC")
    ].map(r => [String(r.item_id), r])),
    v_field_podio_events: new Map([
      /* a dedicated Occ Noise app item is never split */
      [String(6001), { item_id: 6001, app_id: 30888380, title: "Occ noise", last_edit_on: NOW, synced_at: NOW,
        fields: { project: { title: "0019365 Job", item_id: 2 }, "event-reference": "0019365-Test Client-HYG-NSEOC-VENT-Noise",
          "event-start-date": { start: D(2) + " 00:00:00" }, "event-start-date-status": "Site Works Start Date is now Confirmed",
          "report-status": "Pending", "job-type": [jt("NSEOC, Detailed Occupational Noise Assessment (HYG)"), jt("VENT, Ventilation Survey (HYG)")] } }]
    ]),
    v_field_podio_sync: new Map([["24280319", { app_id: 24280319, checked_at: new Date().toISOString() }]]),
    envss_events: new Map([
      run0("e-podio-5005", "0019361", "0019361-ACA-001", D(2), { podioTypes: ["ACA"], podioJobTypes: ["ACA"], podioSeen: { startDate: D(2), jobNumber: "0019361", reference: "x" } }),
      run0("e-podio-5006", "0019361", "0019361-007", D(3), { podioTypes: ["ACA"], podioJobTypes: ["ACA"], podioSeen: { startDate: D(3), jobNumber: "0019361", reference: "x" } }),
      run0("e-podio-5007", "0019362", "0019362-ACA-001", D(2), { podioGroup: "ACA", podioTypes: ["ACA", "VENT", "NSEOC"], podioJobTypes: ["ACA", "VENT", "NSEOC"], podioSeen: { startDate: D(2), jobNumber: "0019362", reference: "x" } }),
      run0("e-podio-5007-VENT", "0019362", "0019362-VENT-001", D(2), { podioGroup: "VENT", podioTypes: ["ACA", "VENT", "NSEOC"], podioJobTypes: ["ACA", "VENT", "NSEOC"], podioSeen: { startDate: D(2), jobNumber: "0019362", reference: "x" } }),
      run0("e-podio-5007-NSEOC", "0019362", "0019362-NSEOC-001", D(2), { podioGroup: "NSEOC", podioTypes: ["ACA", "VENT", "NSEOC"], podioJobTypes: ["ACA", "VENT", "NSEOC"], podioSeen: { startDate: D(2), jobNumber: "0019362", reference: "x" } }),
      run0("e-podio-5009", "0019363", "0019363-ACA-001", D(2), { podioGroup: "ACA", podioTypes: ["ACA", "VENT"], podioJobTypes: ["ACA", "VENT"], podioSeen: { startDate: D(2), jobNumber: "0019363", reference: "x" } }),
      run0("e-podio-5012", "0019364", "0019364-ACA-001", D(2), { podioGroup: "ACA", podioTypes: ["ACA"], podioJobTypes: ["ACA"], podioSeen: { startDate: D(2), jobNumber: "0019364", reference: "x" } }),
      /* hand-made events (0019xxx-00x): must still open, edit, sync, export */
      ev("eHandM", "0019366", "0019366-001", D(2), { podioUnplanned: true, podioLinked: false, notes: "hand made" }),
      ev("eFitM", "0019366", "0019366-RFT-001", D(2), { type: "fit", podioUnplanned: true, podioLinked: false })
    ].map(r => [r.id, r])),
    envss_trains: new Map([
      ["tStarted6", { id: "tStarted6", payload: { id: "tStarted6", eventId: "e-podio-5006", trainKind: "airborne_personal", sampleNo: 1, pouch: "1", status: "running", startAt: NOW, startFlow: "2.0", person: { first: "Sam", last: "Tester" }, audit: [] }, updated_at: NOW }],
      ["tStarted7", { id: "tStarted7", payload: { id: "tStarted7", eventId: "e-podio-5007-NSEOC", trainKind: "airborne_personal", sampleNo: 1, pouch: "1", status: "running", startAt: NOW, startFlow: "2.0", person: { first: "Sam", last: "Tester" }, audit: [] }, updated_at: NOW }],
      ["tHandM", { id: "tHandM", payload: { id: "tHandM", eventId: "eHandM", trainKind: "airborne_personal", sampleNo: 1, pouch: "1", status: "prepped", audit: [] }, updated_at: NOW }]
    ]),
    envss_deletions: new Map([
      tomb("e-podio-5009-VENT", "0019363", "0019363-VENT-001", { podioItemId: "5009", podioGroup: "VENT", podioAuto: true }),
      tomb("e-podio-5010", "0019363", "0019363-001", { podioItemId: "5010", podioAuto: true }),            /* old tombstone: no group, suppresses the whole item */
      tomb("e-podio-5011", "0019363", "0019363-ACA-001", { podioItemId: "5011", podioGroup: "ACA", podioAuto: true })
    ]),
    envss_hires: new Map()
  };
}
const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
async function boot(vp, store, pre) {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); page.mlog = mockSupabase(page, store, {});
  page.on("request", r => { const u = r.url(); if (!u.startsWith(url) && !u.startsWith("data:") && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|\.supabase\.co\//.test(u)) ext.push(vp + " " + r.method() + " " + u.split("?")[0]); });
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  if (pre) await page.evaluateOnNewDocument(pre);
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(SESSION);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(1200);
  return page;
}
const evs = page => page.evaluate(() => JSON.parse(JSON.stringify(db.events)));
const byItem = (list, item) => list.filter(e => String(e.podioItemId || "") === String(item));
const waitFor = async (page, fn, arg, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await sleep(150); } return false; };
const refresh = async page => { await page.evaluate(() => window.envssPodio.refresh()); await sleep(1000); };
const rowsOf = page => page.evaluate(() => [...document.querySelectorAll("#app .brand-type")].map(x => x.innerText.replace(/\s+/g, " ").trim()));

async function run(vp) {
  const L = s => `${vp}: ${s}`;
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, `multi-${n}-${vp}.png`), fullPage: true });
  const store = remoteFixture();
  const page = await boot(vp, store);
  await waitFor(page, () => typeof activityLoaded !== "undefined" && activityLoaded && typeof projectsLoaded !== "undefined" && projectsLoaded);
  await refresh(page);
  await waitFor(page, () => db.events.some(e => e.id === "e-podio-5001-VENT"), null, 15000);
  await sleep(600);
  let list = await evs(page);

  /* ---- worked example: 0019358 ---- */
  const w = byItem(list, "5001");
  const wa = w.find(e => e.id === "e-podio-5001"), wv = w.find(e => e.id === "e-podio-5001-VENT");
  check(L("0019358 worked example: ACA + ACA-NSED + VENT + RFT on one Podio item -> exactly 2 field events"), w.length === 2, JSON.stringify(w.map(e => [e.id, e.code])));
  check(L("ACA and ACA-NSED are one type: one airborne event {job}-ACA-NSED-001 on the primary id e-podio-5001 (group ACA)"), wa && wa.code === "0019358-ACA-NSED-001" && wa.podioGroup === "ACA" && wa.type === "hygiene", JSON.stringify(wa && [wa.code, wa.podioGroup]));
  check(L("VENT gets its own event 0019358-VENT-001 with the deterministic id e-podio-5001-VENT"), wv && wv.code === "0019358-VENT-001" && wv.podioGroup === "VENT" && wv.podioItemId === "5001" && wv.type === "hygiene", JSON.stringify(wv && [wv.code, wv.podioGroup]));
  check(L("RFT (own app) makes no hygiene event from the HYG item"), !w.some(e => /RFT/.test(e.code)) && !list.some(e => e.projectId === "podio-p0019358" && e.type === "fit"), JSON.stringify(list.filter(e => e.projectId === "podio-p0019358").map(e => e.code)));
  check(L("both events carry the item's header (date, reference, Podio item) and all Job Types are stored for scope"), wa && wv && wa.date === D(2) && wv.date === D(2) && wa.podioReference === wv.podioReference && JSON.stringify(wv.podioJobTypes) === '["ACA","ACA-NSED","VENT","RFT"]', JSON.stringify(wv && wv.podioJobTypes));
  check(L("each event is audited as created from Podio"), w.every(e => (e.audit || []).some(a => a.action === "Created automatically from Podio")), "");

  /* ---- unknown codes, single type, own-family-only items ---- */
  const t3 = byItem(list, "5002").sort((a, b) => a.code.localeCompare(b.code));
  check(L("ACA, NSEOC, WBVIB -> three events with the codes exactly as Podio has them (WBVIB needs no app update)"), JSON.stringify(t3.map(e => e.code)) === '["0019359-ACA-001","0019359-NSEOC-001","0019359-WBVIB-001"]', JSON.stringify(t3.map(e => e.code)));
  check(L("ids: first group keeps e-podio-5002, the others add the group"), JSON.stringify(t3.map(e => e.id).sort()) === '["e-podio-5002","e-podio-5002-NSEOC","e-podio-5002-WBVIB"]', JSON.stringify(t3.map(e => e.id)));
  const one = byItem(list, "5003");
  check(L("a single-type item still makes ONE event on the plain id (numbered per code on the job: ACA-002)"), one.length === 1 && one[0].id === "e-podio-5003" && one[0].code === "0019359-ACA-002", JSON.stringify(one.map(e => [e.id, e.code])));
  check(L("RFT,HPFT-only and AFM-only HYG items (by Job Type) make no hygiene event"), !byItem(list, "5004").length && !byItem(list, "5008").length, "");

  /* ---- existing single events gain their extra type, never recoded when started ---- */
  const u5 = byItem(list, "5005").sort((a, b) => a.id.localeCompare(b.id)), u6 = byItem(list, "5006").sort((a, b) => a.id.localeCompare(b.id));
  check(L("existing unstarted e-podio-5005 (ACA) stays 0019361-ACA-001 and gets podioGroup ACA; VENT is added as e-podio-5005-VENT / VENT-001"), u5.length === 2 && u5[0].id === "e-podio-5005" && u5[0].code === "0019361-ACA-001" && u5[0].podioGroup === "ACA" && u5[1].id === "e-podio-5005-VENT" && u5[1].code === "0019361-VENT-001", JSON.stringify(u5.map(e => [e.id, e.code, e.podioGroup])));
  const s6 = u6.find(e => e.id === "e-podio-5006"), x6 = u6.find(e => e.id === "e-podio-5006-VENT");
  check(L("existing STARTED e-podio-5006 keeps its code 0019361-007 (never split or recoded); its sample is untouched"), s6 && s6.code === "0019361-007" && s6.podioGroup === "ACA" && (await page.evaluate(() => db.trains.filter(t => t.eventId === "e-podio-5006").map(t => t.status).join())) === "running", JSON.stringify(s6 && [s6.code, s6.podioGroup]));
  check(L("the extra VENT event for the started item is a new event 0019361-VENT-002 (numbered per code on the job)"), x6 && x6.code === "0019361-VENT-002" && x6.stage === "planned", JSON.stringify(x6 && x6.code));
  check(L("no sample, photo or audit of the started event was rewritten (only podioGroup added)"), s6 && !(s6.audit || []).some(a => /code/.test(a.field || "")), JSON.stringify(s6 && s6.audit));

  /* ---- types removed in Podio: flag, never delete ---- */
  const r7 = byItem(list, "5007");
  check(L("0019362: three events still exist after Podio dropped VENT and NSEOC (rows are never deleted)"), r7.length === 3, JSON.stringify(r7.map(e => e.id)));
  check(L("their codes are unchanged (VENT-001 unstarted, NSEOC-001 started)"), r7.find(e => e.id === "e-podio-5007-VENT").code === "0019362-VENT-001" && r7.find(e => e.id === "e-podio-5007-NSEOC").code === "0019362-NSEOC-001" && r7.find(e => e.id === "e-podio-5007").code === "0019362-ACA-001", JSON.stringify(r7.map(e => e.code)));
  const fl = await page.evaluate(() => Object.fromEntries(["e-podio-5007", "e-podio-5007-VENT", "e-podio-5007-NSEOC"].map(id => [id, (envssAuto.flagsFor(db.events.find(e => e.id === id)) || []).map(f => f.kind + ":" + f.text)])));
  check(L("unstarted VENT and started NSEOC are flagged 'job type no longer on the Podio item'; ACA (still there) is not"), fl["e-podio-5007"].length === 0 && fl["e-podio-5007-VENT"].some(x => /^type:.*VENT is no longer/.test(x) && /not started/.test(x)) && fl["e-podio-5007-NSEOC"].some(x => /^type:.*NSEOC is no longer/.test(x) && /started work, so it was not changed/.test(x)), JSON.stringify(fl));
  await page.evaluate(() => { view.page = "dash"; render(); }); await sleep(400);
  const dash = await page.evaluate(() => (document.getElementById("v487Dash") || {}).textContent || "");
  check(L("dashboard lists the flagged events for review"), /0019362-VENT-001/.test(dash) && /0019362-NSEOC-001/.test(dash), dash);
  await page.evaluate(() => openEvent("e-podio-5007-VENT")); await sleep(400);
  const flagTxt = await page.evaluate(() => (document.getElementById("v487Flags") || {}).textContent || "");
  check(L("the event screen says what changed and offers Keep as is (no date button for a type flag)"), /no longer on the Podio item/.test(flagTxt) && /Keep as is/.test(flagTxt) && !/Use Podio date/.test(flagTxt), flagTxt);
  await page.click('[data-v487-keep="e-podio-5007-VENT"]'); await sleep(400);
  const kept = await page.evaluate(() => ({ still: !!db.events.find(e => e.id === "e-podio-5007-VENT"), fl: envssAuto.flagsFor(db.events.find(e => e.id === "e-podio-5007-VENT")).length }));
  check(L("Keep as is clears the flag and the event stays"), kept.still && kept.fl === 0, JSON.stringify(kept));
  await shot(page, "0019362-flag");

  /* ---- type changed on an unstarted single event: retargeted, not duplicated ---- */
  const c12 = byItem(list, "5012");
  check(L("0019364: unstarted e-podio-5012 (was ACA) follows the Job Type NSEOC: one event, group NSEOC, 0019364-NSEOC-001"), c12.length === 1 && c12[0].podioGroup === "NSEOC" && c12[0].code === "0019364-NSEOC-001", JSON.stringify(c12.map(e => [e.id, e.code, e.podioGroup])));

  /* ---- tombstones are per group ---- */
  const t9 = byItem(list, "5009"), t10 = byItem(list, "5010"), t11 = byItem(list, "5011");
  check(L("a deleted VENT event (group tombstone) is not re-created; the ACA event stays"), t9.length === 1 && t9[0].podioGroup === "ACA", JSON.stringify(t9.map(e => e.id)));
  check(L("an old tombstone with no group still suppresses the whole item"), t10.length === 0, JSON.stringify(t10.map(e => e.id)));
  check(L("a deleted primary (group ACA) is not re-created, but the VENT event is made on e-podio-5011-VENT as VENT-002 (the deleted VENT-001 stays reserved)"), t11.length === 1 && t11[0].id === "e-podio-5011-VENT" && t11[0].code === "0019363-VENT-002", JSON.stringify(t11.map(e => [e.id, e.code])));

  /* ---- dedicated app: not split ---- */
  const n6 = byItem(list, "6001");
  check(L("an Occ Noise app item with two Job Types is NOT split: one event 0019365-NSEOC-001"), n6.length === 1 && n6[0].code === "0019365-NSEOC-001" && n6[0].id === "e-podio-6001", JSON.stringify(n6.map(e => [e.id, e.code])));

  /* ---- re-runs and Refresh from Podio never duplicate ---- */
  const before = list.length;
  await page.evaluate(() => envssAuto.run()); await refresh(page); await page.evaluate(() => envssAuto.run()); await refresh(page); await sleep(500);
  const after = await evs(page);
  check(L("re-running auto-create and Refresh from Podio twice creates no duplicates"), after.length === before && new Set(after.map(e => e.id)).size === after.length && new Set(after.map(e => e.code)).size === after.length, JSON.stringify([before, after.length]));
  /* Podio adds a new type later: only the new event appears */
  store.v_field_hyg_events.set("5003", hy(5003, "0019359", "One type", D(4), "ACA,DST"));
  await refresh(page); await page.evaluate(() => envssAuto.run()); await sleep(500);
  const grow = byItem(await evs(page), "5003");
  check(L("a type added in Podio later adds one event (e-podio-5003-DST / 0019359-DST-001); the existing one is untouched"), grow.length === 2 && grow.some(e => e.id === "e-podio-5003-DST" && e.code === "0019359-DST-001") && grow.some(e => e.id === "e-podio-5003" && e.code === "0019359-ACA-002"), JSON.stringify(grow.map(e => [e.id, e.code])));

  /* ---- events list + project card for 0019358 ---- */
  await page.evaluate(() => openProject("podio-p0019358")); await sleep(700);
  const rows = await rowsOf(page);
  check(L("events list shows 0019358-ACA-NSED-001 (ACA, ACA-NSED) and 0019358-VENT-001 (VENT), each with its own type"), rows.some(t => /0019358-ACA-NSED-001/.test(t) && /ACA, ACA-NSED/.test(t) && !/VENT/.test(t)) && rows.some(t => /0019358-VENT-001/.test(t) && /VENT/.test(t) && !/ACA/.test(t)), JSON.stringify(rows));
  const card = await page.evaluate(() => (document.querySelector("[data-podio-item='5001']") || {}).innerText || "");
  check(L("the Podio card for the item names both field events"), /0019358-ACA-NSED-001/.test(card) && /0019358-VENT-001/.test(card), card);
  await shot(page, "0019358-list");
  await page.evaluate(() => openEvent("e-podio-5001-VENT")); await sleep(400);
  const scope = await page.evaluate(() => (document.getElementById("v4814Scope") || {}).textContent || "");
  check(L("event screen says which type this event covers and still shows the Podio scope"), /This event covers VENT/.test(scope) && /Podio scope/.test(scope), scope);

  /* ---- sync: both events reach Supabase (mock) and a fresh device sees the same two ---- */
  await waitFor(page, () => !Object.keys(syncState.pending).length, null, 15000);
  check(L("both events of the item are upserted under their own ids"), store.envss_events.has("e-podio-5001") && store.envss_events.has("e-podio-5001-VENT") && store.envss_events.get("e-podio-5001-VENT").payload.podioGroup === "VENT", "");
  const fresh = await boot(vp, store);
  await waitFor(fresh, () => typeof activityLoaded !== "undefined" && activityLoaded && typeof projectsLoaded !== "undefined" && projectsLoaded);
  await refresh(fresh); await fresh.evaluate(() => envssAuto.run()); await sleep(600);
  const fl2 = await evs(fresh);
  check(L("fresh device: still exactly two events for 0019358's item, same ids, nothing duplicated"), byItem(fl2, "5001").length === 2 && new Set(fl2.map(e => e.id)).size === fl2.length, JSON.stringify(byItem(fl2, "5001").map(e => e.id)));
  await fresh.close();

  /* ---- admin delete of one group writes a group tombstone and it does not come back ---- */
  await page.evaluate(() => { isAdmin = () => true; window.isAdmin = isAdmin; deleteEvent("e-podio-5001-VENT"); }); await sleep(600);
  await waitFor(page, () => !Object.keys(syncState.pending).length, null, 15000);
  const tb = [...store.envss_deletions.values()].map(r => r.payload).find(p => p.deletedEventId === "e-podio-5001-VENT");
  check(L("deleting the VENT event writes a tombstone carrying the group (no row delete)"), tb && tb.podioGroup === "VENT" && tb.podioItemId === "5001" && store.envss_events.has("e-podio-5001-VENT"), JSON.stringify(tb));
  await refresh(page); await page.evaluate(() => envssAuto.run()); await sleep(500);
  const afterDel = byItem(await evs(page), "5001");
  check(L("after the delete the ACA-NSED event stays and VENT is not re-created"), afterDel.length === 1 && afterDel[0].id === "e-podio-5001", JSON.stringify(afterDel.map(e => e.id)));

  /* ---- safety ---- */
  const methods = page.mlog.map(l => l.split(" ")[0]);
  check(L("no DELETE requests to Supabase; writes only to event / deletion / sample tables"), !methods.includes("DELETE") && page.mlog.filter(l => /^(POST|PATCH)/.test(l)).map(l => l.split(" ")[1].split("?")[0]).every(w => /\/rest\/v1\/(envss_events|envss_deletions|envss_trains|envss_app_opens|envss_login_log|envss_sign_ins|rpc\/envss_log_app_open)|\/functions\/v1\//.test(w)), "");
  check(L("no page errors"), !page.errs.length, JSON.stringify(page.errs));
  await page.close();
}

async function runManual(vp) {
  const L = s => `${vp}: ${s}`;
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, `manual-${n}-${vp}.png`), fullPage: false });
  const store = remoteFixture();
  const page = await boot(vp, store);
  await waitFor(page, () => typeof activityLoaded !== "undefined" && activityLoaded && typeof projectsLoaded !== "undefined" && projectsLoaded);
  await page.evaluate(() => openProject("podio-p0019366")); await sleep(700);
  const menu = await page.evaluate(() => { const m = document.getElementById("projectMenu"); if (m) m.open = true; return { has: !!m, add: !!document.getElementById("menuAddEvent"), csv: !!document.getElementById("importCsv"), top: !!document.getElementById("btnNewEventTop"), hint: (document.getElementById("v4814Hint") || {}).textContent || "", flag: window.envssManualEventsAllowed && envssManualEventsAllowed() }; });
  check(L("manual events OFF: no 'Add event not in Podio' in the ☰ menu, no New project event button, hint no longer points to it"), menu.has && !menu.add && !menu.top && !/Add event not in Podio/.test(menu.hint) && menu.flag === false, JSON.stringify(menu));
  check(L("Import field CSV is still in the ☰ menu (not a new-event entry; see report)"), menu.csv, "");
  await shot(page, "menu");
  const nav = await page.evaluate(() => { const b = document.querySelector('[data-go="add"]'); return { vis: b ? getComputedStyle(b).visibility : "none", dis: b && b.disabled }; });
  check(L("bottom-bar Add is hidden on the project page"), nav.vis === "hidden" || nav.dis, JSON.stringify(nav));
  const n0 = await page.evaluate(() => db.events.length);
  await page.evaluate(() => { openNewEvent("podio-p0019366"); });
  const o = await page.evaluate(() => ({ page: view.page, ntype: !!document.getElementById("ntype"), create: !!document.getElementById("btnCreateEv") }));
  check(L("openNewEvent() goes nowhere: stays on the project page, no create form"), o.page === "project" && !o.ntype && !o.create, JSON.stringify(o));
  await page.evaluate(() => { view.page = "newEvent"; view.projectId = "podio-p0019366"; render(); });
  const o2 = await page.evaluate(() => ({ page: view.page, ntype: !!document.getElementById("ntype") }));
  check(L("a saved 'newEvent' view (reload) falls back to the project page"), o2.page === "project" && !o2.ntype, JSON.stringify(o2));
  await page.evaluate(() => { view.projectId = "podio-p0019366"; const s = document.createElement("select"); s.id = "ntype"; s.innerHTML = '<option value="hygiene">h</option><option value="fit">f</option><option value="fibre">a</option>'; document.body.appendChild(s); const d = document.createElement("input"); d.id = "ndate"; d.value = "2026-12-01"; document.body.appendChild(d); });
  for (const ty of ["hygiene", "fit", "fibre"]) { await page.evaluate(t => { document.getElementById("ntype").value = t; createEvent(); }, ty); }
  check(L("createEvent() makes nothing for hygiene, fit or AFM while the flag is off"), (await page.evaluate(() => db.events.length)) === n0, "");

  /* existing hand-made events: open, edit, sync, export */
  await page.evaluate(() => { document.getElementById("ntype").remove(); document.getElementById("ndate").remove(); openEvent("eHandM"); }); await sleep(500);
  const ho = await page.evaluate(() => ({ page: view.page, h: (document.querySelector("#app h2") || {}).textContent || "" }));
  check(L("existing hand-made event 0019366-001 opens"), ho.page === "event", JSON.stringify(ho));
  await page.evaluate(() => { const e = eventById("eHandM"); e.notes = "edited after flag off"; saveQuiet(); });
  await waitFor(page, () => !Object.keys(syncState.pending).length, null, 15000);
  check(L("editing it syncs (Supabase mock has the new note)"), store.envss_events.get("eHandM").payload.notes === "edited after flag off", JSON.stringify(store.envss_events.get("eHandM").payload.notes));
  const ex = await page.evaluate(() => { try { exportCsv("eHandM"); exportWorkbookCsvs("eHandM"); exportEvent("eHandM"); return "ok"; } catch (e) { return String(e); } });
  check(L("existing hand-made event exports (CSV, workbook CSVs, JSON)"), ex === "ok", ex);
  await page.evaluate(() => openEvent("eFitM")); await sleep(500);
  check(L("existing hand-made fit event still opens"), (await page.evaluate(() => view.page === "event" && view.eventId === "eFitM")), "");
  await page.evaluate(() => { openProject("podio-p0019366"); }); await sleep(500);
  const rows = await rowsOf(page);
  check(L("hand-made codes stay 0019xxx-00x and RFT-001 in the events list"), rows.some(t => /^0019366-001/.test(t)) && rows.some(t => /^0019366-RFT-001/.test(t)), JSON.stringify(rows));
  await shot(page, "list");
  check(L("no page errors with the flag off"), !page.errs.length, JSON.stringify(page.errs));
  await page.close();

  /* flag ON (test hook) brings everything back */
  const on = await boot(vp, remoteFixture(), () => { window.ENVSS_ALLOW_MANUAL_EVENTS = true; });
  await waitFor(on, () => typeof activityLoaded !== "undefined" && activityLoaded && typeof projectsLoaded !== "undefined" && projectsLoaded);
  await on.evaluate(() => openProject("podio-p0019366")); await sleep(700);
  const m2 = await on.evaluate(() => { const m = document.getElementById("projectMenu"); if (m) m.open = true; return { add: !!document.getElementById("menuAddEvent"), hint: (document.getElementById("v4814Hint") || {}).textContent || "" }; });
  check(L("flag ON: ☰ shows Add event not in Podio and the hint mentions it"), m2.add && /Add event not in Podio/.test(m2.hint), JSON.stringify(m2));
  await on.evaluate(() => openNewEvent("podio-p0019366")); await sleep(400);
  const f2 = await on.evaluate(() => ({ page: view.page, ntype: !!document.getElementById("ntype") }));
  check(L("flag ON: the create form opens"), f2.page === "newEvent" && f2.ntype, JSON.stringify(f2));
  const nb = await on.evaluate(() => db.events.length);
  await on.evaluate(() => { document.getElementById("ndate").value = "2026-12-02"; createEvent(); }); await sleep(500);
  const made = await on.evaluate(() => db.events.filter(e => e.projectId === "podio-p0019366" && e.id !== "eHandM" && e.id !== "eFitM").map(e => [e.code, e.podioUnplanned]));
  check(L("flag ON: a hand-made event is created with the old 0019xxx-00x code and marked not linked to Podio"), (await on.evaluate(() => db.events.length)) === nb + 1 && made.some(m => /^0019366-\d{3}$/.test(m[0]) && m[1] === true), JSON.stringify(made));
  check(L("flag ON: no page errors"), !on.errs.length, JSON.stringify(on.errs));
  await on.close();
}

const vps = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of vps) { console.log("=== " + vp); await run(vp); await runManual(vp); }
check("no requests to podio.com or other external hosts", !ext.some(u => /podio\.com/.test(u)), ext.filter(u => /podio/.test(u)).join(" | "));
const fails = results.filter(r => !r.ok);
fs.writeFileSync(path.join(OUT, "multi-test-results.json"), JSON.stringify({ at: new Date().toISOString(), total: results.length, failed: fails.length, results }, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
await browser.close(); server.close(); process.exit(fails.length ? 1 : 0);
