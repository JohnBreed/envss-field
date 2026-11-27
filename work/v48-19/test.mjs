/* v48.19 tests: lock-down guards (open item 3; John 23 + 27 Nov 2026 AWST).
   Usage: ROOT=/workspace/envss-v4819 OUT=/workspace/guard-shots/v4819 node work/v48-19/test.mjs [pixel7|chromebook]   (default: both)
   Supabase is mocked in memory and *.supabase.co is mapped to a dead local port, so nothing reaches production. Fixture names are made up. */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
const OUT = process.env.OUT || "/workspace/guard-shots/v4819"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 700) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date()), YDAY = PF.format(new Date(Date.now() - 86400e3));
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const perthHM = d => new Intl.DateTimeFormat("en-GB", { timeZone: "Australia/Perth", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
const person = (first, last, company) => ({ first, last, sex: "male", sexSet: true, dob: "1985-03-04", dobD: "04", dobM: "03", dobY: "1985", occupation: "Fitter", company: company || "", hours: "12", daysOn: "8", daysOff: "6" });
const H = (id, ev, n, extra) => Object.assign({ id, eventId: ev, trainKind: "airborne_static", mode: "static", sampleNo: n, pouch: String(n), contaminantId: "INH", pumpSerial: "7700" + n + id, headId: "IESS-" + id, mediaId: "C-" + id,
  startFlow: "2.0", endFlow: "", rotameter: "FR4A40BNBN-NL-02", shiftDate: TODAY, shiftKind: "day", status: "prepped", startAt: "", endAt: "", comments: "", location: "Bay " + n,
  person: { first: "", last: "", sex: "", dob: "", occupation: "", company: "", hours: "", daysOn: "", daysOff: "" }, rpd: {}, hpd: {}, audit: [] }, extra || {});
const NZ = (id, ev, n, extra) => Object.assign({ id, eventId: ev, trainKind: "noise_personal", mode: "personal", sampleNo: n, pouch: String(n), contaminantId: "NOISE", dosimeterSerial: "D-" + id, fieldCalibrator: "59311", shiftDate: TODAY, status: "prepped", startAt: "", endAt: "", location: "Workshop", person: person("Noel", "Test" + id, "Acme Mining"), rpd: {}, hpd: {}, audit: [] }, extra || {});
function fixture() {
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }, { id: "NOISE", name: "Noise dose", code: "NOISE", kind: "noise" }],
      pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p19", number: "0019919", name: "v48.19 guard test", source: "field", site: "Test site", client: "Acme Mining" },
      { id: "p20", number: "0019920", name: "Other job", source: "field", client: "Downer" }],
    events: [{ id: "eH", projectId: "p19", code: "0019919-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      { id: "eO", projectId: "p20", code: "0019920-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      { id: "eN", projectId: "p19", code: "0019919-002", type: "noise", date: TODAY, stage: "planned", audit: [], noiseCal: { [TODAY]: { start: { ref: "94.0", reading: "94.8", at: ago(2), by: "test" } } } },
      { id: "eN2", projectId: "p19", code: "0019919-003", type: "noise", date: TODAY, stage: "planned", audit: [] },
      { id: "eL", projectId: "p19", code: "0019919-004", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      { id: "eF", projectId: "p19", code: "0019919-AFM-005", type: "fibre", date: TODAY, stage: "planned", rotameter: "FR4A40BNBN-NL-01", audit: [] },
      { id: "eF2", projectId: "p20", code: "0019920-AFM-006", type: "fibre", date: TODAY, stage: "planned", rotameter: "FR4A40BNBN-NL-01", audit: [] }],
    trains: [
      H("h1", "eH", 1, { trainKind: "airborne_personal", mode: "personal", headId: "IESS01", location: "", person: person("Sam", "Testone", "Acme Mining") }),
      H("h2", "eH", 2, { status: "running", startAt: ago(15), commentAsked: "no", rejectAsked: "no" }),
      H("h3", "eH", 3, { status: "ended", startAt: ago(8), endAt: ago(1), endFlow: "1.9", location: "Crusher west", rotameter: "OLD-ROTA-9", commentAsked: "yes", rejectAsked: "no" }),
      H("h4", "eH", 4, { trainKind: "airborne_personal", mode: "personal", location: "", person: person("Ben", "Testtwo", "") }),
      H("h6", "eH", 6), H("h7", "eH", 7), H("h8", "eH", 8),
      H("o1", "eO", 1, { status: "running", startAt: ago(2), headId: "IESS01", trainKind: "airborne_personal", mode: "personal", person: person("Lee", "Other", "BHP Contractors") }),
      H("o2", "eO", 2, { status: "ended", startAt: ago(9), endAt: ago(3), endFlow: "2.1", rotameter: "23555270", trainKind: "airborne_personal", mode: "personal", person: person("Kim", "Other", "Downer") }),
      H("o3", "eO", 3, { status: "ended", startAt: ago(9), endAt: ago(3), endFlow: "2.0", trainKind: "airborne_personal", mode: "personal", person: person("Pat", "Other", "Black Cat Syndicate") }),
      H("o4", "eO", 4, { status: "ended", startAt: ago(9), endAt: ago(3), endFlow: "2.0", trainKind: "airborne_personal", mode: "personal", person: person("Jo", "Other", "black cat  syndicate ") }),
      H("o5", "eO", 5, { status: "ended", startAt: ago(9), endAt: ago(3), endFlow: "2.0", trainKind: "airborne_personal", mode: "personal", person: person("Max", "Other", "MacMahon") }),
      H("o6", "eO", 6, { status: "ended", startAt: ago(9), endAt: ago(3), endFlow: "2.0", trainKind: "airborne_personal", mode: "personal", person: person("Cy", "Other", "Black Cate Syndicate") }),
      NZ("n1", "eN", 1), NZ("n2", "eN2", 1),
      H("l1", "eL", 1, { status: "ended", startAt: ago(7), endAt: ago(1), endFlow: "2.0", trainKind: "airborne_personal", mode: "personal", location: "", person: person("Ann", "Nolocation", "Acme Mining"), rejectAsked: "no", equipAsked: "no", commentAsked: "no", rpdAsked: "no" }),
      H("l2", "eL", 2, { status: "ended", startAt: ago(7), endAt: ago(1), endFlow: "2.0", rejectAsked: "no", equipAsked: "no", commentAsked: "no" }),
      { id: "l0", eventId: "eL", trainKind: "blank", sampleNo: 0, pouch: "0", contaminantId: "INH", mediaId: "C-l0", status: "field_blank", shiftDate: TODAY, audit: [] },
      { id: "f0", eventId: "eF", trainKind: "blank", sampleNo: 0, pouch: "0", cowlNo: "13460", mediaId: "13460", rotameter: "", shiftDate: TODAY, status: "field_blank", audit: [] },
      { id: "f1", eventId: "eF", trainKind: "fibre_static", mode: "static", sampleNo: 1, pouch: "1", cowlNo: "13469", mediaId: "13469", pumpSerial: "94475", location: "North boundary", startFlow: "2.0", endFlow: "", rotameter: "FR4A40BNBN-NL-01", shiftDate: TODAY, status: "prepped", startAt: "", endAt: "", audit: [] },
      { id: "f9", eventId: "eF2", trainKind: "fibre_static", mode: "static", sampleNo: 4, pouch: "4", cowlNo: "13469", mediaId: "13469", pumpSerial: "101312", location: "PESP", startFlow: "2.0", endFlow: "", rotameter: "FR4A40BNBN-NL-01", shiftDate: TODAY, status: "running", startAt: ago(3), endAt: "", audit: [] }
    ], deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
  };
}
const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
async function boot(vp, uaOverride) {
  const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage(); page.ctx = ctx; page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "warning" && /v48\.19/.test(m.text())) page.errs.push(m.text()); });
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(uaOverride || VIEWPORTS[vp].ua);
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
const modalOf = (page, id) => page.evaluate(i => { const m = document.querySelector('.g19-modal[data-g19="' + i + '"]'); return m ? m.innerText : null; }, id);
const anyModal = page => page.evaluate(() => { const g = document.querySelector(".g19-modal"); if (g) return "g19:" + g.dataset.g19; if (document.getElementById("v488Modal")) return "v488"; const v = document.querySelector('.v483-modal[data-v483="laptop"]'); return v ? "v483laptop" : ""; });
/* answer every prompt the press brings up: g19 warnings -> yes, v48.8 flow deviation -> No. Returns the prompts seen. */
async function press(page, sel, opts) {
  opts = opts || {}; const seen = [];
  await page.click(sel); await sleep(250);
  for (let i = 0; i < 6; i++) {
    const m = await anyModal(page); if (!m) break; seen.push(m);
    if (opts.stopAt === m) return seen;
    if (m === "v488") await page.click("#v488No"); else if (m === "v483laptop") await page.click("#v483NudgeOk"); else await page.click("#g19Yes");
    await sleep(350);
  }
  await sleep(300); return seen;
}
const AWST = s => Date.parse(s + "+08:00");   /* a wall-clock time in Perth */
const setNow = (page, m) => page.evaluate(v => { if (v == null) delete window.__g19Now; else window.__g19Now = v; render(); }, m == null ? null : m);
const scrollTo = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (e) { e.scrollIntoView({ block: "center" }); } }, sel);

async function run(vp) {
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, `${vp}-${n}.png`) });
  const laptop = vp === "chromebook";
  const page = await boot(vp);
  check(`[${vp}] app is v48.19 with the guard constants (14 h warn, 5 min grace, 15 min late start, 0.5 dB)`, await page.evaluate(() => APP_VERSION === "48.19" && document.getElementById("appVersion").textContent === "v48.19" && document.title === "ENVSS Field v48.19"
    && v4819.STOP_LIMIT_H === 14 && v4819.STOP_LIMIT_MODE === "warn" && v4819.STOP_EDIT_GRACE_MIN === 5 && v4819.LATE_MANUAL_START_MIN === 15 && v4819.NOISE_DRIFT_DB === 0.5));
  check(`[${vp}] test operator is admin`, await page.evaluate(() => isAdmin()));

  /* 1. laptop START warning (confirm, not a block) + office approval flag */
  await open(page, "h6");
  await page.click("#btnStart"); await sleep(250);
  let m = await modalOf(page, "laptop");
  if (laptop) {
    check(`[chromebook] (1) START on a Chromebook shows the 'Not at the pump?' warning first`, m && /You're on a Chromebook/.test(m) && (await T(page, "h6")).status === "prepped", m);
    await shot(page, "01-laptop-start-warning");
    await page.click("#g19No"); await sleep(200);
    check(`[chromebook] (1) Cancel: not started`, (await T(page, "h6")).status === "prepped");
    const seen = await press(page, "#btnStart");
    await sleep(1800);
    const t = await T(page, "h6");
    check(`[chromebook] (1) 'Press START anyway' starts it, flags needs office approval, no second reminder`, t.status === "running" && t.needsOfficeApproval === true && !seen.includes("v483laptop") && !(await anyModal(page)), JSON.stringify({ seen, f: t.needsOfficeApproval, s: t.status }));
    await page.click("#btnStop"); await sleep(250);
    m = await modalOf(page, "laptop");
    check(`[chromebook] (1) STOP on a Chromebook shows the same warning (still running until confirmed)`, m && /STOP/.test(m) && (await T(page, "h6")).status === "running", m);
    await shot(page, "01b-laptop-stop-warning");
    await page.click("#g19No"); await sleep(200);
  } else {
    check(`[pixel7] (1) START on a phone: no laptop warning`, !m);
    await sleep(500);
    const t = await T(page, "h6");
    check(`[pixel7] (1) phone START runs straight away, not flagged`, t.status === "running" && !t.needsOfficeApproval, JSON.stringify(t.status));
  }

  /* 2. STOP more than 14 h after START */
  await open(page, "h2");
  await page.click("#btnStop"); await sleep(250);
  m = await modalOf(page, "long");
  check(`[${vp}] (2) STOP 15 h after START warns first (still running)`, m && /15\.0 h/.test(m) && (await T(page, "h2")).status === "running", m);
  await shot(page, "02-stop-over-14h-warning");
  await page.click("#g19No"); await sleep(200);
  check(`[${vp}] (2) Cancel leaves it running`, (await T(page, "h2")).status === "running");
  let seen = await press(page, "#btnStop");
  let t = await T(page, "h2");
  check(`[${vp}] (2) Stop anyway -> ${laptop ? "laptop warning -> " : ""}v48.8 flow question -> stopped, confirmation in audit`, t.status === "ended" && t.audit.some(a => /more than 14 h after START — confirmed/.test(a.action)) && seen[0] === "g19:long" && seen.includes("v488") && (laptop ? seen.includes("g19:laptop") : !seen.includes("g19:laptop")), JSON.stringify(seen));

  /* 6. 5-minute grace after STOP, then a reason */
  const g0 = await page.evaluate(() => ({ banner: (document.getElementById("g19Ended") || {}).innerText || "", lock: document.getElementById("location").hasAttribute("data-g19lock"), ro: document.getElementById("location").readOnly }));
  check(`[${vp}] (6) just stopped: 'fix typos without a reason until …', Location not locked`, /Just stopped/.test(g0.banner) && /5 min after STOP/.test(g0.banner) && !g0.lock && !g0.ro, JSON.stringify(g0));
  await scrollTo(page, "#g19Ended"); await page.evaluate(() => window.scrollBy(0, -60)); await shot(page, "03-grace-after-stop");
  await page.evaluate(() => { const l = document.getElementById("location"); l.value = "Bay 2 north"; l.dispatchEvent(new Event("change", { bubbles: true })); l.blur(); }); await sleep(300);
  check(`[${vp}] (6) typo fixed in the grace window with no prompt`, (await T(page, "h2")).location === "Bay 2 north" && !(await anyModal(page)));
  await page.evaluate(() => { const t = db.trains.find(x => x.id === "h2"); t.endAt = new Date(Date.now() - 6 * 60e3).toISOString(); persist(); });
  await open(page, "h3"); await open(page, "h2");
  const g1 = await page.evaluate(() => ({ banner: (document.getElementById("g19Ended") || {}).innerText || "", ro: document.getElementById("location").readOnly }));
  check(`[${vp}] (6) after 5 minutes the stopped sample locks`, /answers are locked/.test(g1.banner) && g1.ro, JSON.stringify(g1));
  await page.click("#location"); await sleep(250);
  m = await modalOf(page, "edit");
  check(`[${vp}] (6) tapping a filled box asks 'Why change a stopped sample?'`, m && /Why change a stopped sample/.test(m) && /location/i.test(m), m);
  await shot(page, "04-reason-to-change-stopped");
  await page.click("#g19Yes"); await sleep(150);
  check(`[${vp}] (6) a reason is required`, /Pick a reason/.test(await page.evaluate(() => document.getElementById("g19Err").textContent)));
  await page.evaluate(() => { document.querySelector('input[name="g19r"][value="typo"]').checked = true; document.getElementById("g19rText").value = "wrong bay"; });
  await page.click("#g19Yes"); await sleep(400);
  await page.evaluate(() => { const l = document.getElementById("location"); l.value = "Bay 2 south"; l.dispatchEvent(new Event("change", { bubbles: true })); l.blur(); }); await sleep(300);
  t = await T(page, "h2");
  check(`[${vp}] (6) with a reason it unlocks, saves and audits the reason`, t.location === "Bay 2 south" && t.audit.some(a => a.action === "Edit after STOP unlocked" && a.g19edit && a.g19edit.reason === "typo"), JSON.stringify(t.audit.slice(-2)));
  await open(page, "h3");
  await page.click('[data-yn="reject"][data-val="yes"]'); await sleep(250);
  check(`[${vp}] (6) changing an answered Yes / No on an older stopped sample asks first`, !!(await modalOf(page, "edit")) && (await T(page, "h3")).rejectAsked === "no");
  await page.click("#g19No"); await sleep(200);

  /* 10. rotameter pick-list (hygiene, value not in the list kept) */
  const r3 = await page.evaluate(() => { const s = document.getElementById("g19RotaSel"); return s ? { v: s.value, first: s.options[1].text, hidden: (document.getElementById("rotameter").closest(".combo") || document.getElementById("rotameter")).style.display } : null; });
  check(`[${vp}] (10) hygiene rotameter is a pick-list; an old value not in the list is kept and labelled`, r3 && r3.v === "OLD-ROTA-9" && /not in the list/.test(r3.first) && r3.hidden === "none", JSON.stringify(r3));
  await open(page, "h7");
  const r7 = await page.evaluate(() => { const s = document.getElementById("g19RotaSel"); return s ? [...s.options].map(o => o.value) : null; });
  check(`[${vp}] (10) list = Podio rotameters + ones used before (23555270), no free text`, r7 && r7.includes("FR4A40BNBN-NL-02") && r7.includes("4435") && r7.includes("23555270"), JSON.stringify(r7));
  await page.select("#g19RotaSel", "4435"); await sleep(300);
  check(`[${vp}] (10) picking a rotameter saves it`, (await T(page, "h7")).rotameter === "4435");
  await scrollTo(page, "#g19RotaSel"); await shot(page, "05-rotameter-picklist");

  /* 8. late manual start needs a comment */
  await page.evaluate(() => v483.openTimeDialog(db.trains.find(x => x.id === "h7"), "start")); await sleep(200);
  const st60 = new Date(Date.now() - 60 * 60e3);
  await page.evaluate((d, tm) => { document.getElementById("v483d-start").value = d; document.getElementById("v483t-start").value = tm; }, PF.format(st60), perthHM(st60));
  await page.click("#v483Save"); await sleep(250);
  const lateErr = await page.evaluate(() => [document.getElementById("v483Err").textContent, (document.getElementById("v483rHint") || {}).textContent]);
  check(`[${vp}] (8) until 3 Dec: manual start typed an hour late asks for a comment, says it is required from 4 December 2026 (not saved yet)`, /Add a comment saying why START wasn't pressed/.test(lateErr[0]) && /From 4 December 2026 the comment will be required/.test(lateErr[0]) && /asked/.test(lateErr[1]) && !(await T(page, "h7")).startAt, JSON.stringify(lateErr));
  await shot(page, "06-late-manual-start-comment-warning");
  /* from 4 Dec: Save again is refused */
  await setNow(page, AWST("2026-12-04T00:00:05"));
  await page.evaluate(() => { document.querySelector('.v483-modal[data-v483="time"]').dataset.g19lateWarned = ""; });
  await page.click("#v483Save"); await sleep(250); await page.click("#v483Save"); await sleep(250);
  const lateReq = await page.evaluate(() => [document.getElementById("v483Err").textContent, (document.getElementById("v483rHint") || {}).textContent]);
  check(`[${vp}] (8) from 4 Dec 2026 00:00 AWST the comment is required (Save twice still refused)`, /required/.test(lateReq[1]) && !/Press Save again/.test(lateReq[0]) && !(await T(page, "h7")).startAt, JSON.stringify(lateReq));
  await shot(page, "06b-late-manual-start-comment-required");
  await setNow(page, AWST("2026-12-03T23:59:30"));
  check(`[${vp}] (8) 3 Dec 23:59 AWST is still the warning`, await page.evaluate(() => !v4819.lateBlocks()));
  await setNow(page, null);
  await page.type("#v483rText", "Phone was flat at the pump"); await page.click("#v483Save"); await sleep(400);
  t = await T(page, "h7");
  check(`[${vp}] (8) with the comment it saves as a manual time`, !!t.startAt && t.audit.some(a => a.te && a.te.manual && a.te.reasonText === "Phone was flat at the pump"), JSON.stringify(t.audit.slice(-1)));
  await open(page, "h8");
  await page.evaluate(() => v483.openTimeDialog(db.trains.find(x => x.id === "h8"), "start")); await sleep(200);
  const st5 = new Date(Date.now() - 5 * 60e3);
  await page.evaluate((d, tm) => { document.getElementById("v483d-start").value = d; document.getElementById("v483t-start").value = tm; }, PF.format(st5), perthHM(st5));
  await page.click("#v483Save"); await sleep(400);
  check(`[${vp}] (8) a manual start within 15 min needs no comment`, !!(await T(page, "h8")).startAt);
  await open(page, "h6");
  await page.evaluate(() => { const t = db.trains.find(x => x.id === "h6"); t.startAt = ""; t.endAt = ""; t.status = "prepped"; t.audit = []; t.needsOfficeApproval = false; persist(); render(); }); await sleep(200);
  await page.evaluate(() => v483.openTimeDialog(db.trains.find(x => x.id === "h6"), "start")); await sleep(200);
  await page.evaluate((d, tm) => { document.getElementById("v483d-start").value = d; document.getElementById("v483t-start").value = tm; }, PF.format(st60), perthHM(st60));
  await page.click("#v483Save"); await sleep(250); await page.click("#v483Save"); await sleep(400);
  t = await T(page, "h6");
  check(`[${vp}] (8) until 3 Dec: Save again carries on without a comment, noted in the audit trail`, !!t.startAt && t.audit.some(a => /Late manual start saved without a comment — confirmed/.test(a.action) && a.g19latenc >= 59), JSON.stringify(t.audit.map(a => a.action)));

  /* 2b. typed times 14-24 h apart */
  await open(page, "h6");
  await page.evaluate(() => { const t = db.trains.find(x => x.id === "h6"); t.startAt = ""; t.status = "prepped"; t.audit = []; t.needsOfficeApproval = false; persist(); render(); });
  await page.evaluate(() => v483.openTimeDialog(db.trains.find(x => x.id === "h6"), "both")); await sleep(200);
  await page.evaluate(d => { document.getElementById("v483d-start").value = d; document.getElementById("v483t-start").value = "06:00"; document.getElementById("v483d-stop").value = d; document.getElementById("v483t-stop").value = "21:30"; document.getElementById("v483rText").value = "From the paper sheet, shift log"; }, YDAY);
  await page.click("#v483Save"); await sleep(250);
  m = await modalOf(page, "long");
  check(`[${vp}] (2) typed times 15.5 h apart warn before saving`, m && /15\.5 h/.test(m) && !(await T(page, "h6")).startAt, m);
  await shot(page, "07-typed-times-over-14h");
  await page.click("#g19Yes"); await sleep(500);
  t = await T(page, "h6");
  check(`[${vp}] (2) Save anyway saves both times with the confirmation`, !!t.startAt && !!t.endAt && t.audit.some(a => /more than 14 h apart — confirmed/.test(a.action)), JSON.stringify(t.audit.map(a => a.action)));

  /* 3. head already running */
  await open(page, "h1");
  const hr = await page.evaluate(() => (document.getElementById("g19HeadRun") || {}).textContent || "");
  check(`[${vp}] (3) inline: head IESS01 already running on 0019920-001`, /Sample head IESS01 is already running on/.test(hr) && /0019920-001/.test(hr), hr);
  await page.click("#btnStart"); await sleep(250);
  m = await modalOf(page, "head");
  check(`[${vp}] (3) START asks 'Start anyway?'`, m && /already running/.test(m) && (await T(page, "h1")).status === "prepped", m);
  await shot(page, "08-head-already-running");
  await page.click("#g19No"); await sleep(200);
  seen = await press(page, "#btnStart");
  t = await T(page, "h1");
  check(`[${vp}] (3) Start anyway starts it and logs it`, t.status === "running" && t.audit.some(a => /head already running — confirmed/.test(a.action)), JSON.stringify(seen));

  /* 4. company suggestions; a new company accepted as typed */
  await open(page, "h4");
  await page.click("#company"); await sleep(200);
  const sug = await page.evaluate(() => [...document.querySelectorAll("#sug-company [data-v]")].map(d => d.textContent));
  check(`[${vp}] (4) suggestions: project client first, then companies used before; duplicates by case / spaces merged; a near-duplicate is tagged 'check spelling'`, /Acme Mining\s*project client/.test(sug[0] || "") && sug.some(s => /BHP Contractors/.test(s)) && sug.some(s => /^Downer/.test(s)) && sug.filter(s => /^black cat syndicate/i.test(s)).length === 1 && sug.some(s => /^Black Cate Syndicate\s*check spelling: also “Black Cat Syndicate”/.test(s)), JSON.stringify(sug));
  await page.type("#company", "Dow"); await sleep(200);
  await shot(page, "09-company-suggestions");
  await page.evaluate(() => { const d = document.querySelector('#sug-company [data-v="Downer"]'); d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); }); await sleep(300);
  check(`[${vp}] (4) picking a suggestion saves it`, (await T(page, "h4")).person.company === "Downer");
  await page.evaluate(() => { const c = document.getElementById("company"); c.value = ""; c.focus(); }); await page.type("#company", "Newco Scaffolding"); await sleep(200);
  const newLine = await page.evaluate(() => (document.querySelector("#sug-company .g19-new") || {}).textContent || "");
  await shot(page, "10-company-new-as-typed");
  await page.evaluate(() => document.getElementById("company").blur()); await sleep(300);
  check(`[${vp}] (4) a new company is accepted exactly as typed (no Other step)`, (await T(page, "h4")).person.company === "Newco Scaffolding" && /saved as typed/.test(newLine), newLine);
  await open(page, "o1"); await page.click("#company"); await page.evaluate(() => { const c = document.getElementById("company"); c.value = ""; }); await page.type("#company", "newco"); await sleep(200);
  const sug2 = await page.evaluate(() => [...document.querySelectorAll("#sug-company [data-v]")].map(d => d.dataset.v));
  check(`[${vp}] (4) next time the new company is in the list`, sug2.includes("Newco Scaffolding"), JSON.stringify(sug2));
  await page.evaluate(() => { const c = document.getElementById("company"); c.value = ""; c.focus(); }); await page.type("#company", "Black Cate Syndicate"); await sleep(600);
  let dym = await page.evaluate(() => (document.getElementById("g19Dym") || {}).textContent || "");
  check(`[${vp}] (4) typing 'Black Cate Syndicate': 'Did you mean Black Cat Syndicate?'`, /Did you mean Black Cat Syndicate\?/.test(dym) && /spelling/.test(dym), dym);
  await page.evaluate(() => document.getElementById("company").blur()); await sleep(400);
  await scrollTo(page, "#company"); await shot(page, "09b-company-did-you-mean");
  await page.evaluate(() => document.querySelector("#g19Dym [data-g19dym]").click()); await sleep(300);
  check(`[${vp}] (4) tapping the suggestion uses it`, (await T(page, "o1")).person.company === "Black Cat Syndicate");
  await page.evaluate(() => { const c = document.getElementById("company"); c.value = ""; c.focus(); }); await page.type("#company", "Mac"); await page.evaluate(() => document.getElementById("company").blur()); await sleep(600);
  dym = await page.evaluate(() => (document.getElementById("g19Dym") || {}).textContent || "");
  check(`[${vp}] (4) 'Mac': 'Did you mean MacMahon?' (short form)`, /Did you mean MacMahon\?/.test(dym), dym);
  await page.evaluate(() => document.getElementById("g19DymKeep").click()); await sleep(200);
  check(`[${vp}] (4) 'Keep' leaves it exactly as typed and hides the prompt`, (await T(page, "o1")).person.company === "Mac" && !(await page.evaluate(() => !!document.getElementById("g19Dym"))));
  const near = await page.evaluate(() => [v4819.nearWhy("Macmahon", "MacMahon"), v4819.nearWhy("Black Cat Syndicate", "black cat  syndicate "), v4819.nearWhy("Black Cate Syndicate", "Black Cat Syndicate"), v4819.nearWhy("Downer", "Acme Mining"), v4819.nearWhy("BHP", "BMD")].join(","));
  check(`[${vp}] (4) near-duplicate rules: case, spacing, spelling; unrelated names are not flagged`, near === "case,case,spelling,,", near);
  /* 4b. capitalisation (John 27 Nov 2026): suggest Proper Case on blur, accept or keep; never rewrite stored data */
  const setType = async (sel, v) => { await page.evaluate(s => { const c = document.querySelector(s); c.value = ""; c.focus(); }, sel); await page.type(sel, v); await page.evaluate(s => document.querySelector(s).blur(), sel); await sleep(500); };
  const capOf = id => page.evaluate(i => (document.getElementById("g19Case-" + i) || {}).textContent || "", id);
  await setType("#first", "lee");
  let cap = await capOf("first");
  check(`[${vp}] (4b) first name 'lee' on blur: 'use Lee?' (all lower case)`, /all lower case/.test(cap) && /use Lee\?/.test(cap), cap);
  await setType("#last", "MCDONALD-O'BRIEN");
  cap = await capOf("last");
  check(`[${vp}] (4b) last name 'MCDONALD-O'BRIEN': 'use McDonald-O'Brien?' (ALL CAPS, Mc / O' / hyphen)`, /ALL CAPS/.test(cap) && /use McDonald-O'Brien\?/.test(cap), cap);
  await scrollTo(page, "#first"); await shot(page, "16-name-capitalisation");
  await page.evaluate(() => document.querySelector("#g19Case-last [data-g19case]").click()); await sleep(300);
  await page.evaluate(() => document.querySelector("#g19Case-first [data-g19keep]").click()); await sleep(300);
  t = await T(page, "o1");
  check(`[${vp}] (4b) 'use' applies McDonald-O'Brien; 'Keep' leaves 'lee' exactly as typed`, t.person.last === "McDonald-O'Brien" && t.person.first === "lee" && !(await capOf("first")) && !(await capOf("last")), JSON.stringify(t.person));
  await setType("#first", "jOHN");
  check(`[${vp}] (4b) mixed-up caps 'jOHN' -> John`, /mixed/.test(await capOf("first")) && /use John\?/.test(await capOf("first")));
  await setType("#first", "Jan van der Berg");
  check(`[${vp}] (4b) a properly cased name (with van der) is not flagged`, !(await capOf("first")));
  await setType("#company", "zeta drilling pty ltd");
  cap = await capOf("company");
  check(`[${vp}] (4b) company 'zeta drilling pty ltd' -> 'Zeta Drilling Pty Ltd'`, /use Zeta Drilling Pty Ltd\?/.test(cap), cap);
  await scrollTo(page, "#company"); await shot(page, "17-company-capitalisation");
  await setType("#company", "newco scaffolding");
  check(`[${vp}] (4b) a company already used with other caps gets 'Did you mean Newco Scaffolding?' instead (no double prompt)`, /Did you mean Newco Scaffolding\?/.test(await page.evaluate(() => (document.getElementById("g19Dym") || {}).textContent || "")) && !(await capOf("company")));
  const cr = await page.evaluate(() => [["BHP", "company"], ["JBS&G", "company"], ["BHP Contractors", "company"], ["WA LIMESTONE", "company"], ["MacMahon", "person"], ["O'Brien", "person"]].map(([v, k]) => v + "=" + (v4819.caseIssue(v, k) ? v4819.properCase(v, k) : "ok")).join(", "));
  check(`[${vp}] (4b) acronyms and correct names are left alone; ALL CAPS company keeps state codes`, cr === "BHP=ok, JBS&G=ok, BHP Contractors=ok, WA LIMESTONE=WA Limestone, MacMahon=ok, O'Brien=ok", cr);
  await page.evaluate(() => { const x = db.trains.find(y => y.id === "o1"); x.person.first = "Lee"; x.person.last = "Other"; persist(); }); await open(page, "o1");
  const cw = await page.evaluate(() => { const extra = ["x1", "x2", "x3"].map(id => ({ id, eventId: "eO", person: { company: "Acme Minning" }, audit: [] })); db.trains.push(...extra);
    const r = { typo: v4819.didYouMean("Acme Minning").map(h => h.name), client: v4819.didYouMean("Acme Mining").map(h => h.name), swap: v4819.nearWhy("Aztech Servcies", "AZTech Services"), far: [v4819.nearWhy("Fred Young", "Greg Young"), v4819.nearWhy("Eastern Metropolitan Regional Council", "Western Metropolitan Regional Council"), v4819.nearWhy("SLH Industries", "Sun Industries")].join("") };
    db.trains = db.trains.filter(x => !/^x\d$/.test(x.id)); return r; });
  check(`[${vp}] (4) the project client's spelling wins over a more common typo; swapped letters count; different names are not flagged`, cw.typo[0] === "Acme Mining" && !cw.client.length && cw.swap === "spelling" && cw.far === "", JSON.stringify(cw));
  await page.evaluate(() => { const c = document.getElementById("company"); c.value = "BHP Contractors"; c.blur(); }); await sleep(200);
  await open(page, "o6");
  dym = await page.evaluate(() => (document.getElementById("g19Dym") || {}).textContent || "");
  check(`[${vp}] (4) a stored typo is flagged on the sample but not rewritten`, /Did you mean Black Cat Syndicate\?/.test(dym) && (await T(page, "o6")).person.company === "Black Cate Syndicate" && !(await T(page, "o6")).audit.length, dym);

  /* 5. noise: no calibration = warn + confirm until 30 Nov, blocked from 1 Dec 2026 AWST; drift > 0.5 dB = warn and confirm */
  await open(page, "n2");
  const nd = page.dialogs.length;
  const cg = await page.evaluate(() => { const g = document.getElementById("g19CalGate"); return { gap: startGaps(db.trains.find(x => x.id === "n2")).some(s => /Start-of-day calibration/.test(s)), txt: g ? g.textContent : "", mode: g ? g.dataset.mode : "" }; });
  check(`[${vp}] (5) until 30 Nov: no calibration is a notice (not a START gap) saying dose badges can't start from 1 December 2026`, !cg.gap && cg.mode === "warn" && /From 1 December 2026, a dose badge without a pre-start calibration won't be able to start/.test(cg.txt), JSON.stringify(cg));
  await scrollTo(page, "#btnStart"); await shot(page, "11-noise-no-calibration-notice");
  await page.click("#btnStart"); await sleep(300);
  m = await modalOf(page, "nocal");
  check(`[${vp}] (5) START asks to confirm (still prepped), same 1 December 2026 message`, m && /From 1 December 2026, a dose badge without a pre-start calibration won't be able to start/.test(m) && (await T(page, "n2")).status === "prepped", m);
  await shot(page, "11b-noise-no-calibration-warning");
  await page.click("#g19No"); await sleep(300);
  check(`[${vp}] (5) 'Record calibration': not started`, (await T(page, "n2")).status === "prepped");
  /* the switch: 30 Nov 23:59 AWST still warns; 1 Dec 00:00 AWST blocks */
  await setNow(page, AWST("2026-11-30T23:59:30"));
  check(`[${vp}] (5) 30 Nov 23:59:30 AWST: still the warning`, await page.evaluate(() => !v4819.calBlocks() && !startGaps(db.trains.find(x => x.id === "n2")).some(s => /calibration/.test(s))));
  await setNow(page, AWST("2026-12-01T00:00:10")); await open(page, "n2");
  const cb = await page.evaluate(() => ({ gap: startGaps(db.trains.find(x => x.id === "n2")).some(s => /Start-of-day calibration/.test(s)), mode: (document.getElementById("g19CalGate") || {}).dataset ? document.getElementById("g19CalGate").dataset.mode : "" }));
  check(`[${vp}] (5) from 1 Dec 2026 00:00 AWST: START gap + 'START is locked' notice`, cb.gap && cb.mode === "block", JSON.stringify(cb));
  await scrollTo(page, "#btnStart"); await shot(page, "11c-noise-no-calibration-blocked");
  await page.click("#btnStart"); await sleep(400);
  check(`[${vp}] (5) from 1 Dec: START refused, calibration listed`, (await T(page, "n2")).status === "prepped" && page.dialogs.slice(nd).some(d => /Start-of-day calibration/.test(d)), JSON.stringify(page.dialogs.slice(nd)));
  await page.evaluate(() => document.querySelectorAll(".g19-modal").forEach(m => m.remove()));
  await setNow(page, null); await open(page, "n2");
  seen = await press(page, "#btnStart");
  t = await T(page, "n2");
  check(`[${vp}] (5) until 30 Nov: 'Start anyway' starts it and logs it`, t.status === "running" && t.audit.some(a => /START with no start-of-day calibration — confirmed/.test(a.action) && a.g19nocal), JSON.stringify(seen));
  await open(page, "n1");
  const dr = await page.evaluate(() => (document.getElementById("g19CalDrift") || {}).textContent || "");
  check(`[${vp}] (5) calibration 0.8 dB off: inline warning`, /off by 0\.8 dB/.test(dr), dr);
  await page.click("#btnStart"); await sleep(250);
  m = await modalOf(page, "drift");
  check(`[${vp}] (5) START asks to confirm the drift (not a block)`, m && /off by 0\.8 dB/.test(m) && (await T(page, "n1")).status === "prepped", m);
  await shot(page, "12-noise-calibration-drift");
  await page.click("#g19No"); await sleep(200);
  check(`[${vp}] (5) Cancel: not started`, (await T(page, "n1")).status === "prepped");
  seen = await press(page, "#btnStart");
  t = await T(page, "n1");
  check(`[${vp}] (5) Start anyway: running, logged`, t.status === "running" && t.audit.some(a => /calibration over ±0\.5 dB — confirmed/.test(a.action)), JSON.stringify(seen));

  /* 3b. AFM cowl already running; AFM rotameter pick-list; AFM blank keeps no rotameter */
  await open(page, "f1");
  const hf = await page.evaluate(() => (document.getElementById("g19HeadRun") || {}).textContent || "");
  check(`[${vp}] (3) AFM: cowl 13469 already running on 0019920-AFM-006`, /Cowl 13469 is already running/.test(hf) && /0019920-AFM-006/.test(hf), hf);
  await page.evaluate(() => openEvent("eF")); await sleep(400);
  const er = await page.evaluate(() => { const s = document.getElementById("g19EvRotaSel"); return s ? { v: s.value, n: s.options.length, inputHidden: document.getElementById("eventRota").style.display } : null; });
  check(`[${vp}] (10) AFM event rotameter is a pick-list`, er && er.v === "FR4A40BNBN-NL-01" && er.n > 10 && er.inputHidden === "none", JSON.stringify(er));
  await page.select("#g19EvRotaSel", "FR4A40BNBN-NL-02"); await sleep(400);
  const afm = await page.evaluate(() => ({ ev: eventById("eF").rotameter, f1: db.trains.find(x => x.id === "f1").rotameter, f0: db.trains.find(x => x.id === "f0").rotameter }));
  check(`[${vp}] (10) picking the AFM event rotameter copies it to samples, the field blank keeps none`, afm.ev === "FR4A40BNBN-NL-02" && afm.f1 === "FR4A40BNBN-NL-02" && !afm.f0, JSON.stringify(afm));
  await scrollTo(page, "#g19EvRotaSel"); await shot(page, "13-afm-event-rotameter-picklist");
  await page.evaluate(() => openNewEvent("p19")); await sleep(300);
  check(`[${vp}] (10) new-event form rotameter is a pick-list`, await page.evaluate(() => !!document.getElementById("g19NewRotaSel")));

  /* 9. Location missing: notify the sampler (sample + event screens), Mark complete / COC confirm, not a block */
  check(`[${vp}] (9) Location is not a required answer (it would block complete)`, await page.evaluate(() => !answerGaps(db.trains.find(x => x.id === "l1")).some(g => g.key === "location")));
  await page.evaluate(() => openEvent("eL")); await sleep(400);
  const evl = await page.evaluate(() => ({ line: (document.getElementById("g19EvLoc") || {}).textContent || "", chips: [...document.querySelectorAll(".g19-chip-loc")].length }));
  check(`[${vp}] (9) event screen: '1 sample has no location: Sample 1' + chip on the row`, /1 sample has no location/.test(evl.line) && evl.chips === 1, JSON.stringify(evl));
  await shot(page, "14c-location-missing-event");
  await page.evaluate(() => { markEventUpload("eL"); }); await sleep(300);
  m = await modalOf(page, "locgate");
  check(`[${vp}] (9) Mark event complete: warning lists sample 1 (no location), not the blank or sample 2, and can be confirmed`, m && /Location missing/.test(m) && /1 sample has no location/.test(m) && /Ann Nolocation/.test(m) && !/Sample 2/.test(m) && /Mark the event complete anyway/.test(m) && /Go back/.test(m), m);
  await shot(page, "14-location-missing-complete");
  await page.click("#g19No"); await sleep(250);
  check(`[${vp}] (9) Go back: event not marked complete`, await page.evaluate(() => !eventById("eL").uploadReady));
  await page.evaluate(() => { view.eventId = "eL"; createCoc(); }); await sleep(300);
  m = await modalOf(page, "locgate");
  check(`[${vp}] (9) Create COC shows the same warning`, m && /no location/.test(m) && /Create the COC anyway/.test(m), m);
  await page.evaluate(() => document.querySelector("[data-g19open]").click()); await sleep(500);
  const onL1 = await page.evaluate(() => view.page === "train" && view.trainId === "l1");
  const lm = await page.evaluate(() => (document.getElementById("g19LocMiss") || {}).textContent || "");
  check(`[${vp}] (9) the link opens the sample, which shows 'Location missing'`, onL1 && /Location missing/.test(lm), lm);
  await scrollTo(page, "#location"); await shot(page, "14b-location-missing-sample");
  /* carry on anyway: a second event-level check with a temporary sample, then remove it */
  await page.evaluate(() => openEvent("eL")); await sleep(300);
  await page.evaluate(() => { markEventUpload("eL"); }); await sleep(300);
  await page.click("#g19Yes"); await sleep(600);
  const anyway = await page.evaluate(() => ({ ready: !!eventById("eL").uploadReady, a: db.trains.find(x => x.id === "l1").audit.filter(a => a.g19noloc).map(a => a.g19noloc) }));
  check(`[${vp}] (9) 'Mark the event complete anyway' marks it, notes it on the sample, and 'Create COC now?' does not ask twice`, anyway.ready && anyway.a[0] === "complete" && !(await modalOf(page, "locgate")), JSON.stringify(anyway));
  await page.evaluate(() => { document.querySelectorAll(".v483-modal, .g19-modal, #cocTatModal").forEach(m => m.remove()); eventById("eL").uploadReady = false; persist(); });
  await open(page, "l1");
  await page.evaluate(() => { const l = document.getElementById("location"); l.value = "Pottery room"; l.dispatchEvent(new Event("input", { bubbles: true })); l.dispatchEvent(new Event("change", { bubbles: true })); l.blur(); }); await sleep(300);
  check(`[${vp}] (9) an empty Location on a stopped sample can be filled with no reason; the notice goes`, (await T(page, "l1")).location === "Pottery room" && !(await modalOf(page, "edit")) && await page.evaluate(() => { const m = document.getElementById("g19LocMiss"); return !m || m.style.display === "none"; }));
  await page.evaluate(() => openEvent("eL")); await sleep(300);
  await page.evaluate(() => { markEventUpload("eL"); }); await sleep(300);
  check(`[${vp}] (9) with locations in, no warning and no event notice`, !(await modalOf(page, "locgate")) && !(await page.evaluate(() => !!document.getElementById("g19EvLoc"))));
  await page.evaluate(() => document.querySelectorAll(".v483-modal, .g19-modal, #cocTatModal").forEach(m => m.remove()));

  /* 7. admin approval (Chromebook presses) */
  if (laptop) {
    await open(page, "h1");
    const card = await page.evaluate(() => (document.getElementById("g19Approve") || {}).innerText || "");
    check(`[chromebook] (7) admin sees 'Needs office approval' with the Chromebook press`, /Needs office approval/.test(card) && /START pressed on a Chromebook/.test(card), card);
    await scrollTo(page, "#g19Approve"); await shot(page, "15-office-approval-card");
    await page.evaluate(() => openEvent("eH")); await sleep(400);
    const ev = await page.evaluate(() => ({ chip: document.querySelectorAll(".g19-chip").length, line: (document.getElementById("g19EvAppr") || {}).textContent || "" }));
    check(`[chromebook] (7) event list shows chips and a count`, ev.chip >= 2 && /need(s)? office approval/.test(ev.line), JSON.stringify(ev));
    /* staff (not admin) see the flag too, without the Approve button */
    await page.evaluate(() => { window.__adm = ENVSS_CONFIG.admins; ENVSS_CONFIG.admins = []; }); await open(page, "h1"); await sleep(300);
    const staff = await page.evaluate(() => ({ card: (document.getElementById("g19ApprStaff") || {}).innerText || "", admin: !!document.getElementById("g19Approve"), btn: !!document.getElementById("g19ApproveBtn") }));
    check(`[chromebook] (7) staff see 'Flagged to the office' and are told to correct the time on their phone; no Approve button`, /Flagged to the office/.test(staff.card) && /on your phone/.test(staff.card) && /START pressed on a Chromebook/.test(staff.card) && !staff.admin && !staff.btn, JSON.stringify(staff));
    await scrollTo(page, "#g19ApprStaff"); await shot(page, "15b-office-flag-staff");
    await page.evaluate(() => openEvent("eH")); await sleep(400);
    const sev = await page.evaluate(() => ({ chip: [...document.querySelectorAll(".g19-chip")].filter(c => /flagged to office/.test(c.textContent)).length, line: (document.getElementById("g19EvAppr") || {}).textContent || "" }));
    check(`[chromebook] (7) staff event list: 'flagged to office' chips + count with the phone hint`, sev.chip >= 2 && /correct it on your phone/.test(sev.line), JSON.stringify(sev));
    await page.evaluate(() => { ENVSS_CONFIG.admins = window.__adm; });
    await open(page, "h1"); await sleep(300);
    const hit = await page.evaluate(() => { const b = document.getElementById("g19ApproveBtn"); if (!b) return "no button"; b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el === b ? "ok" : (el ? el.tagName + "#" + el.id + "." + el.className : "none"); });

    await page.click("#g19ApproveBtn"); await sleep(300);
    t = await T(page, "h1");
    check(`[chromebook] (7) Approve clears the flag and keeps who / when`, t.needsOfficeApproval === false && t.officeApproval && t.officeApproval.count >= 1, JSON.stringify({f: t.needsOfficeApproval, a: t.officeApproval, btn: await page.evaluate(() => !!document.getElementById("g19ApproveBtn"))}));
  } else {
    /* a laptop-flagged sample viewed on the phone: staff see it there (that is where they fix it) */
    await page.evaluate(() => { window.__adm = ENVSS_CONFIG.admins; ENVSS_CONFIG.admins = []; const x = db.trains.find(y => y.id === "o5"); x.needsOfficeApproval = true; render(); });
    await open(page, "o5"); await sleep(300);
    const ps = await page.evaluate(() => (document.getElementById("g19ApprStaff") || {}).innerText || "");
    check(`[pixel7] (7) staff on the phone see the office flag on a laptop-entered sample, told to use Edit time`, /Flagged to the office/.test(ps) && /use Edit time on this sample/.test(ps), ps);
    await scrollTo(page, "#g19ApprStaff"); await shot(page, "15b-office-flag-staff");
    await page.evaluate(() => { ENVSS_CONFIG.admins = window.__adm; const x = db.trains.find(y => y.id === "o5"); delete x.needsOfficeApproval; persist(); });
    check(`[pixel7] (7) phone presses are never flagged`, await page.evaluate(() => !db.trains.some(x => x.needsOfficeApproval)));
  }

  /* reload keeps it; untouched samples stay untouched */
  await page.reload({ waitUntil: "networkidle0" }); await sleep(900);
  const fin = await page.evaluate(() => ["h1", "h2", "h4", "h7", "l1", "n1"].map(i => { const x = db.trains.find(y => y.id === i); return [i, x.status, x.location || "", (x.person || {}).company || "", x.rotameter || ""].join(":"); }).join(" "));
  check(`[${vp}] reload keeps the saved values`, fin === "h1:running::Acme Mining:FR4A40BNBN-NL-02 h2:ended:Bay 2 south::FR4A40BNBN-NL-02 h4:prepped::Newco Scaffolding:FR4A40BNBN-NL-02 h7:running:Bay 7::4435 l1:ended:Pottery room:Acme Mining:FR4A40BNBN-NL-02 n1:running:Workshop:Acme Mining:", fin);
  const oth = await page.evaluate(() => JSON.stringify(["o2", "o3", "o4", "f9", "l2", "o6"].map(i => db.trains.find(x => x.id === i)).map(x => [x.status, x.audit.length, !!x.needsOfficeApproval, x.rotameter])));
  check(`[${vp}] other samples untouched`, oth === JSON.stringify([["ended", 0, false, "23555270"], ["ended", 0, false, "FR4A40BNBN-NL-02"], ["ended", 0, false, "FR4A40BNBN-NL-02"], ["running", 0, false, "FR4A40BNBN-NL-01"], ["ended", 0, false, "FR4A40BNBN-NL-02"], ["ended", 0, false, "FR4A40BNBN-NL-02"]]), oth);
  check(`[${vp}] no page errors`, !page.errs.length, page.errs.join(" | "));
  const unexpected = page.dialogs.filter(d => !/Cannot start until|Event marked complete/.test(d));   /* both existing prompts */
  check(`[${vp}] no unexpected native alerts`, !unexpected.length, unexpected.join(" | "));
  await page.close(); await page.ctx.close();
}
/* the laptop warning only exists on a laptop / Chromebook: also shoot it at phone width (a Chromebook window that narrow) */
async function narrowLaptop() {
  const page = await boot("pixel7", VIEWPORTS.chromebook.ua);
  await open(page, "h6"); await page.click("#btnStart"); await sleep(250);
  const m = await modalOf(page, "laptop");
  check(`[narrow Chromebook] (1) laptop warning fits at phone width`, m && /You're on a Chromebook/.test(m), m);
  await page.screenshot({ path: path.join(OUT, "pixel7-01-laptop-start-warning.png") });
  await page.click("#g19No"); await sleep(150);
  await open(page, "h2"); await page.click("#btnStop"); await sleep(250); await page.click("#g19Yes"); await sleep(250);
  check(`[narrow Chromebook] (1) STOP gets the laptop warning too (after the 14 h one)`, /Press STOP anyway/.test(await modalOf(page, "laptop") || ""));
  await page.screenshot({ path: path.join(OUT, "pixel7-01b-laptop-stop-warning.png") });
  await page.close(); await page.ctx.close();
}
/* deep link #event=…&sample=… : straight in when signed in; stashed across sign-in otherwise */
async function deepLink(vp) {
  const page = await boot(vp);
  await page.goto(url + "/field.html#event=eL&sample=l2", { waitUntil: "networkidle0" }); await sleep(1500);
  let st = await page.evaluate(() => ({ p: view.page, t: view.trainId, h: location.hash }));
  check(`[${vp} deep link] signed in: #event=eL&sample=l2 opens that sample and clears the hash`, st.p === "train" && st.t === "l2" && !st.h, JSON.stringify(st));
  await page.evaluateOnNewDocument(() => { try { if (sessionStorage.getItem("__signout") === "1") { sessionStorage.removeItem("__signout"); localStorage.removeItem("envss-field-auth-v45"); } } catch (e) {} });
  await page.evaluate(() => sessionStorage.setItem("__signout", "1"));
  await page.goto("about:blank");
  await page.goto(url + "/field.html#event=eH&sample=h3", { waitUntil: "networkidle0" }); await sleep(1200);
  const pre = await page.evaluate(k => ({ gate: !!document.getElementById("loginGate") && !document.getElementById("loginGate").classList.contains("hidden"), stash: sessionStorage.getItem(k) }), "envss-deeplink-v4819");
  check(`[${vp} deep link] signed out: sign-in screen, link kept in sessionStorage`, pre.gate && /"sample":"h3"/.test(pre.stash || ""), JSON.stringify(pre));
  await page.evaluate(SESSION);
  await page.goto("about:blank");
  await page.goto(url + "/field.html", { waitUntil: "networkidle0" }); await sleep(1800);   /* back from Google: no hash */
  st = await page.evaluate(k => ({ p: view.page, t: view.trainId, stash: sessionStorage.getItem(k) }), "envss-deeplink-v4819");
  check(`[${vp} deep link] after sign-in the stashed sample opens once`, st.p === "train" && st.t === "h3" && !st.stash, JSON.stringify(st));
  await page.evaluate(() => { location.hash = "#event=eF"; }); await sleep(1500);
  st = await page.evaluate(() => ({ p: view.page, e: view.eventId }));
  check(`[${vp} deep link] #event= only opens the event`, st.p === "event" && st.e === "eF", JSON.stringify(st));
  check(`[${vp} deep link] no page errors`, !page.errs.length, page.errs.join(" | "));
  await page.close(); await page.ctx.close();
}
/* sync counter: a deleted sample with an old silent "Not stated" (live: 21 such rows) must not show as "still uploading" */
async function counter(vp) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true);
  const store = { envss_trains: new Map(), envss_deletions: new Map() };
  for (let i = 1; i <= 21; i++) { const id = "dz" + i; store.envss_trains.set(id, { id, updated_at: "2026-11-02T08:43:15Z", payload: { id, eventId: "eGone", trainKind: "airborne_personal", status: "prepped", person: { first: "", last: "", sex: "not_stated" }, audit: [] } }); store.envss_deletions.set("d" + i, { id: "d" + i, payload: { id: "d" + i, trainId: id, at: "2026-11-02T08:43:15Z" } }); }
  const mlog = mockSupabase(page, store, {});
  const texts = [];
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" });   /* signed out, clean device */
  const t0 = Date.now(); while (Date.now() - t0 < 6000) { texts.push(await page.evaluate(() => [(document.getElementById("syncText") || {}).textContent || "", Object.keys(syncState.pending).length].join(" | ")).catch(() => "")); await sleep(50); }
  const st = await page.evaluate(() => ({ pending: Object.keys(syncState.pending).length, trains: db.trains.length, text: (document.getElementById("syncText") || {}).textContent }));
  check(`[${vp} counter] clean signed-out device: 21 deleted samples with an old 'Not stated' never show as 'still uploading'`, !texts.some(x => /still uploading/.test(x)) && st.pending === 0 && st.trains === 0 && /Everything uploaded/.test(st.text), JSON.stringify({ st, bad: texts.filter(x => /still uploading/.test(x)).slice(0, 2) }));
  check(`[${vp} counter] only reads were made`, !mlog.some(l => /^(POST|PATCH|DELETE) /.test(l)), mlog.filter(l => !/^GET|^OPTIONS/.test(l)).join(" | "));
  check(`[${vp} counter] no page errors`, !page.errs.length, page.errs.join(" | "));
  await ctx.close();
}
const vps = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of vps) { try { await run(vp); } catch (e) { check(`[${vp}] run completed`, false, e.stack); } }
for (const vp of vps) { try { await counter(vp); } catch (e) { check(`[${vp} counter] run completed`, false, e.stack); } }
for (const vp of vps) { try { await deepLink(vp); } catch (e) { check(`[${vp} deep link] run completed`, false, e.stack); } }
if (!process.argv[2] || process.argv[2] === "pixel7") { try { await narrowLaptop(); } catch (e) { check("[narrow Chromebook] run completed", false, e.stack); } }
check("no request left the box except the CDN libraries; every Supabase call was answered by the in-memory mock", !ext.length, ext.join("\n"));
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "test-results.json"), JSON.stringify({ passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results }, null, 1));
console.log(results.filter(r => r.ok).length + "/" + results.length + " passed");
await browser.close(); server.close();
process.exit(results.every(r => r.ok) ? 0 : 1);
