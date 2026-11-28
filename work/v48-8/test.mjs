/* v48.8 tests: start flow pre-fills end flow; STOP asks about a deviation from the initial flow rate.
   Usage: ROOT=/workspace/envss-flow node work/v48-8/test.mjs [pixel7|chromebook]   (default: both)
   Supabase is mocked in memory and *.supabase.co is mapped to a dead local port, so nothing reaches production.
   Fixture names are made up. */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";

/* v48.19: START / STOP on a Chromebook first shows the "Not at the pump?" warning; confirm it so the older flow under test runs. */
async function g19ok(page) { await new Promise(r => setTimeout(r, 250)); for (let i = 0; i < 3; i++) { const has = await page.evaluate(() => { const m = document.querySelector('.g19-modal[data-g19="laptop"]'); if (!m) return false; document.getElementById("g19Yes").click(); return true; }); if (!has) break; await new Promise(r => setTimeout(r, 300)); } }
const OUT = process.env.OUT || "/workspace/flow-shots"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 600) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date());
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const person = (first, last) => ({ first, last, sex: "male", sexSet: true, dob: "1985-03-04", dobD: "04", dobM: "03", dobY: "1985", occupation: "Fitter", company: "Acme", hours: "12", daysOn: "8", daysOff: "6" });
const H = (id, ev, n, extra) => Object.assign({ id, eventId: ev, trainKind: "airborne_personal", mode: "personal", sampleNo: n, pouch: String(n), contaminantId: "INH", pumpSerial: "7700" + n, headId: "IESS1" + n, mediaId: "C-" + n,
  startFlow: "", endFlow: "", rotameter: "R1", shiftDate: TODAY, shiftKind: "day", status: "prepped", startAt: "", endAt: "", comments: "", location: "Bay " + n,
  person: person("Sam", "Test" + n), rpd: {}, hpd: {}, audit: [] }, extra || {});
function fixture() {
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }, { id: "NOISE", name: "Noise dose", code: "NOISE", kind: "noise" }],
      pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p488", number: "0019488", name: "v48.8 end-flow test", source: "field", site: "Test site" }],
    events: [
      { id: "eH", projectId: "p488", code: "0019488-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      { id: "eF", projectId: "p488", code: "0019488-AFM-002", type: "fibre", date: TODAY, stage: "planned", rotameter: "FR4", protocol: "background", audit: [] }
    ],
    trains: [
      H("h1", "eH", 1),
      H("h2", "eH", 2, { startFlow: "2.0", status: "running", startAt: ago(3) }),
      H("h3", "eH", 3, { startFlow: "2.0", status: "running", startAt: ago(2) }),
      { id: "b1", eventId: "eH", trainKind: "blank", sampleNo: 4, pouch: "4", contaminantId: "INH", mediaId: "C-4", status: "field_blank", shiftDate: TODAY, audit: [] },
      H("n1", "eH", 5, { trainKind: "noise_personal", contaminantId: "NOISE", dosimeterSerial: "D1", startFlow: "", endFlow: "", pumpSerial: "", headId: "", mediaId: "", noise: { method: "dose", values: {} } }),
      H("n2", "eH", 6, { trainKind: "noise_personal", contaminantId: "NOISE", dosimeterSerial: "D2", startFlow: "", endFlow: "", pumpSerial: "", headId: "", mediaId: "", status: "running", startAt: ago(1), noise: { method: "dose", values: {} } }),
      H("p1", "eH", 7, { trainKind: "airborne_passive", mode: "personal", startFlow: "", endFlow: "", pumpSerial: "", headId: "", badgeId: "PB1" }),
      { id: "f0", eventId: "eF", trainKind: "blank", sampleNo: 0, pouch: "0", cowlNo: "13170", mediaId: "13170", status: "field_blank", shiftDate: TODAY, audit: [] },
      { id: "f1", eventId: "eF", trainKind: "fibre_static", mode: "static", sampleNo: 1, pouch: "1", cowlNo: "13171", mediaId: "13171", pumpSerial: "94471", location: "North boundary", startFlow: "2.0", endFlow: "", shiftDate: TODAY, status: "prepped", startAt: "", endAt: "", audit: [] },
      { id: "f2", eventId: "eF", trainKind: "fibre_static", mode: "static", sampleNo: 2, pouch: "2", cowlNo: "13172", mediaId: "13172", pumpSerial: "94472", location: "East boundary", startFlow: "2.0", endFlow: "", shiftDate: TODAY, status: "running", startAt: ago(4), endAt: "", audit: [] }
    ],
    deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
  };
}
const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
async function boot(vp) {
  const page = await browser.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "warning" && /v48\.8/.test(m.text())) page.errs.push(m.text()); });
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); const store = {}; page.mlog = mockSupabase(page, store, {});
  page.on("request", r => { const u = r.url(); if (!u.startsWith(url) && !u.startsWith("data:") && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|\.supabase\.co\//.test(u)) ext.push(vp + " " + r.method() + " " + u.split("?")[0]); });
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  const fx = fixture(); await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); }, fx);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(d => { db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains)); db.catalogs = Object.assign(db.catalogs || {}, d.catalogs); persist();
    /* Keep the 8 s activity pull from replacing fixture trains mid-test (same stale-reread the save-clash draft addresses). */
    pullActivity = async function () {}; window.pullActivity = pullActivity;
  }, fx);
  await sleep(200); return page;
}
const T = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(db.trains.find(x => x.id === i))), id);
const open = async (page, id) => { await page.evaluate(i => openTrain(i), id); await sleep(300); };
async function setInput(page, id, value) {
  await page.evaluate((i, v) => {
    const el = document.getElementById(i);
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }, id, value);
  await sleep(200);
}
const modal = page => page.evaluate(() => {
  const m = document.getElementById("v488Modal");
  if (!m) return null;
  return {
    q: (m.querySelector("#v488Q") || {}).textContent || "",
    start: (m.querySelector("#v488Start") || {}).innerText || "",
    end: (m.querySelector("#v488End") || {}).value || "",
    no: !!m.querySelector("#v488No"),
    warn: (m.querySelector("#v488Tol") || {}).textContent || "",
    err: (m.querySelector("#v488Err") || {}).textContent || ""
  };
});
const flows = (page, id) => page.evaluate(i => {
  const t = db.trains.find(x => x.id === i);
  const s = document.getElementById("startFlow"), e = document.getElementById("endFlow");
  return { start: t.startFlow, end: t.endFlow, prefill: t.endFlowPrefill || null, startBox: s ? s.value : null, endBox: e ? e.value : null, hasStart: !!s, hasEnd: !!e };
}, id);

async function run(vp) {
  const shot = (page, n, full = false) => page.screenshot({ path: path.join(OUT, `${vp}-${n}.png`), fullPage: full });
  const page = await boot(vp);
  check(`[${vp}] app is v48.19 (suite still covers v48.8 end-flow behaviour)`, await page.evaluate(() => APP_VERSION === "48.19" && document.getElementById("appVersion").textContent === "v48.19" && document.title === "ENVSS Field v48.19" && !!window.v488));

  /* 1. typing start flow pre-fills empty end flow */
  await open(page, "h1");
  await setInput(page, "startFlow", "2.0");
  let f = await flows(page, "h1");
  check(`[${vp}] typing start flow 2.0 pre-fills end flow 2.0`, f.start === "2.0" && f.end === "2.0" && f.endBox === "2.0" && f.prefill === "2.0", JSON.stringify(f));
  await page.evaluate(() => document.getElementById("endFlow").scrollIntoView({ block: "center" }));
  await shot(page, "01-start-prefills-end");

  /* 2. changing start updates end while it still matches the auto-filled value (2 vs 2.0 counts as the same) */
  await setInput(page, "startFlow", "2.2");
  f = await flows(page, "h1");
  check(`[${vp}] changing start to 2.2 updates the auto-filled end flow`, f.start === "2.2" && f.end === "2.2" && f.endBox === "2.2", JSON.stringify(f));

  /* 3. a manually typed end flow is not overwritten */
  await setInput(page, "endFlow", "1.8");
  await setInput(page, "startFlow", "2.5");
  f = await flows(page, "h1");
  check(`[${vp}] a manually entered end flow is kept when start flow changes`, f.start === "2.5" && f.end === "1.8" && f.endBox === "1.8", JSON.stringify(f));

  /* 4. clearing end flow allows prefill again */
  await setInput(page, "endFlow", "");
  await setInput(page, "startFlow", "2.0");
  f = await flows(page, "h1");
  check(`[${vp}] after end flow is cleared, a new start flow pre-fills it again`, f.start === "2.0" && f.end === "2.0", JSON.stringify(f));

  /* 5. field blank, noise and passive have no flow fields */
  await open(page, "b1");
  let none = await page.evaluate(() => ({ start: !!document.getElementById("startFlow"), end: !!document.getElementById("endFlow"), stop: !!document.getElementById("btnStop") }));
  check(`[${vp}] hygiene field blank has no start/end flow and no STOP`, !none.start && !none.end && !none.stop, JSON.stringify(none));
  await open(page, "n1");
  none = await page.evaluate(() => ({ start: !!document.getElementById("startFlow"), end: !!document.getElementById("endFlow"), stop: !!document.getElementById("btnStop") }));
  check(`[${vp}] noise sample has no start/end flow (STOP is for time only)`, !none.start && !none.end, JSON.stringify(none));
  await open(page, "p1");
  none = await page.evaluate(() => ({ start: !!document.getElementById("startFlow"), end: !!document.getElementById("endFlow") }));
  check(`[${vp}] passive badge has no start/end flow`, !none.start && !none.end, JSON.stringify(none));

  /* 6. AFM: same prefill; AFM field blank stays N/A */
  await open(page, "f1");
  f = await flows(page, "f1");
  check(`[${vp}] AFM sample shows start flow (default 2.0) and an empty end flow until start is edited`, f.start === "2.0" && f.hasStart && f.hasEnd && f.end === "" && f.endBox === "", JSON.stringify(f));
  await setInput(page, "startFlow", "2.1");
  f = await flows(page, "f1");
  check(`[${vp}] AFM: changing start flow 2.0 → 2.1 pre-fills end flow 2.1`, f.start === "2.1" && f.end === "2.1" && f.endBox === "2.1", JSON.stringify(f));
  await setInput(page, "endFlow", "1.9");
  await setInput(page, "startFlow", "2.2");
  f = await flows(page, "f1");
  check(`[${vp}] AFM: a manually entered end flow is not overwritten`, f.start === "2.2" && f.end === "1.9", JSON.stringify(f));
  await open(page, "f0");
  none = await page.evaluate(() => ({ start: !!document.getElementById("startFlow"), end: !!document.getElementById("endFlow"), na: /N\/A/.test(document.body.innerText) && /field blank/i.test(document.body.innerText) }));
  check(`[${vp}] AFM field blank has no flow inputs (pump/flow are N/A)`, !none.start && !none.end && none.na, JSON.stringify(none));

  /* 7. STOP on a running hygiene sample (Ben's gap: start flow set, end empty) opens the prompt and does not stop yet */
  await open(page, "h2");
  check(`[${vp}] running sample 2 is still missing an end flow before STOP`, (await T(page, "h2")).endFlow === "" && (await T(page, "h2")).status === "running");
  await page.evaluate(() => document.getElementById("btnStop").scrollIntoView({ block: "center" }));
  await page.click("#btnStop"); await g19ok(page); await sleep(350);
  let m = await modal(page);
  let t = await T(page, "h2");
  check(`[${vp}] STOP opens the deviation prompt and does not stop the sample yet`, m && m.q === "Was there a deviation from the initial flow rate?" && /2\.0 L\/min/.test(m.start) && m.no && t.status === "running" && !t.endAt, JSON.stringify({ m, s: t.status, end: t.endFlow, endAt: t.endAt }));
  await shot(page, "02-stop-deviation-prompt");

  /* backdrop / Escape do not dismiss it */
  await page.evaluate(() => {
    const w = document.getElementById("v488Modal");
    w.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    w.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await sleep(150);
  check(`[${vp}] clicking the backdrop or pressing Escape does not close the prompt or stop the sample`, !!(await modal(page)) && (await T(page, "h2")).status === "running");

  /* Save with a blank end flow is refused */
  await page.evaluate(() => { const i = document.getElementById("v488End"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.click("#v488Save"); await sleep(200);
  m = await modal(page);
  check(`[${vp}] Save with an empty end flow shows an error and stays on the prompt`, m && /Enter the end flow, or choose No/.test(m.err) && (await T(page, "h2")).status === "running", JSON.stringify(m));

  /* 8. No = end flow equals start, confirmed, then STOP completes */
  await page.click("#v488No"); await sleep(800);
  await page.evaluate(() => { document.querySelectorAll(".v483-modal, #dlRemind").forEach(m => m.remove()); });
  t = await T(page, "h2");
  check(`[${vp}] No: sample stops, end flow = 2.0, audit records 'No'`, t.status === "ended" && t.endFlow === "2.0" && !!t.endAt && t.audit.some(a => a.action === "Flow deviation at STOP" && /No — end flow set to the initial flow rate, 2\.0 L\/min/.test(a.detail)) && t.audit.some(a => a.action === "STOP pressed"), JSON.stringify((t.audit || []).slice(-4)));
  check(`[${vp}] the deviation prompt is gone after No`, !(await modal(page)));

  /* 9. entering a different end flow, with the existing tolerance warning */
  await open(page, "h3");
  await page.click("#btnStop"); await g19ok(page); await sleep(350);
  m = await modal(page);
  check(`[${vp}] STOP on sample 3 shows the same prompt with start 2.0`, m && /2\.0 L\/min/.test(m.start) && (await T(page, "h3")).status === "running", JSON.stringify(m));
  await page.evaluate(() => { const i = document.getElementById("v488End"); i.value = "1.5"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  await sleep(150);
  m = await modal(page);
  check(`[${vp}] typing 1.5 (25% from 2.0) shows the existing tolerance warning in the prompt`, m && /25\.0%/.test(m.warn) && /tolerance ±10%/.test(m.warn), JSON.stringify(m));
  await shot(page, "03-stop-enter-end-flow-warning");
  await page.click("#v488Save"); await sleep(800);
  await page.evaluate(() => { document.querySelectorAll(".v483-modal, #dlRemind").forEach(m => m.remove()); });
  t = await T(page, "h3");
  const inline = await page.evaluate(() => (document.getElementById("flowWarn") || document.querySelector("[style*='danger']") || {}).textContent || document.body.innerText);
  check(`[${vp}] Save: sample stops, end flow = 1.5, audit records the entered value and 'Flow outside tolerance'`, t.status === "ended" && t.endFlow === "1.5" && t.audit.some(a => a.action === "Flow deviation at STOP" && /End flow entered as 1\.5 L\/min \(initial 2\.0 L\/min\)/.test(a.detail)) && t.audit.some(a => a.action === "Flow outside tolerance"), JSON.stringify((t.audit || []).slice(-5)));
  check(`[${vp}] after Save, the sample screen still shows the tolerance warning`, /25\.0%/.test(inline) && /tolerance/i.test(inline), inline.slice(0, 400));

  /* 10. AFM STOP */
  await open(page, "f2");
  await page.click("#btnStop"); await g19ok(page); await sleep(350);
  m = await modal(page);
  check(`[${vp}] AFM STOP shows the same deviation prompt`, m && m.q === "Was there a deviation from the initial flow rate?" && /2\.0 L\/min/.test(m.start) && (await T(page, "f2")).status === "running", JSON.stringify(m));
  await shot(page, "04-afm-stop-deviation-prompt");
  await page.click("#v488No"); await sleep(800);
  await page.evaluate(() => { document.querySelectorAll(".v483-modal, #dlRemind").forEach(m => m.remove()); });
  t = await T(page, "f2");
  check(`[${vp}] AFM No: stops with end flow 2.0 and the same audit wording`, t.status === "ended" && t.endFlow === "2.0" && t.audit.some(a => a.action === "Flow deviation at STOP" && /No — end flow set to the initial flow rate, 2\.0 L\/min/.test(a.detail)), JSON.stringify((t.audit || []).slice(-4)));

  /* 11. noise STOP is unchanged (no prompt) */
  await open(page, "n2");
  await page.click("#btnStop"); await g19ok(page); await sleep(600);
  t = await T(page, "n2");
  check(`[${vp}] noise STOP does not show the flow prompt and still stops`, !(await modal(page)) && t.status === "ended" && !!t.endAt, JSON.stringify({ s: t.status, endFlow: t.endFlow, acts: (t.audit || []).map(a => a.action) }));

  /* 12. reload keeps the confirmed end flows */
  await page.reload({ waitUntil: "networkidle0" }); await sleep(900);
  const fin = await page.evaluate(() => ["h2", "h3", "f2", "n2"].map(i => { const x = db.trains.find(y => y.id === i); const dev = (x.audit || []).filter(a => a.action === "Flow deviation at STOP").map(a => a.detail); return [i, x.status, x.endFlow || "", dev[0] || ""].join(":"); }).join(" | "));
  check(`[${vp}] reload keeps stopped samples and confirmed end flows`,
    /h2:ended:2.0:No — end flow set to the initial flow rate, 2\.0 L\/min/.test(fin)
    && /h3:ended:1.5:End flow entered as 1\.5 L\/min \(initial 2\.0 L\/min\)/.test(fin)
    && /f2:ended:2.0:No — end flow set to the initial flow rate, 2\.0 L\/min/.test(fin)
    && /n2:ended::/.test(fin), fin);

  check(`[${vp}] no page errors`, !page.errs.length, page.errs.join(" | "));
  const unexpected = page.dialogs.filter(d => !/Cannot start until/.test(d));
  check(`[${vp}] no unexpected native alerts`, !unexpected.length, unexpected.join(" | "));
  await page.close();
}
const vps = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of vps) { try { await run(vp); } catch (e) { check(`[${vp}] run completed`, false, e.stack); } }
check("no request left the box except the CDN libraries; every Supabase call was answered by the in-memory mock", !ext.length, ext.join("\n"));
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "test-results.json"), JSON.stringify(results, null, 1));
console.log(results.filter(r => r.ok).length + "/" + results.length + " passed");
await browser.close(); server.close();
process.exit(results.every(r => r.ok) ? 0 : 1);
