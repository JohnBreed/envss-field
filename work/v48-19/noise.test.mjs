/* v48.19 noise tests: Add measurement, Area / Task, new SLM fields, Equipment used, drop-downs, octave bands (John 28 Nov 2026 AWST).
   Usage: ROOT=<worktree> OUT=/workspace/guard-shots/v4819 node work/v48-19/noise.test.mjs [pixel7|chromebook]   (default: both)
   Supabase is mocked in memory and *.supabase.co is mapped to a dead local port. Fixture names are made up. */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
const OUT = process.env.OUT || "/workspace/guard-shots/v4819"; fs.mkdirSync(OUT, { recursive: true });
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
    projects: [{ id: "p1", number: "0019919", name: "v48.19 noise test", source: "field", site: "Test site", client: "Acme Mining" }],
    events: [{ id: "eH", projectId: "p1", code: "0019919-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      { id: "eN", projectId: "p1", code: "0019919-002", type: "noise", date: TODAY, stage: "planned", audit: [], noiseCal: cal },
      { id: "eP", projectId: "p1", code: "0019919-003", type: "hygiene", podioEventKind: "noise", date: TODAY, stage: "planned", audit: [], noiseCal: cal },
      { id: "eO", projectId: "p1", code: "0019919-004", type: "noise", date: "2026-10-01", stage: "planned", audit: [], noiseCal: { "2026-10-01": { start: { ref: "94.0", reading: "94.0", at: ago(900), by: "test" } } } }],
    trains: [
      H("h1", "eH", 1), H("h2", "eH", 2, { trainKind: "airborne_static", mode: "static", location: "Bay 2" }),
      NZ("hn", "eH", 3),                                   /* a noise sample on a hygiene event keeps its sample wording */
      /* legacy records: a static SLM and a static dose badge entered before v48.19, plus a static with no method yet */
      NZ("lg1", "eN", 1, { trainKind: "noise_static", mode: "static", status: "ended", startAt: ago(3), endAt: ago(2), location: "Mill floor", noise: { method: "slm", entry: "manual", values: { LAeq: { v: "88.4", src: "manual" }, LCpeak: { v: "101.2", src: "manual" }, LCeq: { v: "89.0", src: "manual" } }, octave: { "125": "70.1", "250": "71.0" }, hpdAtt: [], slmNo: "12", envssNo: "3", source: "Crusher", conditions: "Running", position: "1.5 m", duration: "1:00", micSerial: "M-OLD", slmModel: "B&K 2250" } }),
      NZ("lg2", "eN", 2, { trainKind: "noise_static", mode: "static", location: "Gate", dosimeterSerial: "D-lg2", startAt: ago(3), endAt: ago(2), noise: { method: "dose", entry: "manual", values: { LAeq: { v: "70.0", src: "manual" } }, octave: {}, hpdAtt: [] } }),
      NZ("lg3", "eN", 3, { trainKind: "noise_static", mode: "static", location: "Yard" }),
      /* an earlier event with values used before, for the drop-downs */
      NZ("o1", "eO", 1, { trainKind: "noise_static", mode: "static", shiftDate: "2026-10-01", noise: { method: "slm", entry: "manual", values: {}, octave: {}, hpdAtt: [], source: "Diesel generator", conditions: "Under load", position: "2 m from exhaust", scope: "area", slmModel: "Rion NL-52" } })
    ].map(t => t), deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
  };
}
const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
async function boot(vp) {
  const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "warning" && /noise\.js/.test(m.text())) page.errs.push(m.text()); });
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); const store = {}; page.mlog = mockSupabase(page, store, {});
  page.on("request", r => { const u = r.url(); if (!u.startsWith(url) && !u.startsWith("data:") && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|\.supabase\.co\//.test(u)) ext.push(vp + " " + r.method() + " " + u.split("?")[0]); });
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  const fx = fixture(); await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); }, fx);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(d => { window.ENVSS_CONFIG.admins = ["field.test@envss.com.au"]; db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains)); db.catalogs = Object.assign(db.catalogs || {}, d.catalogs); persist(); }, fx);
  await sleep(200); return page;
}
const metrics = page => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, vv: visualViewport && visualViewport.width }));
const tap = async (page, sel) => { await page.evaluate(s => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: "center", behavior: "instant" }); }, sel); await sleep(120); await page.click(sel); };
const T = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(db.trains.find(x => x.id === i))), id);
const EV = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(db.events.find(x => x.id === i))), id);
const open = async (page, id) => { await page.evaluate(i => openTrain(i), id); await sleep(350); };
const openEv = async (page, id) => { await page.evaluate(i => openEvent(i), id); await sleep(350); };
const txt = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel || "#app");
const has = (page, sel) => page.evaluate(s => !!document.querySelector(s), sel);
const val = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.value : null; }, sel);
const NEWEST = page => page.evaluate(() => { const t = db.trains[db.trains.length - 1]; return JSON.parse(JSON.stringify(t)); });
async function fill(page, sel, v) { await page.evaluate(s => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: "center", behavior: "instant" }); }, sel); await sleep(80); await page.focus(sel); await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace"); if (v) await page.type(sel, v); await page.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(250); }
async function pickSug(page, sel, text) {
  await page.focus(sel); await sleep(200);
  const ok = await page.evaluate((s, tx) => { const box = document.querySelector(s).closest(".combo").querySelector(".suggest"); const d = [...box.querySelectorAll("[data-v]")].find(x => x.dataset.v === tx); if (!d) return false; d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })); return true; }, sel, text);
  await sleep(300); return ok;
}

async function run(vp) {
  const L = s => `${vp}: ${s}`; const shot = (page, n) => page.screenshot({ path: path.join(OUT, `noise-${n}-${vp}.png`) });
  const page = await boot(vp);
  const before = page.errs.length; console.log("METRICS", JSON.stringify(await metrics(page)));

  /* ---- 1. event page wording + Add measurement screen ---- */
  await openEv(page, "eN");
  const evTxt = await txt(page);
  const fabTxt = await page.evaluate(() => { const f = document.querySelector(".fab"); const n = document.querySelector('nav.bnav [data-go="add"] span'); return { fab: f && !f.hidden ? f.textContent : "(hidden)", nav: n ? n.textContent : "" }; });
  check(L("noise event page: Add measurement button / FAB, no 'Add sample'"), /Add measurement/.test(evTxt + fabTxt.fab) && !/Add sample/i.test(evTxt + fabTxt.fab), JSON.stringify(fabTxt));
  check(L("noise event page: rows read 'Noise Measurement N', not 'Noise Sample'"), /Noise Measurement 1/.test(evTxt) && !/Noise Sample/.test(evTxt), evTxt.slice(0, 400));
  check(L("noise event page: bottom bar says Measure"), vp === "chromebook" ? true : fabTxt.nav === "Measure", fabTxt.nav);
  await page.evaluate(() => openPickType("eN")); await sleep(300);
  const pk = await page.evaluate(() => ({ h: document.querySelector("#app h2").innerText, cards: [...document.querySelectorAll("#app .card strong")].map(x => x.innerText), all: document.getElementById("app").innerText }));
  check(L("Add measurement screen: title"), pk.h === "Add measurement", pk.h);
  check(L("Add measurement screen: exactly the three noise types"), JSON.stringify(pk.cards) === JSON.stringify(["Noise · personal (dose badge)", "Noise · area / task (sound level meter)", "Noise · static dose badge"]), JSON.stringify(pk.cards));
  check(L("Add measurement screen: no airborne / blank options and no 'sample' wording"), !/Airborne|Field blank|sample/i.test(pk.all), pk.all);
  await shot(page, "add-measurement");
  await page.evaluate(() => openPickType("eP")); await sleep(300);
  const pp = await page.evaluate(() => [...document.querySelectorAll("#app .card strong")].map(x => x.innerText));
  check(L("event tagged noise by Podio (podioEventKind) gets the same screen"), pp.length === 3 && /Noise · static dose badge/.test(pp[2]), JSON.stringify(pp));
  await page.evaluate(() => openPickType("eH")); await sleep(300);
  const hy = await page.evaluate(() => ({ h: document.querySelector("#app h2").innerText, cards: [...document.querySelectorAll("#app .card strong")].map(x => x.innerText) }));
  check(L("hygiene event: still 'Add sample' with every type"), hy.h === "Add sample" && hy.cards.length === 6 && hy.cards.includes("Airborne · personal") && hy.cards.includes("Noise · static"), JSON.stringify(hy));
  await openEv(page, "eH");
  const hyEv = await txt(page);
  check(L("hygiene event page: wording unchanged (Add sample, Noise Sample 3)"), /Add sample|Sample/.test(hyEv) && !/Measurement/.test(hyEv) && /Noise Sample 3/.test(hyEv), hyEv.slice(0, 300));

  /* ---- 2. first tap sets the method ---- */
  await page.evaluate(() => openPickType("eN")); await sleep(300);
  await tap(page, '[data-nz-add="slm"]'); await sleep(500);
  let t = await NEWEST(page);
  check(L("tap SLM: noise_static with method slm, set from the first tap, no chip question"), t.trainKind === "noise_static" && t.noise && t.noise.method === "slm" && t.noise.v20 === true, JSON.stringify(t.noise));
  check(L("tap SLM: confirmation says measurement, not sample"), page.dialogs.some(d => /add a new measurement\?/i.test(d)) && !page.dialogs.some(d => /new sample/i.test(d)), JSON.stringify(page.dialogs));
  const slmId = t.id;
  check(L("tap SLM: lands on the measurement; Measured-with chips are gone"), !(await has(page, "[data-nz-method]")) && /Sound level meter \(area \/ task\)/.test(await txt(page, "#nzPanel")), (await txt(page, "#nzPanel")).slice(0, 200));
  const head = await page.evaluate(() => document.getElementById("app").innerText.split("\n").slice(0, 8).join(" | "));
  check(L("measurement screen header uses measurement wording"), /Measurement/.test(head) && !/Noise Sample/.test(head), head);
  check(L("ENVSS reading number auto-filled in sequence (event has 3 earlier noise records → 4)"), t.noise.envssNo === "4" && (await val(page, "#nz-envssNo")) === "4", t.noise.envssNo);

  /* ---- 3. Area / Task ---- */
  const aItems = await page.evaluate(i => answerItems(db.trains.find(x => x.id === i)).filter(x => !x.ok).map(x => x.key), slmId);
  check(L("Area / Task is asked (needs answer) on a new SLM measurement"), aItems.includes("nzScope") && /Area or task\?\s*needs answer/.test(await txt(page, "#nzPanel")), aItems.join(","));
  check(L("before choosing: no task text field"), !(await has(page, "#nz-task")));
  await tap(page, '[data-nz-kind="area"]'); await sleep(300);
  t = await T(page, slmId);
  check(L("Area chosen: saved, no task field, position placeholder is the area example"), t.noise.scope === "area" && !(await has(page, "#nz-task")) && /1\.5 m/.test(await page.evaluate(() => document.getElementById("nz-position").placeholder)), JSON.stringify(t.noise.scope));
  await tap(page, '[data-nz-entry="manual"]'); await sleep(300);
  await fill(page, "#nzLAeq", "88.2");
  check(L("Area LAeq 88.2: extent + distance prompt shown (prompt, not a block)"), (await has(page, "#nzExtent")) && /Affected area/.test(await txt(page, "#nzExtent")), "");
  await shot(page, "slm-area");
  await tap(page, '[data-nz-kind="task"]'); await sleep(300);
  t = await T(page, slmId);
  check(L("Task chosen: 'What the worker is doing' field appears"), t.noise.scope === "task" && /What the worker is doing/.test(await txt(page, "#nzPanel")) && (await has(page, "#nz-task")), "");
  check(L("Task: placeholder 'e.g. operating a drill'; position hint is operator's ear"), (await page.evaluate(() => document.getElementById("nz-task").placeholder)) === "e.g. operating a drill" && (await page.evaluate(() => document.getElementById("nz-position").placeholder)) === "operator's ear", "");
  check(L("Task: task text is asked (needs answer) until filled"), (await page.evaluate(i => answerItems(db.trains.find(x => x.id === i)).filter(x => !x.ok).map(x => x.key), slmId)).includes("nzTask"), "");
  check(L("Task LAeq 88.2: extent / distance prompt shown on a task reading too"), (await has(page, "#nzExtent")) && /Task LAeq at or above 85/.test(await txt(page, "#nzExtent")), "");
  const fl = await page.evaluate(i => ENVSS_NOISE.flags(db.trains.find(x => x.id === i)).filter(f => f.k === "a85").map(f => f.sev + ":" + f.text), slmId);
  check(L("extent on a task reading is a non-blocking warning"), fl.length === 1 && /^warn:Task LAeq/.test(fl[0]), JSON.stringify(fl));
  await fill(page, "#nzLAeq", "80.0");
  check(L("Task LAeq 80: no extent prompt"), !(await has(page, "#nzExtent")), "");
  await fill(page, "#nz-task", "Operating a rock drill");
  await shot(page, "slm-task");
  await fill(page, "#nzLAeq", "88.2");
  t = await T(page, slmId);
  check(L("task text saved"), t.noise.task === "Operating a rock drill", t.noise.task);
  await shot(page, "slm-task-extent");

  /* ---- 4. reading numbers + comments ---- */
  await fill(page, "#nz-slmNo", "17"); await fill(page, "#nz-envssNo", "9"); await fill(page, "#nz-comments", "Wind gusts during the reading");
  t = await T(page, slmId);
  check(L("SLM no, ENVSS no (edited) and Additional comments saved"), t.noise.slmNo === "17" && t.noise.envssNo === "9" && t.noise.comments === "Wind gusts during the reading", JSON.stringify([t.noise.slmNo, t.noise.envssNo, t.noise.comments]));
  check(L("next ENVSS number continues after the edited one"), (await page.evaluate(() => ENVSS_NOISE.nextEnvssNo("eN", null))) === 10, "");

  /* ---- 5. octave bands ---- */
  await page.evaluate(() => { const d = document.querySelector("#nzPanel .nz-oct"); if (d) d.open = true; });
  const labs = await page.evaluate(() => [...document.querySelectorAll("#nzPanel .nz-grid9 label")].map(l => l.innerText));
  check(L("octave bands: 31.5 and 63 Hz come before 125"), JSON.stringify(labs) === JSON.stringify(["31.5 Hz", "63 Hz", "125 Hz", "250 Hz", "500 Hz", "1 kHz", "2 kHz", "4 kHz", "8 kHz"]), JSON.stringify(labs));
  await page.evaluate(() => document.getElementById("nz-octave_31_5").scrollIntoView({ block: "center", behavior: "instant" }));
  await fill(page, "#nz-octave_31_5", "61.2"); await fill(page, "#nz-octave_63", "64.0"); await fill(page, "#nz-octave_125", "70.5");
  t = await T(page, slmId);
  check(L("octave 31.5 stored under the key '31.5' (not split on the dot)"), t.noise.octave["31.5"] === "61.2" && t.noise.octave["63"] === "64.0" && t.noise.octave["125"] === "70.5" && !t.noise.octave["31"], JSON.stringify(t.noise.octave));
  await page.evaluate(() => document.getElementById("nzPanel").querySelector(".nz-oct").scrollIntoView({ block: "center", behavior: "instant" })); await sleep(150);
  await shot(page, "octave-bands");

  /* ---- 6. spectrum prompt unchanged ---- */
  await fill(page, "#nzLAeq", "100.0"); await fill(page, "#nzLCpeak", "139.9");
  const s1 = await has(page, "#nzSpectrum");
  await fill(page, "#nzLCpeak", "140.0"); const s2 = await has(page, "#nzSpectrum");
  await fill(page, "#nzLCpeak", "120.0"); await fill(page, "#nzLAeq", "110.0"); const s3 = await has(page, "#nzSpectrum");
  await fill(page, "#nzLAeq", "110.1"); const s4 = await has(page, "#nzSpectrum");
  check(L("Spectrum Table prompt unchanged: LCpeak 139.9 no, 140 yes, LAeq 110 no, 110.1 yes"), !s1 && s2 && !s3 && s4, JSON.stringify([s1, s2, s3, s4]));
  await fill(page, "#nzLAeq", "88.2"); await fill(page, "#nzLCpeak", "103.8");

  /* ---- 7. Equipment used (event) ---- */
  await openEv(page, "eN");
  check(L("Equipment used block on the noise event page"), (await has(page, "#nzEquip")) && /Equipment used/.test(await txt(page, "#nzEquip")), "");
  const add = async (type, model, serial) => { await page.select('#nzEquip [data-nz-eqf="type"]', type); await fill(page, '#nzEquip [data-nz-eqf="model"]', model); await fill(page, '#nzEquip [data-nz-eqf="serial"]', serial); await page.evaluate(() => { const b = document.querySelector('#nzEquip [data-nz-eqadd="e"]'); b.scrollIntoView({ block: "center", behavior: "instant" }); b.click(); }); await sleep(350); };
  await add("slm", "B&K 2250", "3005012"); await add("mic", "B&K 4189", "2712345"); await add("cal", "B&K 4231", "2699001");
  let ev = await EV(page, "eN");
  check(L("equipment entered once on the event: SLM, microphone, calibrator with serials"), ev.noiseEquip && ev.noiseEquip.length === 3 && ev.noiseEquip.map(x => x.type + ":" + x.serial).join() === "slm:3005012,mic:2712345,cal:2699001", JSON.stringify(ev.noiseEquip));
  const eqTypes = await page.evaluate(() => [...document.querySelectorAll('#nzEquip [data-nz-eqf="type"] option')].map(o => o.textContent));
  check(L("equipment types offered: Microphone, Type 1 Sound Level Meter, Sound Calibrator"), eqTypes.includes("Microphone") && eqTypes.includes("Type 1 Sound Level Meter") && eqTypes.includes("Sound Calibrator"), JSON.stringify(eqTypes));
  await page.evaluate(() => document.getElementById("nzEquip").scrollIntoView({ block: "start", behavior: "instant" })); await page.evaluate(() => window.scrollBy(0, -90)); await sleep(150);
  await shot(page, "equipment-block");
  /* model drop-down inside the equipment form: built from models used before (Rion on the earlier event) */
  await page.click('#nzEquip [data-nz-eqf="model"]'); await sleep(150);
  const em = await page.evaluate(() => [...document.querySelectorAll("#nzEquip .suggest.on [data-v]")].map(x => x.dataset.v));
  check(L("make / model drop-down lists models used on this and earlier events"), em.includes("B&K 2250") && em.includes("Rion NL-52"), JSON.stringify(em));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());

  /* ---- 8. pick equipment per measurement ---- */
  await open(page, slmId);
  const selOpts = await page.evaluate(() => ({ slm: [...document.querySelectorAll("#nz-eq-slm option")].map(o => o.textContent), mic: [...document.querySelectorAll("#nz-eq-mic option")].map(o => o.textContent), cal: [...document.querySelectorAll("#nz-eq-cal option")].map(o => o.textContent) }));
  check(L("measurement offers the event's equipment in three pickers"), selOpts.slm.some(x => /B&K 2250/.test(x)) && selOpts.mic.some(x => /4189/.test(x)) && selOpts.cal.some(x => /4231/.test(x)), JSON.stringify(selOpts));
  const idOf = ty => ev.noiseEquip.find(x => x.type === ty).id;
  await page.select("#nz-eq-slm", idOf("slm")); await sleep(250); await page.select("#nz-eq-mic", idOf("mic")); await sleep(250); await page.select("#nz-eq-cal", idOf("cal")); await sleep(300);
  t = await T(page, slmId);
  check(L("picks saved with the measurement and mirrored to the record fields (calibrator serial included)"), t.noise.equip.slm === idOf("slm") && t.dosimeterSerial === "3005012" && t.noise.slmModel === "B&K 2250" && t.noise.micSerial === "2712345" && t.fieldCalibrator === "2699001", JSON.stringify([t.noise.equip, t.dosimeterSerial, t.noise.micSerial, t.fieldCalibrator]));
  check(L("picks are in the audit log"), (t.audit || []).some(a => a.action === "Equipment picked" && /Sound Calibrator/.test(a.detail)), "");
  await page.evaluate(() => document.getElementById("nzEquipPick").scrollIntoView({ block: "center", behavior: "instant" })); await sleep(150);
  await shot(page, "equipment-pick");
  /* second measurement picks from the same list without re-entering */
  await page.evaluate(() => openPickType("eN")); await sleep(300); await tap(page, '[data-nz-add="slm"]'); await sleep(500);
  const t2 = await NEWEST(page);
  check(L("second SLM measurement: ENVSS number continues (10)"), t2.noise.envssNo === "10", t2.noise.envssNo);
  await page.select("#nz-eq-slm", idOf("slm")); await sleep(250);
  const t2b = await T(page, t2.id); ev = await EV(page, "eN");
  check(L("second measurement picks the same SLM without re-entering it (still 3 items on the event)"), t2b.dosimeterSerial === "3005012" && ev.noiseEquip.length === 3, "");
  /* correcting the serial once on the event updates the measurements that picked it */
  await openEv(page, "eN");
  const eqSel = `[data-nz-eqedit="${idOf("slm")}.serial"]`;
  await fill(page, eqSel, "3005099");
  t = await T(page, slmId);
  check(L("editing a serial on the event updates measurements that picked it"), t.dosimeterSerial === "3005099", t.dosimeterSerial);

  /* ---- 9. drop-downs ---- */
  await open(page, slmId);
  await fill(page, "#nz-source", "Two extraction fans"); await fill(page, "#nz-conditions", "Fans only"); await fill(page, "#nz-position", "Operator's ear");
  await open(page, t2.id);
  await tap(page, '[data-nz-kind="task"]'); await sleep(300);
  await page.focus("#nz-source"); await sleep(200);
  let sg = await page.evaluate(() => [...document.querySelector("#nz-source").closest(".combo").querySelectorAll(".suggest.on [data-v]")].map(x => x.dataset.v));
  check(L("description / source drop-down: this event's values first, then earlier events"), sg.indexOf("Diesel generator") === 2 && sg.slice(0, 2).sort().join() === "Crusher,Two extraction fans", JSON.stringify(sg));
  await page.evaluate(() => document.activeElement.blur()); await sleep(250);
  await page.focus("#nz-conditions"); await sleep(200);
  sg = await page.evaluate(() => [...document.querySelector("#nz-conditions").closest(".combo").querySelectorAll(".suggest.on [data-v]")].map(x => x.dataset.v));
  check(L("operating conditions drop-down built from used values"), sg.includes("Fans only") && sg.includes("Under load") && sg.includes("Running"), JSON.stringify(sg));
  await page.evaluate(() => document.activeElement.blur()); await sleep(250);
  await page.focus("#nz-position"); await sleep(200);
  sg = await page.evaluate(() => [...document.querySelector("#nz-position").closest(".combo").querySelectorAll(".suggest.on [data-v]")].map(x => x.dataset.v));
  check(L("measurement position drop-down: Operator's ear first for a task, then used values"), sg[0] === "Operator's ear" && sg.includes("2 m from exhaust") && sg.includes("1.5 m"), JSON.stringify(sg));
  await page.evaluate(() => document.getElementById("nz-position").scrollIntoView({ block: "center", behavior: "instant" })); await sleep(150);
  await shot(page, "dropdown");
  await page.evaluate(() => document.activeElement.blur()); await sleep(250);
  check(L("pick from the drop-down fills and saves the field"), await pickSug(page, "#nz-source", "Diesel generator") && (await T(page, t2.id)).noise.source === "Diesel generator", "");
  await fill(page, "#nz-conditions", "Brand new condition");
  check(L("type your own value: kept exactly as typed"), (await T(page, t2.id)).noise.conditions === "Brand new condition", "");
  await page.focus("#nz-source"); await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control"); await page.keyboard.type("fan"); await sleep(250);
  sg = await page.evaluate(() => [...document.querySelector("#nz-source").closest(".combo").querySelectorAll(".suggest.on [data-v]")].map(x => x.dataset.v));
  check(L("typing filters the drop-down"), JSON.stringify(sg) === JSON.stringify(["Two extraction fans"]), JSON.stringify(sg));
  await page.evaluate(() => document.activeElement.blur()); await sleep(250);
  check(L("a half-typed filter is saved as typed (blur keeps 'fan')"), (await T(page, t2.id)).noise.source === "fan", "");
  await fill(page, "#nz-source", "Diesel generator");
  /* the measurement position of an area reading has no pinned hint */
  await tap(page, '[data-nz-kind="area"]'); await sleep(250); await page.focus("#nz-position"); await sleep(200);
  sg = await page.evaluate(() => [...document.querySelector("#nz-position").closest(".combo").querySelectorAll(".suggest.on [data-v]")].map(x => x.dataset.v));
  check(L("area reading: Operator's ear is not pinned first (list is by use: this event, then earlier)"), sg[0] === "1.5 m" && sg.includes("Operator's ear"), JSON.stringify(sg));
  await page.evaluate(() => document.activeElement.blur());

  /* ---- 10. static dose badge + personal ---- */
  await page.evaluate(() => openPickType("eN")); await sleep(300); await tap(page, '[data-nz-add="dose"]'); await sleep(500);
  t = await NEWEST(page); const doseId = t.id;
  check(L("tap static dose badge: method dose from the first tap; SLM-only fields not shown"), t.trainKind === "noise_static" && t.noise.method === "dose" && !(await has(page, "#nz-slmNo")) && !(await has(page, "[data-nz-kind]")), JSON.stringify(t.noise));
  check(L("dose badge picks only a calibrator (event equipment)"), (await has(page, "#nz-eq-cal")) && !(await has(page, "#nz-eq-slm")), "");
  const dk = await page.evaluate(i => answerItems(db.trains.find(x => x.id === i)).filter(x => !x.ok).map(x => x.key), doseId);
  check(L("dose badge: no Area/Task or method question"), !dk.includes("nzScope") && !dk.includes("nzMethod"), dk.join(","));
  await page.evaluate(() => openPickType("eN")); await sleep(300); await tap(page, '[data-nz-add="personal"]'); await sleep(500);
  t = await NEWEST(page);
  check(L("tap personal: noise_personal, nothing else invented"), t.trainKind === "noise_personal" && t.mode === "personal", t.trainKind);
  /* the Measurement type select */
  const sel = await page.evaluate(() => [...document.querySelectorAll("#trainKind option")].map(o => o.textContent + (o.selected ? "*" : "")));
  check(L("Measurement type select lists the three noise types"), sel.length === 3 && /personal \(dose badge\)\*/.test(sel[0]) && /area \/ task \(sound level meter\)/.test(sel[1]) && /static dose badge/.test(sel[2]), JSON.stringify(sel));
  await page.select("#trainKind", "noise_slm"); await sleep(400);
  t = await NEWEST(page);
  check(L("switching type to area / task SLM sets the method"), t.trainKind === "noise_static" && t.noise.method === "slm" && (await has(page, "#nz-slmNo")), JSON.stringify(t.noise && t.noise.method));
  await page.select("#trainKind", "noise_staticdose"); await sleep(400);
  t = await NEWEST(page);
  check(L("switching type to static dose badge sets the method"), t.trainKind === "noise_static" && t.noise.method === "dose" && !(await has(page, "#nz-slmNo")), JSON.stringify(t.noise && t.noise.method));
  check(L("measurement page help text uses measurement wording"), /Noise measurements can switch between personal, area \/ task and static dose badge/.test(await txt(page)) && /Measurement type/.test(await txt(page)), "");

  /* ---- 11. legacy records ---- */
  await open(page, "lg1");
  t = await T(page, "lg1");
  check(L("legacy static SLM record keeps method, values and octave; still shows the method chips"), t.noise.method === "slm" && t.noise.values.LAeq.v === "88.4" && t.noise.octave["125"] === "70.1" && (await has(page, "[data-nz-method]")) && (await val(page, "#nzLAeq")) === "88.4", "");
  check(L("legacy SLM: labelled as area / task SLM; old mic / model fields still editable; ENVSS no as before"), /area \/ task/.test(await page.evaluate(() => document.querySelector("#trainKind option:checked").textContent)) && (await val(page, "#nz-micSerial")) === "M-OLD" && (await val(page, "#nz-envssNo")) === "3", "");
  const navTxt = await page.evaluate(() => [...document.querySelectorAll(".v484-side, #v484Nav")].map(e => e.innerText).join(" | "));
  check(L("previous / next arrows on a noise event say Measurement, not Sample"), /Noise Measurement/.test(navTxt) && !/Noise Sample/.test(navTxt), navTxt);
  await fill(page, "#nz-micSerial", "M-NEW");
  check(L("legacy SLM still editable and saved"), (await T(page, "lg1")).noise.micSerial === "M-NEW", "");
  check(L("legacy SLM: Area / Task offered but not forced (no new 'needs answer' on old records)"), !(await page.evaluate(() => answerItems(db.trains.find(x => x.id === "lg1")).some(x => x.key === "nzScope"))) && (await has(page, '[data-nz-kind="task"]')), "");
  await open(page, "lg2");
  t = await T(page, "lg2");
  check(L("legacy static dose badge keeps its method and values"), t.noise.method === "dose" && t.noise.values.LAeq.v === "70.0" && (await val(page, "#nzLAeq")) === "70.0", "");
  await open(page, "lg3");
  const o3 = await page.evaluate(() => ({ opts: [...document.querySelectorAll("#trainKind option")].map(o => o.textContent + (o.selected ? "*" : "")), chips: !!document.querySelector("[data-nz-method]"), needs: /needs answer/.test(document.getElementById("nzPanel").innerText) }));
  check(L("legacy static with no method yet: still asks (chips + 'needs answer'), type select keeps 'Noise · static'"), o3.chips && o3.needs && o3.opts.some(x => /Noise · static \(method not chosen yet\)\*/.test(x)), JSON.stringify(o3));
  /* opening legacy records changed nothing */
  const lg3 = await T(page, "lg3");
  check(L("opening a legacy record writes nothing (no noise object, no audit)"), !lg3.noise && !(lg3.audit || []).length, JSON.stringify(lg3.noise));

  /* ---- 12. hygiene event untouched, airborne untouched ---- */
  await open(page, "h2");
  const ab = await page.evaluate(() => ({ t: document.getElementById("app").innerText, sel: [...document.querySelectorAll("#trainKind option")].map(o => o.textContent) }));
  check(L("airborne static sample: 'Sample' wording and airborne types unchanged"), /Sample/.test(ab.t) && !/Measurement/.test(ab.t) && ab.sel.includes("Airborne · personal") && ab.sel.length === 4, JSON.stringify(ab.sel));
  await open(page, "hn");
  const hn = await page.evaluate(() => ({ t: document.getElementById("app").innerText, sel: [...document.querySelectorAll("#trainKind option")].map(o => o.textContent) }));
  check(L("noise sample on a hygiene event keeps 'sample' wording (only noise events switch)"), /Sample/.test(hn.t) && !/Noise Measurement/.test(hn.t), "");
  await openEv(page, "eH");
  check(L("no Equipment used block on a hygiene event"), !(await has(page, "#nzEquip")), "");
  await page.evaluate(() => openPickType("eH")); await sleep(300); await page.click('[onclick*="airborne_personal"]'); await sleep(500);
  const nt = await NEWEST(page);
  check(L("adding an airborne sample on a hygiene event works as before"), nt.trainKind === "airborne_personal" && page.dialogs.some(d => /add a new sample\?/i.test(d)), nt.trainKind);

  /* ---- 13. persistence ---- */
  await page.reload({ waitUntil: "networkidle0" }); await sleep(900);
  t = await T(page, slmId); ev = await EV(page, "eN");
  check(L("after reload: measurement, equipment picks and octave '31.5' survive"), t.noise.scope === "task" && t.noise.octave["31.5"] === "61.2" && t.noise.equip.mic && ev.noiseEquip.length === 3 && t.noise.task === "Operating a rock drill", "");
  await open(page, slmId);
  check(L("after reload: Task fields and 31.5 Hz show again"), (await val(page, "#nz-task")) === "Operating a rock drill" && (await val(page, "#nz-octave_31_5")) === "61.2" && (await val(page, "#nz-eq-mic")) === t.noise.equip.mic, "");
  check(L("noise.js reports version 48.19"), (await page.evaluate(() => ENVSS_NOISE.version)) === "48.19", "");
  check(L("no page errors / noise.js warnings"), page.errs.length === before, JSON.stringify(page.errs));
  await page.ctx; await page.close();
}
const vps = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of vps) { console.log("=== " + vp); await run(vp); }
check("no requests outside the app (no external hosts)", ext.length === 0, JSON.stringify(ext.slice(0, 5)));
const fails = results.filter(r => !r.ok);
fs.writeFileSync(path.join(OUT, "noise-test-results.json"), JSON.stringify({ at: new Date().toISOString(), total: results.length, failed: fails.length, results }, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
await browser.close(); server.close(); process.exit(fails.length ? 1 : 0);
