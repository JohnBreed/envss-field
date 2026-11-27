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
  check(`[${vp}] (8) manual start typed an hour late needs a comment (not saved yet)`, /Add a comment saying why START wasn't pressed/.test(lateErr[0]) && /required/.test(lateErr[1]) && !(await T(page, "h7")).startAt, JSON.stringify(lateErr));
  await shot(page, "06-late-manual-start-comment");
  await page.type("#v483rText", "Phone was flat at the pump"); await page.click("#v483Save"); await sleep(400);
  t = await T(page, "h7");
  check(`[${vp}] (8) with the comment it saves as a manual time`, !!t.startAt && t.audit.some(a => a.te && a.te.manual && a.te.reasonText === "Phone was flat at the pump"), JSON.stringify(t.audit.slice(-1)));
  await open(page, "h8");
  await page.evaluate(() => v483.openTimeDialog(db.trains.find(x => x.id === "h8"), "start")); await sleep(200);
  const st5 = new Date(Date.now() - 5 * 60e3);
  await page.evaluate((d, tm) => { document.getElementById("v483d-start").value = d; document.getElementById("v483t-start").value = tm; }, PF.format(st5), perthHM(st5));
  await page.click("#v483Save"); await sleep(400);
  check(`[${vp}] (8) a manual start within 15 min needs no comment`, !!(await T(page, "h8")).startAt);

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
  check(`[${vp}] (4) suggestions: project client first, then companies used before; duplicates by case / spaces merged`, /Acme Mining\s*project client/.test(sug[0] || "") && sug.some(s => /BHP Contractors/.test(s)) && sug.some(s => /^Downer/.test(s)) && sug.filter(s => /black cat/i.test(s)).length === 1, JSON.stringify(sug));
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
  await page.evaluate(() => { const c = document.getElementById("company"); c.value = "BHP Contractors"; c.blur(); }); await sleep(200);

  /* 5. noise: no calibration = blocked; drift > 0.5 dB = warn and confirm */
  await open(page, "n2");
  const nd = page.dialogs.length;
  check(`[${vp}] (5) no calibration today: START gap + notice`, await page.evaluate(() => startGaps(db.trains.find(x => x.id === "n2")).some(s => /Start-of-day calibration/.test(s)) && !!document.getElementById("g19CalGate")));
  await scrollTo(page, "#btnStart"); await shot(page, "11-noise-no-calibration");
  await page.click("#btnStart"); await sleep(300);
  check(`[${vp}] (5) START refused, calibration listed`, (await T(page, "n2")).status === "prepped" && page.dialogs.slice(nd).some(d => /Start-of-day calibration/.test(d)), JSON.stringify(page.dialogs.slice(nd)));
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

  /* 9. Location before complete / COC */
  check(`[${vp}] (9) a stopped sample with no location still has 'Location' to answer`, await page.evaluate(() => answerGaps(db.trains.find(x => x.id === "l1")).some(g => g.key === "location") && !answerGaps(db.trains.find(x => x.id === "l2")).some(g => g.key === "location")));
  await page.evaluate(() => openEvent("eL")); await sleep(300);
  await page.evaluate(() => markEventUpload("eL")); await sleep(300);
  m = await modalOf(page, "locgate");
  check(`[${vp}] (9) Mark event complete blocked: lists sample 1 (no location), not the blank or sample 2`, m && /1 sample has no location/.test(m) && /Ann Nolocation/.test(m) && !/Sample 2/.test(m), m);
  await shot(page, "14-location-needed-complete");
  await page.click("#g19Yes"); await sleep(150);
  await page.evaluate(() => { view.eventId = "eL"; createCoc(); }); await sleep(300);
  check(`[${vp}] (9) Create COC blocked the same way`, /no location/.test(await modalOf(page, "locgate") || ""));
  await page.evaluate(() => document.querySelector("[data-g19open]").click()); await sleep(500);
  const onL1 = await page.evaluate(() => view.page === "train" && view.trainId === "l1");
  await page.evaluate(() => { const l = document.getElementById("location"); l.value = "Pottery room"; l.dispatchEvent(new Event("change", { bubbles: true })); l.blur(); }); await sleep(300);
  check(`[${vp}] (9) 'open' goes to the sample; an empty Location on a stopped sample can be filled with no reason`, onL1 && (await T(page, "l1")).location === "Pottery room" && !(await modalOf(page, "edit")));
  await page.evaluate(() => openEvent("eL")); await sleep(200);
  await page.evaluate(() => markEventUpload("eL")); await sleep(300);
  check(`[${vp}] (9) with locations in, the location gate no longer stops it`, !(await modalOf(page, "locgate")));
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
    await open(page, "h1"); await sleep(300);
    const hit = await page.evaluate(() => { const b = document.getElementById("g19ApproveBtn"); if (!b) return "no button"; b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el === b ? "ok" : (el ? el.tagName + "#" + el.id + "." + el.className : "none"); });

    await page.click("#g19ApproveBtn"); await sleep(300);
    t = await T(page, "h1");
    check(`[chromebook] (7) Approve clears the flag and keeps who / when`, t.needsOfficeApproval === false && t.officeApproval && t.officeApproval.count >= 1, JSON.stringify({f: t.needsOfficeApproval, a: t.officeApproval, btn: await page.evaluate(() => !!document.getElementById("g19ApproveBtn"))}));
  } else {
    check(`[pixel7] (7) phone presses are never flagged`, await page.evaluate(() => !db.trains.some(x => x.needsOfficeApproval)));
  }

  /* reload keeps it; untouched samples stay untouched */
  await page.reload({ waitUntil: "networkidle0" }); await sleep(900);
  const fin = await page.evaluate(() => ["h1", "h2", "h4", "h7", "l1", "n1"].map(i => { const x = db.trains.find(y => y.id === i); return [i, x.status, x.location || "", (x.person || {}).company || "", x.rotameter || ""].join(":"); }).join(" "));
  check(`[${vp}] reload keeps the saved values`, fin === "h1:running::Acme Mining:FR4A40BNBN-NL-02 h2:ended:Bay 2 south::FR4A40BNBN-NL-02 h4:prepped::Newco Scaffolding:FR4A40BNBN-NL-02 h7:running:Bay 7::4435 l1:ended:Pottery room:Acme Mining:FR4A40BNBN-NL-02 n1:running:Workshop:Acme Mining:", fin);
  const oth = await page.evaluate(() => JSON.stringify(["o2", "o3", "o4", "f9", "l2"].map(i => db.trains.find(x => x.id === i)).map(x => [x.status, x.audit.length, !!x.needsOfficeApproval, x.rotameter])));
  check(`[${vp}] other samples untouched`, oth === JSON.stringify([["ended", 0, false, "23555270"], ["ended", 0, false, "FR4A40BNBN-NL-02"], ["ended", 0, false, "FR4A40BNBN-NL-02"], ["running", 0, false, "FR4A40BNBN-NL-01"], ["ended", 0, false, "FR4A40BNBN-NL-02"]]), oth);
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
const vps = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of vps) { try { await run(vp); } catch (e) { check(`[${vp}] run completed`, false, e.stack); } }
if (!process.argv[2] || process.argv[2] === "pixel7") { try { await narrowLaptop(); } catch (e) { check("[narrow Chromebook] run completed", false, e.stack); } }
check("no request left the box except the CDN libraries; every Supabase call was answered by the in-memory mock", !ext.length, ext.join("\n"));
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "test-results.json"), JSON.stringify({ passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results }, null, 1));
console.log(results.filter(r => r.ok).length + "/" + results.length + " passed");
await browser.close(); server.close();
process.exit(results.every(r => r.ok) ? 0 : 1);
