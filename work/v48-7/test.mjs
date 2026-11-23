/* v48.7 draft tests: lock-down guards (open item 3, John 23 Nov 2026 AWST).
   Usage: ROOT=/workspace/envss-lock node work/v48-7/test.mjs [pixel7|chromebook]   (default: both)
   Supabase is mocked in memory and *.supabase.co is mapped to a dead local port, so nothing reaches production. Fixture names are made up. */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
const OUT = process.env.OUT || "/workspace/lock-shots"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 600) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date()), YDAY = PF.format(new Date(Date.now() - 86400e3));
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const person = (first, last, company) => ({ first, last, sex: "male", sexSet: true, dob: "1985-03-04", dobD: "04", dobM: "03", dobY: "1985", occupation: "Fitter", company: company || "", hours: "12", daysOn: "8", daysOff: "6" });
const H = (id, ev, n, extra) => Object.assign({ id, eventId: ev, trainKind: "airborne_static", mode: "static", sampleNo: n, pouch: String(n), contaminantId: "INH", pumpSerial: "7700" + n, headId: "IESS1" + n, mediaId: "C-" + n,
  startFlow: "2.0", endFlow: "", rotameter: "R1", shiftDate: TODAY, shiftKind: "day", status: "prepped", startAt: "", endAt: "", comments: "", location: "Bay " + n,
  person: { first: "", last: "", sex: "", dob: "", occupation: "", company: "", hours: "", daysOn: "", daysOff: "" }, rpd: {}, hpd: {}, audit: [] }, extra || {});
function fixture() {
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }, { id: "NOISE", name: "Noise dose", code: "NOISE", kind: "noise" }],
      pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p487", number: "0019487", name: "v48.7 lock-down test", source: "field", site: "Test site", client: "Acme Mining" },
      { id: "p488", number: "0019488", name: "Other job", source: "field", client: "Downer" }],
    events: [{ id: "eH", projectId: "p487", code: "0019487-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      { id: "eO", projectId: "p488", code: "0019488-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      { id: "eN", projectId: "p487", code: "0019487-002", type: "noise", date: TODAY, stage: "planned", audit: [] },
      { id: "eF", projectId: "p487", code: "0019487-AFM-003", type: "fibre", date: TODAY, stage: "planned", rotameter: "FR4", audit: [] },
      { id: "eF2", projectId: "p488", code: "0019488-AFM-004", type: "fibre", date: TODAY, stage: "planned", rotameter: "FR4", audit: [] }],
    trains: [
      H("h1", "eH", 1, { trainKind: "airborne_personal", mode: "personal", headId: "IESS01", location: "", person: person("Sam", "Testone", "Acme Mining") }),
      H("h2", "eH", 2, { status: "running", startAt: ago(15) }),
      H("h3", "eH", 3, { status: "ended", startAt: ago(8), endAt: ago(1), endFlow: "1.9", location: "Crusher west", commentAsked: "yes", rejectAsked: "no" }),
      H("h4", "eH", 4, { trainKind: "airborne_personal", mode: "personal", location: "", person: person("Ben", "Testtwo", "") }),
      H("h6", "eH", 6),
      H("o1", "eO", 1, { status: "running", startAt: ago(2), headId: "IESS01", person: person("Lee", "Other", "BHP Contractors") }),
      H("o2", "eO", 2, { status: "ended", startAt: ago(9), endAt: ago(3), endFlow: "2.1", trainKind: "airborne_personal", mode: "personal", person: person("Kim", "Other", "Downer") }),
      { id: "n1", eventId: "eN", trainKind: "noise_personal", mode: "personal", sampleNo: 1, pouch: "1", contaminantId: "NOISE", dosimeterSerial: "D-1001", fieldCalibrator: "CAL-1", shiftDate: TODAY, status: "prepped", startAt: "", endAt: "", person: person("Noel", "Testthree", "Acme Mining"), rpd: {}, hpd: {}, audit: [] },
      { id: "f1", eventId: "eF", trainKind: "fibre_static", mode: "static", sampleNo: 1, pouch: "1", cowlNo: "13469", mediaId: "13469", pumpSerial: "94475", location: "North boundary", startFlow: "2.0", endFlow: "", shiftDate: TODAY, status: "prepped", startAt: "", endAt: "", audit: [] },
      { id: "f9", eventId: "eF2", trainKind: "fibre_static", mode: "static", sampleNo: 4, pouch: "4", cowlNo: "13469", mediaId: "13469", pumpSerial: "101312", location: "PESP", startFlow: "2.0", endFlow: "", shiftDate: TODAY, status: "running", startAt: ago(3), endAt: "", audit: [] }
    ], deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
  };
}
const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
async function boot(vp) {
  const page = await browser.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "warning" && /v48\.7/.test(m.text())) page.errs.push(m.text()); });
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
const T = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(db.trains.find(x => x.id === i))), id);
const open = async (page, id) => { await page.evaluate(i => openTrain(i), id); await sleep(300); };
const modalOf = (page, id) => page.evaluate(i => { const m = document.querySelector('.v483-modal[data-v487="' + i + '"]'); return m ? m.innerText : null; }, id);
const closeNudge = page => page.evaluate(() => { const b = document.getElementById("v483NudgeOk"); if (b) b.click(); });

async function run(vp) {
  const shot = (page, n, full = false) => page.screenshot({ path: path.join(OUT, `${vp}-${n}.png`), fullPage: full });
  const laptop = vp === "chromebook";
  const page = await boot(vp);
  check(`[${vp}] app is v48.7 with STOP limit 14 h in warn mode`, await page.evaluate(() => APP_VERSION === "48.7" && document.getElementById("appVersion").textContent === "v48.7" && v487.STOP_LIMIT_H === 14 && v487.STOP_LIMIT_MODE === "warn"));
  const isAdm = await page.evaluate(() => isAdmin()); check(`[${vp}] test operator is admin (for the approval card)`, isAdm);

  /* a. end flow locked while running; b. 14 h STOP warning */
  await open(page, "h2");
  let ef = await page.evaluate(() => { const e = document.getElementById("endFlow"); return { ro: e && e.readOnly, help: !!document.getElementById("v487EfLock") }; });
  check(`[${vp}] (a) end flow is read-only before STOP, with 'unlocks when you press STOP'`, ef.ro && ef.help, JSON.stringify(ef));
  await page.evaluate(() => document.getElementById("endFlow").scrollIntoView({ block: "center" })); await shot(page, "01-endflow-locked-running");
  await page.click("#btnStop"); await sleep(200);
  let m = await modalOf(page, "long");
  check(`[${vp}] (b) STOP 15 h after START shows the 14 h warning and does not stop yet`, m && /15\.0 h/.test(m) && /over the 14 h/.test(m) && (await T(page, "h2")).status === "running", m);
  await shot(page, "02-stop-14h-warning");
  await page.click("#v487No"); await sleep(200);
  check(`[${vp}] (b) Cancel leaves the sample running`, (await T(page, "h2")).status === "running" && !(await T(page, "h2")).endAt);
  await page.click("#btnStop"); await sleep(200); await page.click("#v487Yes"); await sleep(500); await closeNudge(page);
  let t = await T(page, "h2");
  check(`[${vp}] (b) 'Stop anyway' stops it and keeps the confirmation in the audit trail`, t.status === "ended" && !!t.endAt && t.audit.some(a => /more than 14 h after START — confirmed/.test(a.action) && a.v487long > 14), JSON.stringify(t.audit.map(a => a.action)));
  ef = await page.evaluate(() => { const e = document.getElementById("endFlow"); return { ro: e && e.readOnly, lock: e && e.hasAttribute("data-v487lock") }; });
  check(`[${vp}] (a) end flow unlocks after STOP (empty box, no reason needed)`, ef.ro === false && !ef.lock, JSON.stringify(ef));
  await page.focus("#endFlow"); await page.type("#endFlow", "2.0"); await page.evaluate(() => document.getElementById("endFlow").blur()); await sleep(400);
  m = await modalOf(page, "efsame");
  check(`[${vp}] (a) end flow exactly = start flow asks 'is that right?'`, m && /start 2\.0 L\/min, end 2\.0 L\/min/.test(m), m);
  await shot(page, "03-endflow-equals-start");
  await page.click("#v487Yes"); await sleep(300);
  t = await T(page, "h2");
  check(`[${vp}] (a) confirming keeps 2.0, logs it, and shows the inline warning`, t.endFlow === "2.0" && t.audit.some(a => a.v487ef === "2.0") && await page.evaluate(() => !!document.getElementById("v487EfSame")), JSON.stringify(t.audit.slice(-3)));
  await page.evaluate(() => document.getElementById("endFlow").scrollIntoView({ block: "center" })); await shot(page, "04-endflow-same-inline");

  /* g. stopped sample: reason before changing an existing answer */
  await open(page, "h3");
  let g = await page.evaluate(() => { const l = document.getElementById("location"), c = document.getElementById("comments"); return { banner: !!document.getElementById("v487Ended"), locRo: l && l.readOnly, locLock: l && l.hasAttribute("data-v487lock"), comLock: c ? c.hasAttribute("data-v487lock") : "none" }; });
  check(`[${vp}] (g) stopped sample shows the lock banner; filled Location locked; empty Comments free`, g.banner && g.locRo && g.locLock && g.comLock === false, JSON.stringify(g));
  await page.evaluate(() => document.getElementById("v487Ended").scrollIntoView({ block: "start" })); await page.evaluate(() => window.scrollBy(0, -80)); await shot(page, "05-stopped-sample-locked");
  await page.evaluate(() => document.getElementById("comments").scrollIntoView({ block: "center" })); await page.click("#comments"); await sleep(100); await page.keyboard.type("Filter looked fine"); await page.evaluate(() => document.getElementById("comments").blur()); await sleep(300);
  const cm = await T(page, "h3"); check(`[${vp}] (g) filling an empty box on a stopped sample needs no reason`, cm.comments === "Filter looked fine" && !(await modalOf(page, "edit")), JSON.stringify({ c: cm.comments, m: await modalOf(page, "edit"), dom: await page.evaluate(() => { const c = document.getElementById("comments"); return c ? [c.tagName, c.value, c.readOnly, c.hasAttribute("data-v487lock")] : null; }) }));
  await page.click('[data-yn="reject"][data-val="yes"]'); await sleep(250);
  check(`[${vp}] (g) changing an answered Yes / No (Sample rejected? No -> Yes) asks for a reason first`, !!(await modalOf(page, "edit")) && (await T(page, "h3")).rejectAsked === "no");
  await page.click("#v487No"); await sleep(200);
  await page.click("#location"); await sleep(250);
  m = await modalOf(page, "edit");
  check(`[${vp}] (g) tapping a filled box asks 'Why change a stopped sample?'`, m && /Why change a stopped sample/.test(m) && /location/i.test(m), m);
  await shot(page, "06-reason-to-edit");
  await page.click("#v487Yes"); await sleep(150);
  check(`[${vp}] (g) a reason is required`, /Pick a reason/.test(await page.evaluate(() => document.getElementById("v487Err").textContent)));
  await page.click("#v487No"); await sleep(250);
  await page.keyboard.type("XX"); await sleep(150);
  check(`[${vp}] (g) Cancel keeps it locked and unchanged`, (await T(page, "h3")).location === "Crusher west" && await page.evaluate(() => document.getElementById("location").readOnly && document.getElementById("location").value === "Crusher west"));
  await page.click("#location"); await sleep(250);
  await page.evaluate(() => { document.querySelector('input[name="v487r"][value="typo"]').checked = true; document.getElementById("v487rText").value = "wrong bay"; });
  await page.click("#v487Yes"); await sleep(400);
  g = await page.evaluate(() => ({ ro: document.getElementById("location").readOnly, banner: (document.getElementById("v487Ended") || {}).innerText || "" }));
  check(`[${vp}] (g) with a reason the sample unlocks and the banner shows the reason`, g.ro === false && /Editing unlocked/.test(g.banner) && /wrong bay/.test(g.banner), JSON.stringify(g));
  await page.evaluate(() => { const l = document.getElementById("location"); l.value = "Crusher east"; l.dispatchEvent(new Event("change", { bubbles: true })); l.blur(); }); await sleep(300);
  t = await T(page, "h3");
  check(`[${vp}] (g) the change saves and the reason is in the audit trail`, t.location === "Crusher east" && t.audit.some(a => a.action === "Edit after STOP unlocked" && a.v487edit && a.v487edit.reason === "typo"), JSON.stringify(t.audit.slice(-3)));
  await page.evaluate(() => document.getElementById("v487Ended").scrollIntoView({ block: "start" })); await page.evaluate(() => window.scrollBy(0, -80)); await shot(page, "07-unlocked-with-reason");
  await open(page, "h2"); await open(page, "h3");
  check(`[${vp}] (g) leaving and coming back locks it again`, await page.evaluate(() => document.getElementById("location").readOnly && !!document.getElementById("v487Unlock")));

  /* c. head already running on another sample (hygiene) */
  await open(page, "h1");
  let hr = await page.evaluate(() => (document.getElementById("v487HeadRun") || {}).textContent || "");
  check(`[${vp}] (c) inline warning: head IESS01 already running on 0019488-001 sample 1`, /Sample head IESS01 is already running on/.test(hr) && /0019488-001/.test(hr), hr);
  await page.evaluate(() => document.getElementById("head").scrollIntoView({ block: "center" })); await shot(page, "08-head-running-inline");
  await page.click("#btnStart"); await sleep(250);
  m = await modalOf(page, "head");
  check(`[${vp}] (c) START asks 'Start anyway?' and has not started`, m && /already running/.test(m) && (await T(page, "h1")).status === "prepped", m);
  await shot(page, "09-head-running-start");
  await page.click("#v487No"); await sleep(200);
  check(`[${vp}] (c) Cancel: still prepped`, (await T(page, "h1")).status === "prepped" && !(await T(page, "h1")).startAt);
  await page.click("#btnStart"); await sleep(250); await page.click("#v487Yes"); await sleep(600);
  t = await T(page, "h1");
  check(`[${vp}] (c) Start anyway: running, confirmation logged`, t.status === "running" && t.audit.some(a => /head already running — confirmed/.test(a.action)), JSON.stringify(t.audit.map(a => a.action)));
  await sleep(1800); await closeNudge(page); await sleep(200);

  /* f. laptop START needs office approval */
  t = await T(page, "h1");
  if (laptop) {
    check(`[chromebook] (f) START on a Chromebook flags 'needs office approval' (nothing blocked)`, t.status === "running" && t.needsOfficeApproval === true, JSON.stringify({ f: t.needsOfficeApproval, a: t.audit.map(a => a.action) }));
    const card = await page.evaluate(() => (document.getElementById("v487Approve") || {}).innerText || "");
    check(`[chromebook] (f) admin sees the approval card with the laptop press`, /Needs office approval/.test(card) && /START pressed on a Chromebook/.test(card), card);
    await page.evaluate(() => document.getElementById("v487Approve").scrollIntoView({ block: "start" })); await page.evaluate(() => window.scrollBy(0, -80)); await shot(page, "10-office-approval-card");
    await page.evaluate(() => openEvent("eH")); await sleep(400);
    const ev = await page.evaluate(() => ({ chip: [...document.querySelectorAll(".v487-chip")].length, line: (document.getElementById("v487EvAppr") || {}).textContent || "" }));
    check(`[chromebook] (f) event list shows the chip and a count for admin`, ev.chip >= 1 && /need(s)? office approval/.test(ev.line), JSON.stringify(ev));
    await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "11-event-list-approval");
    await open(page, "h1"); await page.click("#v487ApproveBtn"); await sleep(300);
    t = await T(page, "h1");
    check(`[chromebook] (f) Approve clears the flag and keeps who / when`, t.needsOfficeApproval === false && t.officeApproval && t.officeApproval.count >= 1 && !(await page.evaluate(() => !!document.getElementById("v487Approve"))), JSON.stringify(t.officeApproval));
  } else {
    check(`[pixel7] (f) START on a phone is not flagged`, t.status === "running" && !t.needsOfficeApproval && !(await page.evaluate(() => !!document.getElementById("v487Approve"))));
  }

  /* d. company picklist */
  await open(page, "h4");
  let co = await page.evaluate(() => { const s = document.getElementById("v487CoSel"); return s ? { opts: [...s.options].map(o => o.value), sel: s.value, inpHidden: document.getElementById("company").style.display === "none" } : null; });
  check(`[${vp}] (d) Company is a picklist: project client first, other companies, Other`, co && co.opts[1] === "Acme Mining" && co.opts.includes("BHP Contractors") && co.opts.includes("Downer") && co.opts[co.opts.length - 1] === "__other" && co.sel === "" && co.inpHidden, JSON.stringify(co));
  await page.evaluate(() => document.getElementById("v487CoSel").scrollIntoView({ block: "center" })); await shot(page, "12-company-picklist");
  await page.select("#v487CoSel", "Downer"); await sleep(300);
  check(`[${vp}] (d) picking Downer saves person.company`, (await T(page, "h4")).person.company === "Downer");
  await page.select("#v487CoSel", "__other"); await sleep(200);
  await page.evaluate(() => { const c = document.getElementById("company"); c.value = ""; }); await page.type("#company", "Newco Scaffolding"); await page.evaluate(() => document.getElementById("company").blur()); await sleep(300);
  check(`[${vp}] (d) Other: typed company saves`, (await T(page, "h4")).person.company === "Newco Scaffolding");
  await shot(page, "13-company-other");
  await open(page, "h1"); await open(page, "h4");
  co = await page.evaluate(() => document.getElementById("v487CoSel").value);
  check(`[${vp}] (d) a typed company joins the list and is selected next time`, co === "Newco Scaffolding", co);

  /* e. noise START needs that day's calibration */
  await open(page, "n1");
  const nd = page.dialogs.length;
  let nz = await page.evaluate(() => ({ gaps: startGaps(db.trains.find(x => x.id === "n1")), gate: (document.getElementById("v487CalGate") || {}).textContent || "" }));
  check(`[${vp}] (e) noise sample without today's calibration: START gap + notice`, nz.gaps.some(s => /Start-of-day calibration/.test(s)) && /START is locked/.test(nz.gate), JSON.stringify(nz));
  await page.evaluate(() => document.getElementById("btnStart").scrollIntoView({ block: "center" })); await shot(page, "14-noise-cal-locked");
  await page.click("#btnStart"); await sleep(300);
  check(`[${vp}] (e) START refused with the calibration listed`, (await T(page, "n1")).status === "prepped" && page.dialogs.slice(nd).some(d => /Start-of-day calibration/.test(d)), JSON.stringify(page.dialogs.slice(nd)));
  await page.evaluate(d => { const ev = db.events.find(e => e.id === "eN"); ev.noiseCal = { [d]: { start: { ref: "94.0", reading: "93.9", at: new Date().toISOString(), by: "test" } } }; persist(); render(); }, TODAY); await sleep(300);
  nz = await page.evaluate(() => ({ gaps: startGaps(db.trains.find(x => x.id === "n1")), gate: !!document.getElementById("v487CalGate") }));
  check(`[${vp}] (e) once calibrated the gap and notice go`, !nz.gaps.length && !nz.gate, JSON.stringify(nz));
  await page.click("#btnStart"); await sleep(500); await closeNudge(page);
  check(`[${vp}] (e) noise START works after calibration`, (await T(page, "n1")).status === "running");

  /* c. AFM cowl already running in another event; a. AFM end flow locked */
  await open(page, "f1");
  hr = await page.evaluate(() => (document.getElementById("v487HeadRun") || {}).textContent || "");
  check(`[${vp}] (c) AFM: cowl 13469 already running on 0019488-AFM-004`, /Cowl 13469 is already running on/.test(hr) && /0019488-AFM-004/.test(hr), hr);
  await page.evaluate(() => document.getElementById("cowlNo").scrollIntoView({ block: "center" })); await shot(page, "15-afm-cowl-running");
  await page.click("#btnStart"); await sleep(250);
  check(`[${vp}] (c) AFM START asks first`, /already running/.test(await modalOf(page, "head") || ""));
  await page.click("#v487Yes"); await sleep(600); await closeNudge(page);
  check(`[${vp}] (c+a) AFM started; end flow read-only while running`, (await T(page, "f1")).status === "running" && await page.evaluate(() => document.getElementById("endFlow").readOnly));

  /* b. typed times 14-24 h apart (v48.3 dialog) */
  await open(page, "h6");
  await page.evaluate(() => v483.openTimeDialog(db.trains.find(x => x.id === "h6"), "both")); await sleep(200);
  await page.evaluate(d => { document.getElementById("v483d-start").value = d; document.getElementById("v483t-start").value = "06:00"; document.getElementById("v483d-stop").value = d; document.getElementById("v483t-stop").value = "21:30"; }, YDAY);
  await page.click("#v483Save"); await sleep(250);
  m = await modalOf(page, "long");
  check(`[${vp}] (b) Enter times 15.5 h apart warns before saving`, m && /15\.5 h/.test(m) && !(await T(page, "h6")).startAt, m);
  await shot(page, "16-typed-times-14h");
  await page.click("#v487Yes"); await sleep(400);
  t = await T(page, "h6");
  check(`[${vp}] (b) Save anyway saves both times with the confirmation`, !!t.startAt && !!t.endAt && t.audit.some(a => /more than 14 h apart — confirmed/.test(a.action)), JSON.stringify(t.audit.map(a => a.action)));
  await sleep(1800);
  t = await T(page, "h6");
  if (laptop) check(`[chromebook] (f) times typed on a Chromebook are flagged for office approval`, t.needsOfficeApproval === true, JSON.stringify(t.needsOfficeApproval));
  else check(`[pixel7] (f) times typed on a phone are not flagged`, !t.needsOfficeApproval);

  /* reload keeps it */
  await page.reload({ waitUntil: "networkidle0" }); await sleep(900);
  const fin = await page.evaluate(() => ["h1", "h2", "h3", "h4", "n1", "f1"].map(i => { const x = db.trains.find(y => y.id === i); return [i, x.status, x.endFlow || "", x.location || "", i === "h3" ? x.comments : (x.person || {}).company || "", x.needsOfficeApproval ? "NOA" : ""].join(":"); }).join(" "));
  check(`[${vp}] reload keeps the saved values`, fin === `h1:running:::Acme Mining: h2:ended:2.0:Bay 2::${laptop ? "NOA" : ""} h3:ended:1.9:Crusher east:Filter looked fine: h4:prepped:::Newco Scaffolding: n1:running:::Acme Mining:${laptop ? "NOA" : ""} f1:running::North boundary::${laptop ? "NOA" : ""}`, fin);
  const oth = await page.evaluate(() => JSON.stringify(["o1", "o2", "f9"].map(i => db.trains.find(x => x.id === i)).map(x => [x.status, x.endFlow, x.audit.length, !!x.needsOfficeApproval])));
  check(`[${vp}] other samples untouched`, oth === JSON.stringify([["running", "", 0, false], ["ended", "2.1", 0, false], ["running", "", 0, false]]), oth);
  check(`[${vp}] no page errors`, !page.errs.length, page.errs.join(" | "));
  const unexpected = page.dialogs.filter(d => !/Cannot start until/.test(d));
  check(`[${vp}] no unexpected native alerts (only the existing 'Cannot start until' list)`, !unexpected.length, unexpected.join(" | "));
  await page.close();
}
const vps = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of vps) { try { await run(vp); } catch (e) { check(`[${vp}] run completed`, false, e.stack); } }
check("no request left the box except the CDN libraries; every Supabase call was answered by the in-memory mock", !ext.length, ext.join("\n"));
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "test-results.json"), JSON.stringify(results, null, 1));
console.log(results.filter(r => r.ok).length + "/" + results.length + " passed");
await browser.close(); server.close();
process.exit(results.every(r => r.ok) ? 0 : 1);
