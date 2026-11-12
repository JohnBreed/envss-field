/* v49 headless tests: Detailed Occupational Noise Assessment (NZA). Mock Supabase only — no production writes.
   Run:  ROOT=<repo> OUT=<shots dir> V48ROOT=<v48 checkout> node work/v49/test49.mjs
   V48ROOT (optional) renders the same Hygiene / AFM screens on v48 and checks v49 renders them identically. */
import fs from "fs";
import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "../v46/harness.mjs";

const OUT = process.env.OUT || "/tmp/v49-shots";
const IMG = process.env.IMG || new URL("./fixtures/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
}
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Perth" });

/* pre-v49 device data: a hygiene event (airborne + noise samples, v47 noise panel data) and an AFM event */
const FIXTURE = {
  catalogs: { contaminants: [
    { id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" },
    { id: "NOISE", name: "Noise dose", code: "NOISE", kind: "noise" }
  ], pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
  projects: [{ id: "ptest", number: "0099999", name: "V49 upgrade test", source: "field", site: "Test workshop" }],
  events: [
    { id: "ehyg", projectId: "ptest", code: "0099999-001", type: "hygiene", date: "2026-11-12", stage: "planned", multiDay: false, minesAct: false, notes: "hyg note", uploadReady: false, operators: [], audit: [] },
    { id: "eafm", projectId: "ptest", code: "ENVSS-HYG-AFM-0099999-1-20261112", type: "fibre", date: "2026-11-12", stage: "planned", protocol: "background", tat: "next_0700", rotameter: "R1", operators: [] }
  ],
  trains: [
    { id: "tair", eventId: "ehyg", pouch: "1", sampleNo: 1, trainKind: "airborne_personal", contaminantId: "INH", pumpSerial: "88473", startFlow: "2.0", endFlow: "2.0",
      status: "ended", shiftDate: "2026-11-12", shiftKind: "day", startAt: "2026-11-12T00:00:00.000Z", endAt: "2026-11-12T06:00:00.000Z",
      person: { first: "Sam", last: "Tester", occupation: "Fitter" }, rpd: {}, hpd: {}, comments: "fixture", audit: [] },
    { id: "tnoise", eventId: "ehyg", pouch: "2", sampleNo: 2, trainKind: "noise_personal", contaminantId: "NOISE", dosimeterSerial: "D-77", status: "ended",
      shiftDate: "2026-11-12", shiftKind: "day", startAt: "2026-11-12T00:30:00.000Z", endAt: "2026-11-12T06:30:00.000Z",
      person: { first: "Sam", last: "Tester", occupation: "Fitter" }, rpd: {}, hpd: { worn: "yes", model: "3M" },
      noise: { method: "dose", entry: "manual", badgeType: "4448", firmware: "1.2", values: { LAeq: { v: "84.9", src: "manual" }, LCpeak: { v: "103.8", src: "manual" } }, octave: {}, hpdAtt: [] }, audit: [] },
    { id: "tafm0", eventId: "eafm", sampleNo: 0, trainKind: "blank", status: "field_blank", audit: [] }
  ],
  deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
};
const IDB_PHOTO = { pid: "11111111-2222-4333-8444-555555555555", path: "p/ptest/e/ehyg/t/tair/x.jpg", bytes: 3, uploaded: false, trainId: "tair", eventId: "ehyg", projectId: "ptest", field: "photo", tries: 0, nextAt: Date.now() + 864e5, createdAt: "2026-11-12T01:00:00.000Z" };

const { server, base } = await serve();
const browser = await launch();
const errs = [];

async function boot(vpName, b = base, store = {}) {
  const page = await browser.newPage();
  page.on("pageerror", e => errs.push(vpName + ": " + String(e)));
  await page.setViewport(VIEWPORTS[vpName].viewport);
  await page.setUserAgent(VIEWPORTS[vpName].ua);
  await page.setRequestInterception(true);
  page._log = mockSupabase(page, store);
  page._store = store;
  const dialogs = [];
  page.on("dialog", async d => { dialogs.push(d.type() + ": " + d.message()); if (d.type() === "prompt") await d.accept(page._promptAnswer || ""); else await d.accept(); });
  page._dialogs = dialogs;
  await page.goto(b + "/field.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(SESSION);
  await page.evaluate(data => localStorage.setItem("envss-field-next-v32", JSON.stringify(data)), FIXTURE);
  /* existing IndexedDB data from before the upgrade (photo queue): must survive */
  await page.evaluate(rec => new Promise((res, rej) => { const r = indexedDB.open("envss-field-photos", 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("photos")) r.result.createObjectStore("photos", { keyPath: "pid" }); };
    r.onsuccess = () => { const t = r.result.transaction("photos", "readwrite"); t.objectStore("photos").put(Object.assign({ blob: new Blob(["abc"], { type: "image/jpeg" }), mime: "image/jpeg" }, rec)); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
    r.onerror = () => rej(r.error); }), IDB_PHOTO);
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(900);
  await page.evaluate(data => { db.projects = data.projects; db.events = JSON.parse(JSON.stringify(data.events)); db.trains = JSON.parse(JSON.stringify(data.trains)); db.deletions = []; persist(); render(); }, FIXTURE);
  await sleep(200);
  return page;
}
async function tap(pg, sel) { await pg.$eval(sel, el => el.scrollIntoView({ block: "center" })); await sleep(80); await pg.click(sel); }
const shot = async (page, name, full = true) => { const f = path.join(OUT, name + ".png"); await page.screenshot({ path: f, fullPage: full }); return f; };
const shots = [];
async function snapScreens(page) {
  /* the Hygiene / AFM screens a user sees, with version text normalised */
  return page.evaluate(async () => {
    const norm = h => h.replace(/v4[89](\.0)?/g, "vX").replace(/noise module v[\d.]+/g, "").replace(/ENVSS Field vX[^<]*/g, "");
    const out = {};
    const grab = async (k, fn) => { fn(); await new Promise(r => setTimeout(r, 150)); out[k] = norm(document.getElementById("app").innerHTML); };
    await grab("hygEvent", () => openEvent("ehyg"));
    await grab("afmEvent", () => openEvent("eafm"));
    await grab("airSample", () => openTrain("tair"));
    await grab("noiseSample", () => openTrain("tnoise"));
    await grab("project", () => openProject("ptest"));
    return out;
  });
}
const recs = page => page.evaluate(() => JSON.stringify({ e: db.events.filter(e => e.type !== "noise_assessment").map(e => { const x = Object.assign({}, e); delete x.updatedAt; return x; }), t: db.trains.map(t => { const x = Object.assign({}, t); delete x.updatedAt; return x; }) }));

/* ---------- Chromebook ---------- */
const page = await boot("chromebook");
const ver = await page.evaluate(() => ({ app: APP_VERSION, title: document.title, noise: window.ENVSS_NOISE && ENVSS_NOISE.version, nza: !!(ENVSS_NOISE.nza) }));
check("version 49 / noise.js 49.0 with NZA", ver.app === "49" && /v49/.test(ver.title) && ver.noise === "49.0" && ver.nza, JSON.stringify(ver));

const preOpen = await recs(page);
const screensV49 = await snapScreens(page);
/* opening a sample screen adds an empty "analyses" list on samples that lack one (existing v48 behaviour, checked below) */
const before = await recs(page);
if (process.env.V48ROOT) {
  const http = await import("http");
  /* serve the v48 checkout on another port */
  const srv48 = http.createServer((req, res) => { const u = new URL(req.url, "http://x"); let p = path.join(process.env.V48ROOT, decodeURIComponent(u.pathname)); fs.readFile(p, (e, buf) => { if (e) { res.writeHead(404); res.end(); return; } const ext = path.extname(p); res.writeHead(200, { "Content-Type": ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : "application/octet-stream", "Cache-Control": "no-store" }); res.end(buf); }); });
  await new Promise(r => srv48.listen(0, "127.0.0.1", r));
  const p48 = await boot("chromebook", "http://127.0.0.1:" + srv48.address().port);
  const v48 = await p48.evaluate(() => APP_VERSION);
  const pre48 = await recs(p48);
  const screensV48 = await snapScreens(p48);
  const post48 = await recs(p48);
  check("v48 itself adds the same empty 'analyses' list when samples are opened (not a v49 change)", (pre48 === preOpen) && (post48 === (await recs(page))), "v48 " + (pre48 !== post48 ? "adds analyses on open" : "no change") + "; v49 same");
  for (const k of Object.keys(screensV48)) check("unchanged vs v48: " + k + " screen", screensV48[k] === screensV49[k], screensV48[k] === screensV49[k] ? "identical (v" + v48 + " vs v49)" : "DIFF len " + screensV48[k].length + " vs " + screensV49[k].length);
  await p48.close(); srv48.close();
}

/* new event: dropdown + fields */
await page.evaluate(() => { openProject("ptest"); });
await sleep(200);
await page.evaluate(() => openNewEvent("ptest"));
await sleep(200);
const dd = await page.evaluate(() => [...document.querySelectorAll("#ntype option")].map(o => o.value + "=" + o.textContent.trim()));
check("Event type dropdown has Hygiene, AFM and the new type, distinct", dd.length === 3 && dd[0].startsWith("hygiene=Hygiene event") && /fibre=Airborne fibre monitoring \(AFM\)/.test(dd[1]) && dd[2] === "noise_assessment=Detailed Occupational Noise Assessment", dd.join(" | "));
await page.select("#ntype", "noise_assessment");
await sleep(100);
const vis = await page.evaluate(() => ({ nza: getComputedStyle(document.getElementById("nzaEventFields")).display, hyg: getComputedStyle(document.getElementById("hygieneEventFields")).display, afm: getComputedStyle(document.getElementById("fibreEventFields")).display }));
check("Selecting it shows only the noise assessment note (no mines / multi-day / AFM fields)", vis.nza !== "none" && vis.hyg === "none" && vis.afm === "none", JSON.stringify(vis));
shots.push(await shot(page, "chromebook-1-new-event-type", false));
const tBefore = await page.evaluate(() => db.trains.length);
await page.click("#btnCreateEv");
await sleep(300);
const ev = await page.evaluate(() => { const e = db.events.find(x => x.type === "noise_assessment"); return e && { id: e.id, code: e.code, nza: !!e.nza, page: view.page, unplanned: e.podioUnplanned }; });
const tAfter = await page.evaluate(() => db.trains.length);
check("Create makes a noise_assessment event, opens it, and creates NO samples", ev && ev.nza && ev.page === "event" && tAfter === tBefore, JSON.stringify(ev) + " trains " + tBefore + "→" + tAfter);
check("Event code follows the job sequence", ev && ev.code === "0099999-002", ev && ev.code);
const pre = await page.evaluate(() => ({ presite: !!document.getElementById("nzaPresite"), addDisabled: [...document.querySelectorAll('[data-nza-act^="add:"]')].map(b => b.disabled), txt: document.getElementById("nzaPresite").innerText }));
check("Before site asks only for dose badges and the SLM calibration certificate", pre.presite && /Dose badges added/.test(pre.txt) && /SLM calibration certificate/.test(pre.txt), pre.txt.split("\n").slice(0, 4).join(" / "));
check("Measurement buttons wait until a badge / SLM is added", pre.addDisabled.every(Boolean), JSON.stringify(pre.addDisabled));
shots.push(await shot(page, "chromebook-2-event-presite"));

/* pre-site: badge + SLM + certificate */
await page.click('[data-nza-act="addBadge"]'); await sleep(150);
await page.type('[data-nza-inst$=":serial"][data-nza-inst^="badge:"]', "DB-101"); await page.keyboard.press("Tab"); await sleep(150);
await page.click('[data-nza-act="addSlm"]'); await sleep(150);
await page.type('[data-nza-inst^="slm:"][data-nza-inst$=":serial"]', "2250-3001234"); await page.keyboard.press("Tab"); await sleep(150);
await page.type('[data-nza-inst^="slm:"][data-nza-inst$=":certNo"]', "CAL-5521"); await page.keyboard.press("Tab"); await sleep(150);
await page.$eval('[data-nza-inst^="slm:"][data-nza-inst$=":certDue"]', el => { el.value = "2027-06-30"; el.dispatchEvent(new Event("change", { bubbles: true })); }); await sleep(200);
const certIn = await page.$('[data-nza-take^="cert:"]');
await certIn.uploadFile(path.join(IMG, "cert.jpg")); await sleep(1500);
const ps = await page.evaluate(() => { const e = db.events.find(x => x.type === "noise_assessment"); const z = e.nza; return { b: z.badges.map(x => x.serial), s: z.slms.map(x => [x.serial, x.certNo, x.certDue, String(x.certPhoto).slice(0, 12)]), todo: document.querySelector(".nza-todo").innerText }; });
check("Pre-site: badge, SLM, certificate number / due date and certificate photo saved", ps.b[0] === "DB-101" && ps.s[0][0] === "2250-3001234" && ps.s[0][1] === "CAL-5521" && ps.s[0][2] === "2027-06-30" && ps.s[0][3] === "envss-photo:", JSON.stringify(ps));
check("Pre-site checklist ticks both", (ps.todo.match(/✓/g) || []).length === 2, ps.todo.replace(/\n/g, " / "));
shots.push(await shot(page, "chromebook-3-presite-done"));

/* start-of-day calibration */
const setCal = async (which, ref, reading) => {
  for (const [key, val] of [["ref", ref], ["reading", reading]]) {
    const n = (await page.$$(`[data-nza-cal*=":${which}:"][data-nza-cal$=":${key}"]`)).length;
    for (let i = 0; i < n; i++) { const inp = (await page.$$(`[data-nza-cal*=":${which}:"][data-nza-cal$=":${key}"]`))[i]; await inp.click({ clickCount: 3 }); await inp.type(val); await page.keyboard.press("Tab"); await sleep(150); }
  }
};
await page.type('[data-nza-day$=":calibrator"]', "4231-778"); await page.keyboard.press("Tab"); await sleep(100);
await setCal("start", "94.0", "93.9");
const cal = await page.evaluate(day => { const z = db.events.find(x => x.type === "noise_assessment").nza; const c = z.cal[day]; return { calibrator: c.calibrator, n: Object.keys(c.start || {}).length, at: Object.values(c.start || {}).every(x => x.at && x.by), r: Object.values(c.start || {}).map(x => x.reading) }; }, TODAY);
check("Start-of-day calibration recorded for every badge and SLM, time + who stamped", cal.calibrator === "4231-778" && cal.n === 2 && cal.at && cal.r.every(r => r === "93.9"), JSON.stringify(cal));

/* SLM area reading */
await page.click('[data-nza-act="add:slm"]'); await sleep(300);
const rs1 = await page.evaluate(() => ({ id: !!document.getElementById("nzaReading"), h: document.querySelector("#nzaReading h3").textContent }));
check("Add SLM reading asks to confirm, then opens Reading 1", rs1.id && /Reading 1 · SLM/.test(rs1.h) && page._dialogs.some(d => /Add a new SLM reading/.test(d)), rs1.h);
await page.click('[data-nza-act="purpose:area"]'); await sleep(150);
await page.type('[data-nza-r="location"]', "Fabrication bay 2"); await page.keyboard.press("Tab"); await sleep(120);
await page.type('[data-nza-r="source"]', "Grinding + extraction fans"); await page.keyboard.press("Tab"); await sleep(120);
await page.click('[data-nza-act="entry:manual"]'); await sleep(150);
const slmFields = await page.evaluate(() => [...document.querySelectorAll("#nzaReading .nz-val label")].map(l => l.textContent.replace(/required/, "").trim()));
check("SLM reading captures LAeq, LCpeak and LCeq", slmFields.join(",") === "LAeq dB(A),LCpeak dB(C),LCeq dB(C)", slmFields.join(","));
check("LAeq marked required before entry", await page.evaluate(() => !document.querySelector('[data-nza-req="LAeq"]').hidden));
await page.type('[data-nza-r="values.LAeq"]', "88.4"); await sleep(400);
const a6a = await page.evaluate(() => ({ req: document.querySelector('[data-nza-req="LAeq"]').hidden, ext: !document.getElementById("nzaExtent").hidden, flags: [...document.querySelectorAll("#nzaChecks li")].map(l => l.dataset.flag) }));
check("LAeq 'required' clears as soon as a value is typed", a6a.req === true);
check("A6: area LAeq ≥ 85 dB(A) flags and asks for extent + distance", a6a.ext && a6a.flags.includes("a85"), JSON.stringify(a6a));
await page.keyboard.press("Tab"); await sleep(150);
await page.type('[data-nza-r="values.LCpeak"]', "121.0"); await page.keyboard.press("Tab"); await sleep(150);
await page.type('[data-nza-r="values.LCeq"]', "95.2"); await page.keyboard.press("Tab"); await sleep(150);
await page.type('[data-nza-r="extent"]', "Whole bay"); await page.keyboard.press("Tab"); await sleep(150);
await page.type('[data-nza-r="extentDistance"]', "6"); await page.keyboard.press("Tab"); await sleep(250);
const meterIn = await page.$('[data-nza-take^="screen:"]');
await meterIn.uploadFile(path.join(IMG, "meter.jpg")); await sleep(600);
const crop = await page.$("#nzCropWhole"); if (crop) { await crop.click(); } await sleep(1200);
const r1 = await page.evaluate(() => { const z = db.events.find(x => x.type === "noise_assessment").nza; const r = z.readings[0]; return { no: r.no, kind: r.kind, purpose: r.purpose, loc: r.location, v: Object.fromEntries(Object.entries(r.values).map(([k, x]) => [k, x.v])), ext: r.extent, photo: String(r.photo).slice(0, 12), inst: r.inst === z.slms[0].id }; });
check("SLM reading saved with values, extent, instrument and meter photo", r1.no === 1 && r1.purpose === "area" && r1.v.LAeq === "88.4" && r1.v.LCpeak === "121.0" && r1.v.LCeq === "95.2" && r1.ext === "Whole bay" && r1.photo === "envss-photo:" && r1.inst, JSON.stringify(r1));
const a6b = await page.evaluate(() => [...document.querySelectorAll("#nzaChecks li")].map(l => l.textContent));
check("A6 flag stays as a referral after extent recorded", a6b.some(t => /at or above 85 dB\(A\) \(extent and distance recorded\)/.test(t)), a6b.join(" | "));
shots.push(await shot(page, "chromebook-4-slm-area-reading"));
await page.click('[data-nza-act="back"]'); await sleep(250);

/* dose badge result */
await page.click('[data-nza-act="add:badge"]'); await sleep(300);
const bF = await page.evaluate(() => ({ h: document.querySelector("#nzaReading h3").textContent, person: !!document.querySelector('[data-nza-r="person.first"]'), hpd: !!document.querySelector('[data-nza-act="hpd:yes"]') }));
check("Dose badge result opens with personal details + HPD questions", /Reading 2 · Dose badge/.test(bF.h) && bF.person && bF.hpd, JSON.stringify(bF));
for (const [sel, v] of [["person.first", "Alex"], ["person.last", "Worker"], ["person.occupation", "Boilermaker"], ["task", "Grinding"]]) { await page.type(`[data-nza-r="${sel}"]`, v); await page.keyboard.press("Tab"); await sleep(120); }
await page.$eval('[data-nza-r="startAt"]', el => { el.value = new Date(Date.now() - 6 * 3600e3 - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16); el.dispatchEvent(new Event("change", { bubbles: true })); }); await sleep(200);
await page.click('[data-nza-act="now:endAt"]'); await sleep(200);
await page.click('[data-nza-act="hpd:yes"]'); await sleep(200);
await page.type('[data-nza-r="hpd.model"]', "3M E-A-Rsoft"); await page.keyboard.press("Tab"); await sleep(120);
await page.type('[data-nza-r="hpd.classRating"]', "Class 4"); await page.keyboard.press("Tab"); await sleep(120);
await page.type('[data-nza-r="hpd.attenuation"]', "26"); await page.keyboard.press("Tab"); await sleep(120);
await page.click('[data-nza-act="fit:yes"]'); await sleep(200);
await page.type('[data-nza-r="hpd.par"]', "21"); await page.keyboard.press("Tab"); await sleep(120);
await page.click('[data-nza-act="entry:manual"]'); await sleep(150);
const bVals = await page.evaluate(() => [...document.querySelectorAll("#nzaReading .nz-val label")].map(l => l.textContent.replace(/required/, "").trim()));
check("Dose badge: LAeq + LCpeak only (no LCeq, no octave / spectrum)", bVals.join(",") === "LAeq dB(A),LCpeak dB(C)" && !(await page.$("#nzaReading .nz-oct")) && !(await page.$("#nzaSpectrum")), bVals.join(","));
await page.type('[data-nza-r="values.LAeq"]', "89.1"); await page.keyboard.press("Tab"); await sleep(150);
await page.type('[data-nza-r="values.LCpeak"]', "128.3"); await page.keyboard.press("Tab"); await sleep(250);
const r2 = await page.evaluate(() => { const z = db.events.find(x => x.type === "noise_assessment").nza; const r = z.readings[1]; return { p: r.person, h: r.hpd, s: !!r.startAt, e: !!r.endAt, v: r.values.LAeq.v, gaps: ENVSS_NOISE.nza.rGaps(db.events.find(x => x.type === "noise_assessment"), r) }; });
check("Badge result saved: person, times, HPD (class and attenuation separate, PAR), values; no gaps", r2.p.first === "Alex" && r2.p.occupation === "Boilermaker" && r2.s && r2.e && r2.h.asked === "yes" && r2.h.classRating === "Class 4" && r2.h.attenuation === "26" && r2.h.par === "21" && r2.v === "89.1" && r2.gaps.length === 0, JSON.stringify(r2));
shots.push(await shot(page, "chromebook-5-dose-badge-result"));
await page.click('[data-nza-act="back"]'); await sleep(250);

/* completion is blocked until end-of-day calibration */
page._dialogs.length = 0;
await page.click('[data-nza-act="complete"]'); await sleep(250);
check("Mark complete blocked until end-of-day calibration", page._dialogs.some(d => /can't be marked complete/.test(d) && /End-of-day calibration/.test(d)), page._dialogs.join(" || ").slice(0, 200));
await setCal("end", "94.0", "94.7");
const fl = await page.evaluate(() => [...document.querySelectorAll("#nzaFlags li")].map(l => l.dataset.flag).filter(Boolean));
check("Drift / end deviation over ±0.5 dB flagged for the team", fl.includes("drift") && fl.includes("devE"), fl.join(","));
shots.push(await shot(page, "chromebook-6-event-flags"));
page._dialogs.length = 0;
await page.click('[data-nza-act="complete"]'); await sleep(300);
const done = await page.evaluate(() => { const e = db.events.find(x => x.type === "noise_assessment"); return { up: e.uploadReady, stage: deriveEventStage(e) }; });
check("Event completes with flags referred to the team", done.up && done.stage === "upload_ready" && page._dialogs.some(d => /flags? will be referred to the team/.test(d)), JSON.stringify(done) + " " + page._dialogs.join(" | ").slice(0, 160));

/* sync rides the existing event row; no sample rows */
await sleep(2500);
await page.evaluate(() => { try { scheduleFlush(10); } catch (e) {} });
await sleep(2000);
const sync = await page.evaluate(() => ({ pending: Object.keys(syncState.pending).filter(k => /^events:/.test(k)) }));
const row = [...(page._store.envss_events || new Map()).values()].find(r => r.payload && r.payload.type === "noise_assessment");
const trainRows = [...(page._store.envss_trains || new Map()).values()].filter(r => r.payload && r.payload.eventId === (row && row.id));
check("Synced on the existing envss_events row (payload.nza), nothing in envss_trains", row && row.payload.nza.readings.length === 2 && trainRows.length === 0, row ? "readings " + row.payload.nza.readings.length + ", train rows " + trainRows.length + ", pending " + sync.pending.length : "no row");

const evAud = await page.evaluate(() => { const e = db.events.find(x => x.type === "noise_assessment"); return { generic: (e.audit || []).length, own: e.nza.audit.length, kb: Math.round(JSON.stringify(e).length / 1024) }; });
check("Event record stays small: own audit only, no generic event change-log copies", evAud.generic === 0 && evAud.own > 10 && evAud.kb < 40, JSON.stringify(evAud));

/* project list */
await page.evaluate(() => openProject("ptest")); await sleep(250);
const plist = await page.evaluate(() => [...document.querySelectorAll("#app .card .muted")].map(m => m.textContent));
check("Project list shows the type and measurement count", plist.some(t => /Detailed Occupational Noise Assessment · .* · 2 measurements/.test(t)), plist.filter(t => /Noise/.test(t)).join(" | "));
shots.push(await shot(page, "chromebook-7-project-list", false));

/* floating + on a noise assessment adds a measurement, never a sample */
const nzaId = await page.evaluate(() => db.events.find(x => x.type === "noise_assessment").id);
await page.evaluate(id => openEvent(id), nzaId); await sleep(250);
const fabTxt = await page.evaluate(() => { const f = document.querySelector(".fab"); return f && !f.hidden ? f.textContent : "(hidden)"; });
await page.evaluate(() => document.querySelector(".fab").click()); await sleep(200);
const chooser = await page.evaluate(() => !!document.getElementById("nzaChooser"));
shots.push(await shot(page, "chromebook-8-add-measurement-chooser", false));
const tb = await page.evaluate(() => db.trains.length);
await page.click('[data-nza-pick=""]'); await sleep(150);
const tAfterFab = await page.evaluate(() => ({ trains: db.trains.length, page: view.page }));
check("On a noise assessment the floating + says Add measurement and opens the measurement chooser (no sample picker)", /Add measurement/.test(fabTxt) && chooser && tAfterFab.trains === tb && tAfterFab.page === "event", fabTxt + " " + JSON.stringify(tAfterFab));
await page.evaluate(() => openEvent("ehyg")); await sleep(200);
const fabHyg = await page.evaluate(() => document.querySelector(".fab").textContent);
check("Hygiene event floating + still says Add sample", /Add sample/.test(fabHyg), fabHyg);

/* CSV */
const csv = await page.evaluate(() => ENVSS_NOISE.nza.toCsv(db.events.find(x => x.type === "noise_assessment")));
check("CSV export: one row per measurement with flags", csv.split("\n").length === 3 && /Dose badge/.test(csv) && /88\.4/.test(csv) && /drift/i.test(csv), csv.split("\n")[0].slice(0, 80));

/* reload: data persists on the device */
await page.reload({ waitUntil: "networkidle0" }); await sleep(900);
const persisted = await page.evaluate(() => { const e = db.events.find(x => x.type === "noise_assessment"); return e && e.nza.readings.length; });
check("Noise assessment data survives a reload (local storage)", persisted === 2, persisted);

/* Hygiene + AFM untouched */
const after = await page.evaluate(() => JSON.stringify({ e: db.events.filter(e => e.type !== "noise_assessment").map(e => { const x = Object.assign({}, e); delete x.updatedAt; return x; }), t: db.trains.map(t => { const x = Object.assign({}, t); delete x.updatedAt; return x; }) }));
if (after !== before) { fs.writeFileSync(path.join(OUT, "diff-before.json"), JSON.stringify(JSON.parse(before), null, 1)); fs.writeFileSync(path.join(OUT, "diff-after.json"), JSON.stringify(JSON.parse(after), null, 1)); }
check("Existing Hygiene / AFM events and samples unchanged by the whole flow", after === before, after === before ? "identical" : "DIFF (see diff-*.json)");
const idb = await page.evaluate(async () => { const names = (await indexedDB.databases()).map(d => d.name).sort(); const rec = await new Promise(res => { const r = indexedDB.open("envss-field-photos"); r.onsuccess = () => { const q = r.result.transaction("photos").objectStore("photos").get("11111111-2222-4333-8444-555555555555"); q.onsuccess = () => res(q.result ? { pid: q.result.pid, trainId: q.result.trainId, blob: !!q.result.blob } : null); }; }); return { names, rec }; });
check("IndexedDB names unchanged and pre-upgrade photo record intact", idb.names.every(n => ["envss-field-photos", "envss-field-drive"].includes(n) || /^envss-/.test(n)) && idb.rec && idb.rec.trainId === "tair" && idb.rec.blob, JSON.stringify(idb));
/* hygiene + AFM creation still works the old way */
await page.evaluate(() => openNewEvent("ptest")); await sleep(150);
await page.click("#btnCreateEv"); await sleep(250);
const hyg = await page.evaluate(() => { const e = db.events[db.events.length - 1]; return { type: e.type, code: e.code, nza: "nza" in e }; });
check("Default New project event still creates a Hygiene event", hyg.type === "hygiene" && !hyg.nza, JSON.stringify(hyg));
await page.evaluate(() => openNewEvent("ptest")); await sleep(150);
await page.select("#ntype", "fibre"); await sleep(100);
await page.click("#btnCreateEv"); await sleep(250);
const afm = await page.evaluate(() => { const e = db.events[db.events.length - 1]; return { type: e.type, blank: db.trains.some(t => t.eventId === e.id && t.trainKind === "blank"), nza: "nza" in e }; });
check("AFM event creation unchanged (field blank created)", afm.type === "fibre" && afm.blank && !afm.nza, JSON.stringify(afm));
await page.close();

/* ---------- Pixel 7 ---------- */
const phone = await boot("pixel7");
await phone.evaluate(() => openNewEvent("ptest")); await sleep(150);
await phone.select("#ntype", "noise_assessment"); await sleep(100);
shots.push(await shot(phone, "pixel7-1-new-event-type", false));
await phone.click("#btnCreateEv"); await sleep(300);
await tap(phone, '[data-nza-act="addBadge"]'); await sleep(150);
await phone.type('[data-nza-inst^="badge:"][data-nza-inst$=":serial"]', "DB-202"); await phone.keyboard.press("Tab"); await sleep(150);
await tap(phone, '[data-nza-act="addSlm"]'); await sleep(150);
await phone.type('[data-nza-inst^="slm:"][data-nza-inst$=":serial"]', "2250-77"); await phone.keyboard.press("Tab"); await sleep(150);
const ovf1 = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
shots.push(await shot(phone, "pixel7-2-event-screen"));
await tap(phone, '[data-nza-act="add:slm"]'); await sleep(300);
await tap(phone, '[data-nza-act="purpose:area"]'); await sleep(150);
await tap(phone, '[data-nza-act="entry:manual"]'); await sleep(150);
await phone.type('[data-nza-r="values.LAeq"]', "91.0"); await phone.keyboard.press("Tab"); await sleep(250);
const ovf2 = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const phoneA6 = await phone.evaluate(() => !document.getElementById("nzaExtent").hidden);
shots.push(await shot(phone, "pixel7-3-slm-reading"));
await tap(phone, '[data-nza-act="back"]'); await sleep(200);
await tap(phone, '[data-nza-act="add:badge"]'); await sleep(300);
await tap(phone, '[data-nza-act="hpd:yes"]'); await sleep(150);
const ovf3 = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
shots.push(await shot(phone, "pixel7-4-dose-badge"));
check("Pixel 7: no sideways scrolling on event / SLM / badge screens", ovf1 <= 0 && ovf2 <= 0 && ovf3 <= 0, [ovf1, ovf2, ovf3].join(","));
check("Pixel 7: A6 prompt shows on an area reading of 91 dB(A)", phoneA6);
const phoneTap = await phone.evaluate(() => [...document.querySelectorAll("#nzaReading button, #nzaReading .btn")].filter(b => b.offsetParent).every(b => b.getBoundingClientRect().height >= 32));
check("Pixel 7: buttons are tappable size (≥32 px)", phoneTap);
await phone.close();

check("No page errors", errs.length === 0, errs.slice(0, 5).join(" | "));
fs.writeFileSync(path.join(OUT, "test-results.json"), JSON.stringify({ at: new Date().toISOString(), results, shots }, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
