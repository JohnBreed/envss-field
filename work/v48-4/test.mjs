/* v48.4 tests: next / previous arrows (samples within an event, events within a project) and the
   Yesterday / Today / Tomorrow day filter. Chromebook 1366x768 only (John, 13 Nov 2026). Supabase mocked; no production writes. */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
const OUT = "/workspace/time-lock/work/v48-4/shots"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + String(detail).slice(0, 400) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const perth = ms => PF.format(new Date(ms));
const addD = (ymd, n) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = perth(Date.now()), YDAY = addD(TODAY, -1), TMRW = addD(TODAY, 1);
const perthIso = (ymd, hm) => new Date(ymd + "T" + hm + ":00+08:00").toISOString();
const H = 3600e3;
const who = "Field Tester <field.test@envss.com.au> · Android";
const hy = (id, extra) => Object.assign({ id, eventId: "eH", trainKind: "airborne_personal", contaminantId: "INH", pumpSerial: "9" + id.slice(1) + "01", headId: "IESS" + id.slice(1), mediaId: "C-" + id,
  startFlow: "2.0", endFlow: "", rotameter: "R1", shiftDate: TODAY, shiftKind: "day", status: "prepped", startAt: "", endAt: "", comments: "",
  person: { first: "Test", last: "Person " + id, occupation: "Operator", hours: "8", sex: "male" }, rpd: {}, hpd: {}, audit: [] }, extra || {});
const af = (id, n, extra) => Object.assign({ id, eventId: "eA", trainKind: n === 0 ? "blank" : "fibre_static", sampleNo: n, pouch: String(n), cowlNo: String(12340 + n), mediaId: String(12340 + n),
  pumpSerial: n ? String(77000 + n) : "", location: n ? "Test location " + n : "", startFlow: n ? "2.0" : "", status: n ? "prepped" : "field_blank", startAt: "", endAt: "", shiftDate: TODAY, audit: [] }, extra || {});
function fixture() {
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }, { id: "NOISE", name: "Noise dose", code: "NOISE", kind: "noise" }],
      pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p484", number: "0019484", name: "v48.4 test", source: "field", site: "Test pit" }],
    events: [
      { id: "eT", projectId: "p484", code: "0019484-003", type: "hygiene", date: TMRW, stage: "planned", audit: [] },
      { id: "eH", projectId: "p484", code: "0019484-002", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      { id: "eA", projectId: "p484", code: "0019484-AFM-010", type: "fibre", date: TODAY, protocol: "background", rotameter: "R9", stage: "planned", audit: [] },
      { id: "eY", projectId: "p484", code: "0019484-001", type: "hygiene", date: YDAY, stage: "planned", audit: [] },
      { id: "eN", projectId: "p484", code: "0019484-004", type: "hygiene", date: "", stage: "planned", audit: [] }
    ],
    trains: [
      hy("h1", { sampleNo: 1, pouch: "1", shiftDate: YDAY, status: "ended", startAt: perthIso(YDAY, "07:00"), endAt: perthIso(YDAY, "15:00"), endFlow: "2.0", audit: [{ at: perthIso(YDAY, "07:00"), who, action: "START pressed" }, { at: perthIso(YDAY, "15:00"), who, action: "STOP pressed" }] }),
      hy("h2", { sampleNo: 2, pouch: "2", commentAsked: "yes", status: "running", startAt: new Date(Date.now() - 2 * H).toISOString(), audit: [{ at: new Date(Date.now() - 2 * H).toISOString(), who, action: "START pressed" }] }),
      hy("h3", { sampleNo: 3, pouch: "3", shiftDate: TMRW }),
      hy("h4", { sampleNo: 4, pouch: "4", shiftDate: "", status: "ended", startAt: perthIso(TODAY, "00:30"), endAt: perthIso(TODAY, "00:31"), endFlow: "2.0", audit: [{ at: perthIso(TODAY, "00:30"), who, action: "START pressed" }, { at: perthIso(TODAY, "00:31"), who, action: "STOP pressed" }] }),   /* Perth just after midnight = today */
      hy("h5", { sampleNo: 5, pouch: "5", shiftDate: "", status: "ended", startAt: perthIso(YDAY, "23:59"), endAt: perthIso(TODAY, "00:20"), endFlow: "2.0", audit: [{ at: perthIso(YDAY, "23:59"), who, action: "START pressed" }, { at: perthIso(TODAY, "00:20"), who, action: "STOP pressed" }] }),   /* Perth one minute before midnight = yesterday */
      { id: "hB", eventId: "eH", trainKind: "blank", sampleNo: 6, pouch: "6", contaminantId: "INH", mediaId: "", status: "field_blank", shiftDate: TODAY, audit: [] },
      hy("hN", { sampleNo: 1, pouch: "1", trainKind: "noise_personal", contaminantId: "NOISE", dosimeterSerial: "D1", noise: { method: "dose", values: {} } }),
      af("a0", 0), af("a1", 1), af("a2", 2, { cowlNo: "12399", mediaId: "12399" }), af("a3", 3, { cowlNo: "12399", mediaId: "12399" }),
      hy("y1", { eventId: "eY", sampleNo: 1, pouch: "1", shiftDate: YDAY }),
      hy("n1", { eventId: "eN", sampleNo: 1, pouch: "1", shiftDate: "" })   /* no date anywhere */
    ], deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
  };
}
const { server, base: url } = await serve();
const browser = await launch();
const errs = [];
async function boot(vp, tz) {
  const page = await browser.newPage(); page.on("pageerror", e => errs.push(vp + ": " + String(e)));
  if (tz) await page.emulateTimezone(tz);
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); const store = {}; const log = mockSupabase(page, store, {});
  const dialogs = [];
  page.on("dialog", async d => { dialogs.push(d.message()); await d.accept(); });
  page.t = { dialogs, store, log };
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  const fx = fixture(); await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); }, fx);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(d => { db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains)); db.catalogs = Object.assign(db.catalogs || {}, d.catalogs); persist(); }, fx);
  await sleep(200); return page;
}
const shot = (page, name, full) => page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: !!full });
const st = page => page.evaluate(() => ({ page: view.page, train: view.trainId, ev: view.eventId, pos: (document.getElementById("v484Pos") || {}).textContent || "",
  prevDis: (document.getElementById("v484Prev") || {}).disabled, nextDis: (document.getElementById("v484Next") || {}).disabled,
  sidePrev: !!document.getElementById("v484SidePrev"), sideNext: !!document.getElementById("v484SideNext") }));
const times = page => page.evaluate(() => JSON.stringify(db.trains.map(t => [t.id, t.startAt || "", t.endAt || "", t.status])));

let page = await boot("chromebook");
check("[chromebook] version 48.4", await page.evaluate(() => APP_VERSION === "48.4" && document.title === "ENVSS Field v48.4" && document.getElementById("appVersion").textContent === "v48.4"));
const t0 = await times(page);

/* ---- hygiene sample arrows ---- */
const order = await page.evaluate(() => trainsOf("eH").map(t => t.id));
check("sample order = event list order (by sample number, noise last)", JSON.stringify(order) === JSON.stringify(["h1", "h2", "h3", "h4", "h5", "hB", "hN"]), JSON.stringify(order));
await page.evaluate(() => openTrain("h1")); await sleep(300);
let s = await st(page);
check("first sample: '1 of 7', Prev disabled, no left side arrow, Next shown", s.pos === "1 of 7" && s.prevDis === true && s.nextDis === false && !s.sidePrev && s.sideNext, JSON.stringify(s));
await page.click("#v484SideNext"); await sleep(300); s = await st(page);
check("right-hand side arrow opens the next sample (h2, '2 of 7')", s.page === "train" && s.train === "h2" && s.pos === "2 of 7" && s.sidePrev && s.sideNext, JSON.stringify(s));
await shot(page, "chromebook-1-hygiene-sample-arrows");
const geo = await page.evaluate(() => {
  const r = el => el && el.getBoundingClientRect(); const L = r(document.getElementById("v484SidePrev")), R = r(document.getElementById("v484SideNext"));
  const boxes = [...document.querySelectorAll("#app input, #app select, #app textarea, #app button")].filter(e => e.offsetParent).map(r);
  const hit = a => boxes.some(b => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom));
  const st = r(document.getElementById("btnStop") || document.getElementById("btnStart"));
  return { L: [L.left, L.right, L.width, L.height], R: [R.left, R.right, R.width, R.height], overlapL: hit(L), overlapR: hit(R), startStop: st ? [st.left, st.right] : null };
});
check("side arrows are big (>=64x120) and cover no input or button (incl. START / STOP)", geo.L[2] >= 64 && geo.L[3] >= 120 && geo.R[2] >= 64 && !geo.overlapL && !geo.overlapR, JSON.stringify(geo));
/* pending edit: type into comments without a change / blur, then go next */
await page.click("#comments"); await page.keyboard.type("note typed then arrow");
await page.click("#v484Next"); await sleep(300); s = await st(page);
const h2 = await page.evaluate(() => db.trains.find(x => x.id === "h2").comments);
const stored = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("envss-field-next-v32") || "{}"); return ((d.trains || []).find(x => x.id === "h2") || {}).comments; });
check("pending edit saved before moving (same as ← Event): in memory and in local storage", s.train === "h3" && h2 === "note typed then arrow" && stored === "note typed then arrow", JSON.stringify({ train: s.train, h2, stored }));
const queued = await page.evaluate(() => { try { return JSON.stringify(localStorage.getItem("envss-field-queue-v32") || "").includes("note typed then arrow"); } catch (e) { return null; } });
check("edit queued / synced like the back button (mock Supabase saw it or it is queued)", queued || page.t.log.some(l => /envss_trains/.test(l) && /^(POST|PATCH)/.test(l)) || (page.t.store.envss_trains && [...page.t.store.envss_trains.values()].some(r => JSON.stringify(r).includes("note typed then arrow"))), String(queued));
await page.evaluate(() => openTrain("hN")); await sleep(300); s = await st(page);
check("last sample: '7 of 7', Next disabled, no right side arrow", s.pos === "7 of 7" && s.nextDis === true && !s.sideNext && s.sidePrev, JSON.stringify(s));
await page.click("#v484Next").catch(() => {}); await sleep(200);
check("Next at the end does nothing", (await st(page)).train === "hN");
/* blocked while a dialog is open */
await page.evaluate(() => openTrain("h2")); await sleep(300);
await page.click('.v483-edit[data-k="start"]'); await sleep(200);
const modalOpen = await page.evaluate(() => !!document.querySelector(".v483-modal"));
await page.evaluate(() => v484.go(1)); await sleep(200);
check("arrows do nothing while the Edit time dialog is open", modalOpen && (await st(page)).train === "h2");
await page.evaluate(() => document.querySelectorAll(".v483-modal").forEach(m => m.remove()));
/* walk the whole event with the arrows: no stored time or status changes (v48.3 time lock) */
await page.evaluate(() => openTrain("h1")); await sleep(200);
for (let i = 0; i < 6; i++) { await page.click("#v484SideNext"); await sleep(150); }
const t1 = await times(page);
check("walking every sample with the arrows changes no START / STOP time or status", t0 === t1, t1.slice(0, 300));
const ro = await page.evaluate(() => { openTrain("h4"); const s = document.getElementById("startAt"); return s && s.readOnly; });
check("time boxes still read-only after arriving by arrow (v48.3 lock intact)", ro === true);

/* ---- AFM sample arrows ---- */
await page.evaluate(() => openTrain("a0")); await sleep(300); s = await st(page);
check("AFM blank '0': '1 of 4', next is Pump 1", s.pos === "1 of 4" && (await page.evaluate(() => document.getElementById("v484Next").textContent.trim())) === "Pump 1 ›", JSON.stringify(s));
await page.click("#v484SideNext"); await sleep(250); await page.click("#v484SideNext"); await sleep(250); await page.click("#v484SideNext"); await sleep(300);
s = await st(page);
const afm = await page.evaluate(() => ({ h2: document.querySelector("#app h2").textContent, dup: (document.getElementById("cowlDup") || {}).textContent || "", checks: !!document.getElementById("afmSampleChecks") }));
check("AFM: arrows reach Pump 3 ('4 of 4') and the duplicate-cowl check still shows", s.train === "a3" && s.pos === "4 of 4" && /Pump 3/.test(afm.h2) && /already on Pump 2/.test(afm.dup), JSON.stringify(afm));
await page.evaluate(() => openTrain("a2")); await sleep(300);
await shot(page, "chromebook-2-afm-sample-arrows");
/* COC / Mark complete gate still blocks after arrow navigation */
await page.evaluate(() => { openTrain("h1"); }); await sleep(200); await page.click("#v484SideNext"); await sleep(200);
await page.evaluate(() => { openEvent("eH"); createCoc(); }); await sleep(400);
check("COC gate still blocks the event with a running sample", await page.evaluate(() => !!document.querySelector('.v483-modal[data-v483="gate"]')));
await page.evaluate(() => document.querySelectorAll(".v483-modal").forEach(m => m.remove()));
const afmCoc = await page.evaluate(() => window.afmCocBlocked(eventById("eA")));
check("AFM COC block on hard duplicates unchanged", afmCoc === true, String(afmCoc));

/* ---- event arrows (events of the project, by date then code) ---- */
const evOrder = await page.evaluate(() => v484.eventList(eventById("eH")).map(e => e.id));
check("event order: date then event code (no-date last)", JSON.stringify(evOrder) === JSON.stringify(["eY", "eH", "eA", "eT", "eN"]), JSON.stringify(evOrder));
await page.evaluate(() => openEvent("eY")); await sleep(300); s = await st(page);
check("first event: '1 of 5 events in this project', Prev disabled", s.pos === "1 of 5 events in this project" && s.prevDis && !s.sidePrev && s.sideNext, JSON.stringify(s));
await page.click("#v484SideNext"); await sleep(300); s = await st(page);
check("right-hand arrow opens the next event (eH)", s.page === "event" && s.ev === "eH" && s.pos === "2 of 5 events in this project", JSON.stringify(s));
await page.evaluate(() => openEvent("eA")); await sleep(300);
await page.evaluate(() => { document.getElementById("eventRota").value = ""; }); await page.click("#eventRota"); await page.keyboard.type("R-NEW");
await page.click("#v484SideNext"); await sleep(300); s = await st(page);
check("event box edit (rotameter) saved before moving to the next event", s.ev === "eT" && (await page.evaluate(() => eventById("eA").rotameter)) === "R-NEW", JSON.stringify(s));
await page.evaluate(() => openEvent("eN")); await sleep(300); s = await st(page);
check("last event: Next disabled, no right arrow", s.nextDis && !s.sideNext, JSON.stringify(s));
await page.evaluate(() => openEvent("eH")); await sleep(300);
await shot(page, "chromebook-3-event-arrows");

/* ---- day filter ---- (reset samples: opening a sample fills an empty shift date from the event date, as before v48.4) */
await page.evaluate(d => { db.trains = JSON.parse(JSON.stringify(d.trains)); persist(); }, fixture()); await sleep(200);
const t0d = await times(page);
const b = await page.evaluate(() => [v484.perthYmd("2026-11-12T15:59:59Z"), v484.perthYmd("2026-11-12T16:00:00Z"),
  v484.dayYmd("today", Date.parse("2026-11-12T16:30:00Z")), v484.dayYmd("yesterday", Date.parse("2026-11-12T16:30:00Z")), v484.dayYmd("tomorrow", Date.parse("2026-11-12T16:30:00Z")), v484.dayYmd("today", Date.parse("2026-11-12T15:30:00Z"))]);
check("Perth midnight boundary: 23:59:59 AWST is the 12th, 00:00 AWST is the 13th; today/yesterday/tomorrow roll at Perth midnight", JSON.stringify(b) === JSON.stringify(["2026-11-12", "2026-11-13", "2026-11-13", "2026-11-12", "2026-11-14", "2026-11-12"]), JSON.stringify(b));
const days = await page.evaluate(() => Object.fromEntries(["h1", "h2", "h3", "h4", "h5", "hB", "hN", "n1"].map(id => [id, v484.sampleDay(db.trains.find(x => x.id === id))])));
check("sample day: shift date first, else Perth date of START (00:30 AWST = today, 23:59 AWST = yesterday), no date = none", days.h1 === YDAY && days.h2 === TODAY && days.h3 === TMRW && days.h4 === TODAY && days.h5 === YDAY && days.n1 === "", JSON.stringify(days));
const rowIds = () => page.evaluate(() => [...document.querySelectorAll('#app .train[onclick^="openTrain("]')].map(r => /openTrain\('([^']+)'/.exec(r.getAttribute("onclick"))[1]).sort());
const chip = (page, k) => page.evaluate(k => { const c = document.querySelector(`[data-v484day="${k}"]`); return c ? { on: c.classList.contains("on"), text: c.textContent.trim() } : null; }, k);
await page.evaluate(() => openEvent("eH")); await sleep(300);
check("event screen shows Yesterday / Today / Tomorrow chips beside the status filters, with counts", (await chip(page, "today")).text === "Today 4" && (await chip(page, "yesterday")).text === "Yesterday 2" && (await chip(page, "tomorrow")).text === "Tomorrow 1" && await page.evaluate(() => !!document.getElementById("sampleFilters")), JSON.stringify([await chip(page, "yesterday"), await chip(page, "today"), await chip(page, "tomorrow")]));
const todayBox = await page.evaluate(() => { const r = document.querySelector('[data-v484day="today"]').getBoundingClientRect(); return [r.width, r.height]; });
check("Today chip is a big target (>=110x44)", todayBox[0] >= 110 && todayBox[1] >= 44, JSON.stringify(todayBox));
await page.click('[data-v484day="today"]'); await sleep(300);
let ids = await rowIds();
const badges = await page.evaluate(() => [...document.querySelectorAll("#app .train .badge")].length);
check("Today shows every sample for today regardless of status (running, ended, blank, noise) with badges", JSON.stringify(ids) === JSON.stringify(["h2", "h4", "hB", "hN"]) && badges >= 4, JSON.stringify(ids));
await shot(page, "chromebook-4-day-filter-today", true);
await page.click('[data-sfilter="ev_running"]'); await sleep(300); ids = await rowIds();
check("day + status combine (Today AND Running = h2 only); status counts follow the day", JSON.stringify(ids) === JSON.stringify(["h2"]) && (await page.evaluate(() => document.querySelector('[data-sfilter="ev_running"] .chip-n').textContent)) === "1", JSON.stringify(ids));
await page.click('[data-sfilter="all"]'); await sleep(200);
await page.click('[data-v484day="yesterday"]'); await sleep(300); ids = await rowIds();
check("Yesterday = h1 (shift date) + h5 (started 23:59 AWST)", JSON.stringify(ids) === JSON.stringify(["h1", "h5"]), JSON.stringify(ids));
await page.click('[data-v484day="tomorrow"]'); await sleep(300); ids = await rowIds();
check("Tomorrow = h3", JSON.stringify(ids) === JSON.stringify(["h3"]), JSON.stringify(ids));
await page.click('[data-v484day="tomorrow"]'); await sleep(300); ids = await rowIds();
check("tapping the lit day chip again clears the day filter (all 7 back)", ids.length === 7 && !(await chip(page, "tomorrow")).on, JSON.stringify(ids));
/* arrows follow the day filter */
await page.click('[data-v484day="today"]'); await sleep(200);
await page.evaluate(() => openTrain("h2")); await sleep(300); s = await st(page);
check("with Today on, sample arrows step through today's samples only ('1 of 4 · Today')", s.pos === "1 of 4 · Today" && (await page.evaluate(() => document.getElementById("v484Next").textContent.trim())) === "Sample 4 ›", JSON.stringify(s));
await page.click("#v484SideNext"); await sleep(250);
check("next under Today skips tomorrow's h3 and goes to h4", (await st(page)).train === "h4");
/* no-date sample */
await page.evaluate(() => openEvent("eN")); await sleep(300);
const nd = await page.evaluate(() => ({ rows: document.querySelectorAll("#app .train").length, today: document.querySelector('[data-v484day="today"]').textContent.trim() }));
await page.click('[data-v484day="today"]'); await sleep(300);
const nd2 = await page.evaluate(() => ({ rows: document.querySelectorAll("#app .train").length, empty: (document.getElementById("v484DayEmpty") || {}).textContent || "" }));
check("sample with no date: listed under no day filter, never under a day (empty message)", nd.rows === 1 && nd.today === "Today 0" && nd2.rows === 0 && /No samples today/.test(nd2.empty), JSON.stringify([nd, nd2]));
/* project page day chips */
await page.evaluate(() => openProject("p484")); await sleep(500);
const evRows = () => page.evaluate(() => [...document.querySelectorAll('#app .card[onclick^="openEvent("]')].map(r => /openEvent\('([^']+)'/.exec(r.getAttribute("onclick"))[1]).sort());
const all5 = await evRows();
await page.click('[data-v484pday="today"]'); await sleep(400); const pt = await evRows();
await shot(page, "chromebook-5-project-day-filter", true);
await page.click('[data-v484pday="yesterday"]'); await sleep(400); const py = await evRows();
await page.click('[data-v484pday="yesterday"]'); await sleep(400); const pc = await evRows();
check("project screen: Today = events dated today (eH, eA); Yesterday = eY + eH (has yesterday's samples); tap again clears", all5.length === 5 && JSON.stringify(pt) === JSON.stringify(["eA", "eH"]) && JSON.stringify(py) === JSON.stringify(["eH", "eY"]) && pc.length === 5, JSON.stringify({ all5, pt, py, pc }));
check("day filter writes nothing (times / statuses unchanged)", (await times(page)) === t0d);
check("no page errors (chromebook)", !errs.length, errs.join(" | "));
await page.close();

/* the device's own time zone does not matter: same Perth answers from a Los Angeles clock */
const la = await boot("chromebook", "America/Los_Angeles");
const laDays = await la.evaluate(() => [v484.dayYmd("today"), v484.sampleDay(db.trains.find(x => x.id === "h4")), v484.sampleDay(db.trains.find(x => x.id === "h5"))]);
check("device in another time zone: today / sample days still Perth (AWST)", JSON.stringify(laDays) === JSON.stringify([TODAY, TODAY, YDAY]), JSON.stringify(laDays));
check("no page errors (tz)", !errs.length, errs.join(" | "));

await browser.close(); server.close();
const passed = results.filter(r => r.ok).length;
fs.writeFileSync("/workspace/time-lock/work/v48-4/test-results.json", JSON.stringify({ passed, failed: results.length - passed, results }, null, 2));
console.log(`\n${passed} passed, ${results.length - passed} failed`);
process.exit(passed === results.length ? 0 : 1);
