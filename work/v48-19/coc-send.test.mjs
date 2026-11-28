/* v48.19 CoC send (stage 1) browser tests. Supabase is mocked in memory and *.supabase.co is mapped to a dead port: NO real email, NO production writes.
   Usage: ROOT=<worktree> OUT=/workspace/guard-shots/v4819 node work/v48-19/coc-send.test.mjs [pixel7|chromebook]   (default: both)
   Fixture names are made up. The "worker" is simulated by flipping the status of the queued row in the mock store. */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
const OUT = process.env.OUT || "/workspace/guard-shots/v4819"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 900) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date()), TOMORROW = PF.format(new Date(Date.now() + 86400000 * 1.0));
const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const SECRET = { tech: "Taylor Tester", techMail: "taylor.tester@envss.com.au", worker: "Testone", client: "Acme Mining Pty", project: "Secret Hill Expansion", mobile: "0419628710" };
const person = (first, last) => ({ first, last, sex: "male", sexSet: true, dob: "1985-03-04", occupation: "Fitter", company: SECRET.client, hours: "12", daysOn: "8", daysOff: "6" });
const aud = [{ at: at(6, 0), action: "START pressed", who: SECRET.tech + " <" + SECRET.techMail + ">" }];
const H = (id, n, extra) => Object.assign({ id, eventId: "eC", trainKind: "airborne_personal", mode: "personal", sampleNo: n, pouch: String(n), contaminantId: "INH", pumpSerial: "7700" + n, headId: "IESS-" + id, mediaId: "C-10" + n,
  startFlow: "2.0", endFlow: "2.0", rotameter: "FR4A40BNBN-NL-02", shiftDate: TODAY, shiftKind: "day", status: "ended", startAt: at(6, 0), endAt: at(13, 0), comments: "", location: "Mill floor",
  person: person("Sam", SECRET.worker), rpd: {}, hpd: {}, audit: aud.slice() }, extra || {});
function fixture(over) {
  over = over || {};
  const trains = [
    H("s1", 1), H("s2", 2, { contaminantId: "RES", analyses: [{ code: "RES", name: "Respirable dust" }, { code: "SIL", name: "Crystalline silica" }] }),
    H("s3", 3, { trainKind: "airborne_static", mode: "static", location: "Bay 2", startFlow: "2.0", endFlow: "1.9" }),
    H("s4", 4, { status: "rejected", rejectCode: "damaged_filter", rejectAsked: "yes", rejectReason: "Damaged filter", endAt: "", endFlow: "" }),
    H("sb", 0, { trainKind: "blank", mode: "blank", mediaId: "C-BLANK", sampleNo: 0, pouch: "0", startAt: "", endAt: "", startFlow: "", endFlow: "", location: "", person: {}, audit: [] })
  ].concat(over.extraTrains || []);
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }, { id: "RES", name: "Respirable dust", code: "RES", kind: "airborne", headHint: "IESS", flowTolPct: 5, defaultFlow: "2.5" }, { id: "SIL", name: "Crystalline silica", code: "SIL", kind: "airborne", flowTolPct: 5, defaultFlow: "2.5" }],
      pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p1", number: over.job || "0019358", name: SECRET.project, source: "field", site: "Pit 4", client: SECRET.client }],
    events: [{ id: "eC", projectId: "p1", code: "0019358-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] }],
    trains, deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
  };
}
const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
async function boot(vp, fx, opts) {
  const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); const store = {}; page.store = store; page.mlog = mockSupabase(page, store, opts || {});
  page.on("request", r => { const u = r.url(); if (!u.startsWith(url) && !u.startsWith("data:") && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|\.supabase\.co\//.test(u)) ext.push(vp + " " + r.method() + " " + u.split("?")[0]); });
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); }, fx);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(d => { db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains)); db.catalogs = Object.assign(db.catalogs || {}, d.catalogs); persist(); }, fx);
  await sleep(200); return page;
}
const txt = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel || "#app");
const has = (page, sel) => page.evaluate(s => !!document.querySelector(s), sel);
const dis = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.disabled : null; }, sel);
async function setVal(page, sel, v) { await page.evaluate((s, x) => { const e = document.querySelector(s); e.value = x; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, sel, v); }
async function waitChecks(page) { await page.waitForFunction(() => { const s = cocSend.state(); return s && s.r && !s.busy; }, { timeout: 30000 }); await sleep(250); }
async function openScreen(page) { await page.evaluate(() => openEvent("eC")); await sleep(500); await page.click("#cocSendOpen"); await waitChecks(page); }
async function fillCollection(page, loc) { await setVal(page, "#csDate", TOMORROW); await setVal(page, "#csFrom", "09:00"); await setVal(page, "#csTo2", "12:00"); if (loc) await setVal(page, "#csLoc", loc); await sleep(700); await waitChecks(page); }
const rows = (page, t) => page.evaluate(n => [...(window.__store && window.__store[n] ? [] : [])], t);
const tbl = (page, t) => [...(page.store[t] || new Map()).values()];
const blockIds = page => page.evaluate(() => cocSend.state().r.blocks.map(b => b.id));
const warnIds = page => page.evaluate(() => cocSend.state().r.warns.map(b => b.id));

async function run(vp) {
  const L = s => `${vp}: ${s}`; const shot = async (page, n, full) => { await page.screenshot({ path: path.join(OUT, `coc-${n}-${vp}.png`), fullPage: !!full }); };
  const page = await boot(vp, fixture());
  /* ---- event card ---- */
  await page.evaluate(() => openEvent("eC")); await sleep(600);
  check(L("event page shows the 'Chain of custody to the lab' card with a Review and send button"), await has(page, "#cocSendCard #cocSendOpen") && /Not sent yet/.test(await txt(page, "#cocSendCard")), await txt(page, "#cocSendCard"));
  await shot(page, "01-event-card");
  await page.click("#cocSendOpen"); await waitChecks(page);
  check(L("review screen is a dialog (blocks auto-update while open)"), await has(page, "#csScreen[role=dialog][aria-modal=true]"));
  const how = await txt(page, "#csScreen");
  check(L("walkthrough helper text: four steps, nothing sent until Send"), /Read the checks below/.test(how) && /Tell the lab when and where/.test(how) && /Nothing is sent until you tap Send/.test(how), how.slice(0, 500));
  check(L("recipient shown: From lab@, To ohlwa@mpl.com.au, results in ESDAT to lab@, invoice to accounts@"), /From\s*lab@envss\.com\.au/.test(how) && /ohlwa@mpl\.com\.au/.test(how) && /ESDAT format, to lab@envss\.com\.au/.test(how) && /accounts@envss\.com\.au/.test(how), how.slice(0, 700));
  check(L("collection location defaults to the ENVSS office, not the event address"), (await page.evaluate(() => document.getElementById("csLoc").value)) === "10 Bermondsey Street, West Leederville WA 6007");
  let b = await blockIds(page);
  check(L("before collection details: blocked on day and time"), b.includes("collection_date") && b.includes("collection_time") && !b.includes("collection_location"), JSON.stringify(b));
  check(L("Send and the 'I have checked' tick are disabled while blocked"), (await dis(page, "#csGo")) === true && (await dis(page, "#csTick")) === true);
  await shot(page, "02-review-top", false);
  /* location is editable, then reset */
  await setVal(page, "#csLoc", "Gate 3, Test Mine, Pilbara WA"); await sleep(500);
  check(L("tech can edit the collection location"), (await page.evaluate(() => cocSend.state().collection.location)) === "Gate 3, Test Mine, Pilbara WA");
  await page.evaluate(() => document.getElementById("csOffice").click()); await sleep(300);
  check(L("'Use the ENVSS office' puts the office address back"), (await page.evaluate(() => document.getElementById("csLoc").value)).startsWith("10 Bermondsey Street"));
  await fillCollection(page);
  b = await blockIds(page);
  check(L("with day and time filled: no blocks (all sample checks pass)"), b.length === 0, JSON.stringify(b));
  check(L("all-clear banner shown"), /ALL CLEAR/.test(await txt(page, "#csChecks")), await txt(page, "#csChecks"));
  await page.evaluate(() => { const e = document.getElementById("csTat"); e.value = "2_day"; e.dispatchEvent(new Event("change")); }); await sleep(900); await waitChecks(page);
  const tatState = await page.evaluate(() => ({ ev: db.events.find(e => e.id === "eC").turnaround, model: cocSend.state().r.model.turnaround, xlsx: cocSend.state().g.out.turnaround, txt: cocSend.state().r.layout.texts.join("|") }));
  check(L("turnaround picker: saved on the event, in the spreadsheet build and on the CoC page (2 day)"), tatState.ev === "2_day" && tatState.model === "2_day" && tatState.xlsx === "2_day" && /2 day/.test(tatState.txt), JSON.stringify(tatState));
  const w = await warnIds(page);
  check(L("rejected sample with no volume is a warning, not a block"), w.includes("rejected_no_volume"), JSON.stringify(w));
  /* image */
  const im = await page.evaluate(() => [...document.querySelectorAll("#csImg img")].map(i => ({ w: i.naturalWidth, h: i.naturalHeight, cw: i.clientWidth })));
  check(L("CoC page rendered on screen as an image (full page, A4 landscape)"), im.length >= 1 && im[0].w === 1684 && im[0].h === 1190, JSON.stringify(im));
  const z0 = im[0].cw; await page.click("#csZp"); await page.click("#csZp"); await sleep(150);
  const z1 = await page.evaluate(() => document.querySelector("#csImg img").clientWidth);
  check(L("zoom in makes the image larger and scrollable"), z1 > z0 * 1.5, z0 + " -> " + z1);
  await page.evaluate(() => document.getElementById("csImg").scrollIntoView({ block: "center" })); await sleep(200);
  await shot(page, "03-coc-image-zoomed");
  await page.click("#csZfit"); await sleep(150);
  await page.evaluate(() => document.getElementById("csImg").scrollIntoView({ block: "center" })); await sleep(200);
  await shot(page, "04-coc-image-fit");
  await page.evaluate(() => window.scrollTo(0, 0)); await page.evaluate(() => document.getElementById("csScreen").scrollTo(0, 0));
  await shot(page, "05-review-checks-collection");
  /* tick + send */
  check(L("tick is enabled once checks pass, Send still disabled until ticked"), (await dis(page, "#csTick")) === false && (await dis(page, "#csGo")) === true);
  await page.evaluate(() => document.getElementById("csTick").click()); await sleep(200);
  check(L("ticking 'I have checked the CoC' enables Send"), (await dis(page, "#csGo")) === false);
  await shot(page, "06-ready-to-send");
  const nBefore = tbl(page, "envss_coc_sends").length;
  await page.evaluate(() => document.getElementById("csGo").click()); await sleep(1800);
  const sends = tbl(page, "envss_coc_sends");
  check(L("Send queues exactly one send row (mock; nothing emailed)"), nBefore === 0 && sends.length === 1, "rows=" + sends.length);
  const row = sends[0] || {};
  check(L("row: kind send, from lab@, to ohlwa@mpl.com.au, queued, job + event, who + when"), row.kind === "send" && row.from_addr === "lab@envss.com.au" && row.to_addr === "ohlwa@mpl.com.au" && row.status === "queued" && row.job_number === "0019358" && row.event_code === "0019358-001" && /tester|field\.test|@/i.test(row.requested_by || "") && !!row.requested_at, JSON.stringify(row).slice(0, 400));
  check(L("row: collection day/time/location stored (office address default)"), row.collection && row.collection.date === TOMORROW && row.collection.from === "09:00" && row.collection.to === "12:00" && /Bermondsey/.test(row.collection.location), JSON.stringify(row.collection));
  check(L("row: CoC xlsx + PDF attached, files uploaded to field-exports under g/<job>/<event>/coc-send/"), (row.attachments || []).length === 2 && row.attachments.some(a => /\.xlsx$/.test(a.name)) && row.attachments.some(a => /\.pdf$/.test(a.name)) && page.mlog.filter(l => /^POST \/storage\/v1\/object\/field-exports\/g\/0019358\/0019358-001\/coc-send\//.test(l)).length >= 2, JSON.stringify(row.attachments) + " " + page.mlog.filter(l => /storage/.test(l)).join(" | "));
  check(L("row: 5 samples, content hash, app version, device recorded"), row.sample_count === 5 && /^[0-9a-f]{40,64}$/.test(row.content_hash || "") && !!row.app_version && !!row.device, JSON.stringify([row.sample_count, row.content_hash, row.app_version]));
  const body = (row.body_text || "") + "\n" + (row.subject || "") + "\n" + (row.body_html || "");
  check(L("email states ESDAT, results to lab@, invoice to accounts@, collection day/time/where, office phone"), /RESULTS REQUIRED IN ESDAT FORMAT/.test(row.body_text) && /lab@envss\.com\.au/.test(row.body_text) && /accounts@envss\.com\.au/.test(row.body_text) && /Bermondsey/.test(row.body_text) && /9:00 am to 12:00 pm/.test(row.body_text) && /08 9355 4010/.test(row.body_text), row.body_text);
  const leaks = Object.values(SECRET).filter(s => body.toLowerCase().includes(s.toLowerCase()));
  check(L("email has no tech name/email, worker name, client, project name or mobile"), leaks.length === 0, JSON.stringify(leaks));
  const drive = tbl(page, "envss_drive_copies");
  check(L("CoC xlsx, PDF and CSV copies queued for Drive {job}_Field-App (existing Drive queue)"), ["xlsx", "pdf", "csv"].every(x => drive.some(d => new RegExp("Laboratory_COC.*\\." + x + "$").test(d.file_name || "")) ) && drive.every(d => d.job_number === "0019358"), JSON.stringify(drive.map(d => d.file_name)));
  const evAudit = await page.evaluate(() => (db.events.find(e => e.id === "eC").audit || []).map(a => a.action));
  check(L("event audit trail records the queued send"), evAudit.some(a => /COC queued to lab/.test(a)), JSON.stringify(evAudit));
  /* the CoC file contents */
  const files = await page.evaluate(async () => { const it = cocSend.items()[0]; return it ? { n: it.files.length } : null; });
  await shot(page, "07-queued");
  /* worker marks it sent -> duplicate guard */
  tbl(page, "envss_coc_sends")[0].status = "sent"; tbl(page, "envss_coc_sends")[0].sent_at = new Date().toISOString();
  await page.evaluate(() => cocSend.refresh("0019358-001")); await sleep(300);
  await page.evaluate(() => document.getElementById("csClose").click()); await sleep(300);
  await page.evaluate(() => openEvent("eC")); await sleep(500);
  check(L("event card shows 'Sent … to ohlwa@mpl.com.au' and the collection"), /Sent .* to ohlwa@mpl\.com\.au/.test(await txt(page, "#cocSendCard")) && /Collection:/.test(await txt(page, "#cocSendCard")), await txt(page, "#cocSendCard"));
  await shot(page, "08-event-card-sent");
  await page.click("#cocSendOpen"); await waitChecks(page);
  check(L("duplicate guard: same CoC again says 'already sent' and Send stays disabled"), /already sent/i.test(await txt(page, "#csSendInfo")) && (await dis(page, "#csGo")) === true && (await dis(page, "#csTick")) === true, await txt(page, "#csSendInfo"));
  await setVal(page, "#csDate", TOMORROW); await fillCollection(page);
  /* the draft collection was remembered, so this is the same CoC */
  await shot(page, "09-duplicate-guard");
  await page.evaluate(() => document.getElementById("csResendBtn").click()); await sleep(300);
  check(L("resend path asks for a reason; Send stays disabled without it"), (await has(page, "#csReason")) && (await dis(page, "#csGo")) === true);
  await setVal(page, "#csReason", "Lab did not receive the first email"); await sleep(200);
  await page.evaluate(() => document.getElementById("csTick").click()); await sleep(250);
  check(L("resend within 10 minutes of the last send is throttled"), (await dis(page, "#csGo")) === true && /less than 10 minutes/.test(await txt(page, "#csSendBar")), await txt(page, "#csSendBar"));
  /* amended: change a sample so the content differs */
  await page.evaluate(() => document.getElementById("csClose").click()); await sleep(200);
  tbl(page, "envss_coc_sends")[0].requested_at = new Date(Date.now() - 3600e3).toISOString(); tbl(page, "envss_coc_sends")[0].sent_at = tbl(page, "envss_coc_sends")[0].requested_at;
  await page.evaluate(() => { const t = db.trains.find(x => x.id === "s1"); t.endAt = new Date(new Date(t.endAt).getTime() + 30 * 60000).toISOString(); persist(); cocSend.refresh("0019358-001"); }); await sleep(300);
  await page.evaluate(() => openEvent("eC")); await sleep(400); await page.click("#cocSendOpen"); await waitChecks(page);
  check(L("changed samples after a send: offered as AMENDED, reason required"), /AMENDED/.test(await txt(page, "#csSendInfo")) && (await has(page, "#csReason")) && (await dis(page, "#csGo")) === true, await txt(page, "#csSendInfo"));
  await setVal(page, "#csReason", "Sample 1 ran 30 minutes longer"); await sleep(250);
  await page.evaluate(() => document.getElementById("csTick").click()); await sleep(250);
  check(L("amended CoC can be sent after reason + tick"), (await dis(page, "#csGo")) === false);
  await page.evaluate(() => document.getElementById("csGo").click()); await sleep(1800);
  const s2 = tbl(page, "envss_coc_sends").filter(r => r.kind === "send");
  const am = s2.find(r => r.resend_of);
  check(L("amended row points back at the original and the subject says AMENDED, reason stored"), !!am && am.resend_of === s2.find(r => !r.resend_of).id && /AMENDED/.test(am.subject) && /30 minutes/.test(am.note || ""), JSON.stringify(am && [am.resend_of, am.subject, am.note]));
  await shot(page, "10-amended-queued");

  check(L("no page errors"), page.errs.length === 0, page.errs.join(" | "));
  await page.close();
  await generatedFiles(vp);
  await blocksScenario(vp);
  await appFailureScenario(vp);
  await manualFlagScenario(vp);
  await privacyScenario(vp);
  await offlineScenario(vp);
}

/* the generated spreadsheet and PDF: office phone only, ESDAT, accounts@, no personal info */
async function generatedFiles(vp) {
  const L = s => `${vp}: ${s}`;
  const page = await boot(vp, fixture());
  await openScreen(page); await fillCollection(page);
  const g = await page.evaluate(() => { const r = cocSend.state().r, x = r.g.xl; return { xl: x, texts: r.layout.texts, pdf64: btoa(String.fromCharCode.apply(null, r.pdf)), pages: r.layout.pages.length }; });
  const all = g.xl.strings.join("\n");
  check(L("spreadsheet: Esdat ticked, results lab@, invoice accounts@ only, phone is the office number"), g.xl.esdatTick && g.xl.resultsTo === "lab@envss.com.au" && g.xl.invoiceTo === "accounts@envss.com.au" && /^08 9355 4010$/.test(g.xl.phone), JSON.stringify([g.xl.esdatTick, g.xl.resultsTo, g.xl.invoiceTo, g.xl.phone]));
  check(L("spreadsheet: no 'Mob' label, no mobile number, no sampler / worker / client / project name"), !/Mob:|0419|628 710/.test(all) && !Object.values(SECRET).some(x => all.toLowerCase().includes(x.toLowerCase())), all.slice(0, 600));
  check(L("spreadsheet: says RESULTS REQUIRED IN ESDAT FORMAT"), /RESULTS REQUIRED IN ESDAT FORMAT/.test(all));
  check(L("spreadsheet: only 2 emails appear (lab@, accounts@) and 2 phone numbers (office, Envirolab national)"), JSON.stringify([...new Set(all.match(/[\w.+-]+@[\w.-]+\.\w+/g) || [])].sort()) === JSON.stringify(["accounts@envss.com.au", "lab@envss.com.au"]), all.match(/[\w.+-]+@[\w.-]+\.\w+/g));
  fs.writeFileSync("/tmp/coc-test.pdf", Buffer.from(g.pdf64, "base64"));
  const { execSync } = await import("child_process");
  const pt = execSync("pdftotext -layout /tmp/coc-test.pdf -").toString();
  check(L("PDF text: ESDAT required, job number, office phone 08 9355 4010, accounts@ and lab@, collection details"), /RESULTS REQUIRED IN ESDAT FORMAT/.test(pt) && /0019358/.test(pt) && /08 9355 4010/.test(pt) && /accounts@envss\.com\.au/.test(pt) && /lab@envss\.com\.au/.test(pt) && /SAMPLE COLLECTION REQUESTED/.test(pt) && /Bermondsey/.test(pt), pt.slice(0, 900));
  check(L("PDF text: no tech / worker / client / project / mobile"), !Object.values(SECRET).some(x => pt.toLowerCase().includes(x.toLowerCase())) && !/04\d\d ?\d{3} ?\d{3}/.test(pt), pt.slice(0, 600));
  check(L("PDF text: blank shows N/A for run time and volume; rejected sample noted"), /C-BLANK[^\n]*N\/A[^\n]*N\/A/.test(pt) && /voided needs clean and return/.test(pt), pt);
  await page.close();
}

async function blocksScenario(vp) {
  const L = s => `${vp}: ${s}`; const shot = async n => page.screenshot({ path: path.join(OUT, `coc-${n}-${vp}.png`) });
  const bad = [H("x1", 6, { endAt: "", mediaId: "C-106" }), H("x2", 7, { mediaId: "C-101", contaminantId: "", analyses: [] }), H("x3", 8, { status: "rejected", rejectAsked: "", rejectCode: "", rejectReason: "", mediaId: "C-108" }),
    H("x4", 9, { mediaId: "C-109", startFlow: "", endFlow: "" }), H("x5", 10, { mediaId: "", startAt: at(13, 0), endAt: at(6, 0) })];
  const page = await boot(vp, fixture({ extraTrains: bad }));
  await openScreen(page); await fillCollection(page);
  const ids = await blockIds(page), txtc = await txt(page, "#csChecks");
  const want = ["time_missing", "id_dup", "no_analysis", "flow_missing", "id_missing", "time_order"];
  check(L("data problems block: missing stop time, duplicate ID, no analysis, no flow, no ID, stop before start"), want.every(w => ids.includes(w)), JSON.stringify(ids));
  check(L("rejected sample with no reason is blocked (reason check or not-finished gate)"), ids.includes("reject_reason") || ids.includes("unfinished"), JSON.stringify(ids));
  check(L("these are tech-fixable: no 'app problem' banner and no APP PROBLEM tags"), !/APP PROBLEM/.test(txtc) && !/isn't something you can fix/.test(txtc), txtc.slice(0, 300));
  check(L("each sample problem has an Open sample button"), (await page.evaluate(() => document.querySelectorAll("#csChecks [data-open]").length)) >= 5);
  check(L("Send and tick disabled with problems"), (await dis(page, "#csGo")) === true && (await dis(page, "#csTick")) === true);
  await page.evaluate(() => document.getElementById("csScreen").scrollTo(0, 400)); await sleep(200); await shot("11-blocked-sample-data");
  /* fix the sample data in the app, reopen: blocks clear */
  await page.evaluate(() => document.getElementById("csClose").click());
  await page.evaluate(() => { ["x1", "x2", "x3", "x4", "x5"].forEach(id => { const i = db.trains.findIndex(t => t.id === id); db.trains.splice(i, 1); }); persist(); });
  await openScreen(page);
  check(L("after fixing the samples in the app the checks clear on reopen"), (await blockIds(page)).filter(x => !/collection/.test(x)).length === 0, JSON.stringify(await blockIds(page)));
  /* collection checks */
  await setVal(page, "#csDate", "2020-01-01"); await setVal(page, "#csFrom", "10:00"); await setVal(page, "#csTo2", "09:00"); await setVal(page, "#csLoc", "x"); await sleep(700); await waitChecks(page);
  const c2 = await blockIds(page);
  check(L("collection checks: past day, end before start, location too short"), c2.includes("collection_date_past") && c2.includes("collection_window") && c2.includes("collection_location_short"), JSON.stringify(c2));
  await setVal(page, "#csLoc", ""); await sleep(600); await waitChecks(page);
  check(L("collection checks: empty location blocked"), (await blockIds(page)).includes("collection_location"));
  await page.close();
}

async function appFailureScenario(vp) {
  const L = s => `${vp}: ${s}`; const shot = async n => page.screenshot({ path: path.join(OUT, `coc-${n}-${vp}.png`) });
  const page = await boot(vp, fixture());
  await page.evaluate(() => { const v = window.volumeLitres; window.volumeLitres = t => { const x = v(t); return x == null ? x : x * 10; }; });   /* simulate an app bug: volume off by 10x */
  await openScreen(page); await fillCollection(page);
  const r = await page.evaluate(() => cocSend.state().r.blocks.map(b => ({ id: b.id, fix: b.fix, text: b.text })));
  check(L("volume that does not match average flow x run time is a BLOCK (app side) on the spreadsheet and the page"), r.some(x => x.id === "vol_mismatch" && x.fix === "app") && r.some(x => x.id === "vol_mismatch_pdf"), JSON.stringify(r.slice(0, 3)));
  const t = await txt(page, "#csChecks");
  check(L("tech is told it isn't theirs to fix and Send is blocked"), /isn't something you can fix/.test(t) && /APP PROBLEM/.test(t) && (await dis(page, "#csGo")) === true && (await dis(page, "#csTick")) === true, t.slice(0, 400));
  check(L("flag box prompts for detail; report button is hidden until the box is ticked"), /Please tell us what you can see/.test(await txt(page, "#csFlagBox")) && (await page.evaluate(() => document.getElementById("csFlagBody").hidden)) === true);
  await page.evaluate(() => document.getElementById("csFlagBox").scrollIntoView({ block: "center" })); await sleep(200); await shot("12-app-problem-flag-prompt");
  await page.evaluate(() => document.getElementById("csFlagTick").click()); await sleep(200);
  check(L("tick 'Something looks wrong' reveals the comment box; report disabled with no comment"), (await page.evaluate(() => !document.getElementById("csFlagBody").hidden)) && (await dis(page, "#csFlagSend")) === true);
  await setVal(page, "#csFlagText", "too short"); await sleep(100);
  check(L("comment under 20 characters keeps the report disabled and shows the count"), (await dis(page, "#csFlagSend")) === true && /9 \/ 20/.test(await txt(page, "#csFlagCount")), await txt(page, "#csFlagCount"));
  const msg = "Sample 1 volume says 8400 L but it ran 420 min at 2.0 L/min, should be 840 L.";
  await setVal(page, "#csFlagText", msg); await sleep(100);
  check(L("comment of 20+ characters enables 'Send error report to John'"), (await dis(page, "#csFlagSend")) === false);
  await page.evaluate(() => document.getElementById("csFlagBox").scrollIntoView({ block: "center" })); await sleep(200); await shot("13-flag-comment-entered");
  await page.evaluate(() => document.getElementById("csFlagSend").click()); await sleep(2200);
  const al = tbl(page, "envss_coc_sends").filter(x => x.kind === "alert");
  check(L("error report queued once: to john@envss.com.au from lab@, no send row to the lab"), al.length === 1 && al[0].to_addr === "john@envss.com.au" && al[0].from_addr === "lab@envss.com.au" && tbl(page, "envss_coc_sends").filter(x => x.kind === "send").length === 0, JSON.stringify(al.map(a => [a.to_addr, a.from_addr])));
  const a = al[0] || {};
  check(L("tech's flag + comment are at the TOP of the email and stored in tech_flag"), /^TECH FLAG: SOMETHING LOOKS WRONG/.test(a.body_text) && a.body_text.indexOf(msg) > 0 && a.body_text.indexOf(msg) < a.body_text.indexOf("JOB / EVENT") && a.tech_flag && a.tech_flag.comment === msg && a.tech_flag.raised === true && a.tech_flag.manual === false, (a.body_text || "").slice(0, 400));
  const bt = a.body_text || "";
  check(L("error email has job, event, every sample, failing checks with values, app version, device, tech user, time"), /Job number: 0019358/.test(bt) && /Event: 0019358-001/.test(bt) && /C-101/.test(bt) && /C-BLANK/.test(bt) && /vol_mismatch/.test(bt) && /value=/.test(bt) && /App version: 48\.19/.test(bt) && /Device \/ browser: Mozilla/.test(bt) && /Raised by: .*@/.test(bt) && /Time \(AWST\)/.test(bt) && /FAILING CHECKS/.test(bt) && /GENERATED SPREADSHEET ROWS/.test(bt), bt.slice(0, 1500));
  check(L("error email subject names the event and the failing check"), /CoC error report 0019358-001/.test(a.subject) && /vol_mismatch/.test(a.subject), a.subject);
  const names = (a.attachments || []).map(x => x.name);
  check(L("error email attaches the CoC PDF, the page image(s) and the spreadsheet"), names.some(n => /\.pdf$/.test(n)) && names.some(n => /_CoC_page1\.png$/.test(n)) && names.some(n => /\.xlsx$/.test(n)) && page.mlog.filter(l => /POST \/storage\/v1\/object\/field-exports\/.*coc-send\/al_/.test(l)).length >= 3, JSON.stringify(names));
  check(L("alert row stores failed checks as JSON for the log"), (a.checks.failed || []).some(c => c.id === "vol_mismatch" && c.fix === "app"), JSON.stringify(a.checks).slice(0, 300));
  const ft = await txt(page, "#csFlagBox");
  check(L("screen then says the error report was queued/sent and Send to the lab stays blocked"), /Error report/.test(ft) && (await dis(page, "#csGo")) === true, ft);
  await page.evaluate(() => document.getElementById("csFlagBox").scrollIntoView({ block: "center" })); await sleep(200); await shot("14-error-report-sent");
  /* reopen: still blocked for the same CoC + same app version */
  await page.evaluate(() => document.getElementById("csClose").click()); await sleep(200);
  await openScreen(page); await fillCollection(page);
  check(L("reopening keeps Send blocked for the same CoC and app version"), (await dis(page, "#csGo")) === true && (await blockIds(page)).includes("flagged_open"), JSON.stringify(await blockIds(page)));
  await page.close();
}

async function manualFlagScenario(vp) {
  const L = s => `${vp}: ${s}`; const shot = async n => page.screenshot({ path: path.join(OUT, `coc-${n}-${vp}.png`) });
  const page = await boot(vp, fixture());
  await openScreen(page); await fillCollection(page);
  await page.evaluate(() => document.getElementById("csTick").click()); await sleep(200);
  check(L("manual flag: with all checks clear the tech can still tick 'Something looks wrong'"), (await dis(page, "#csGo")) === false);
  await page.evaluate(() => document.getElementById("csFlagTick").click()); await sleep(250);
  check(L("manual flag blocks Send to the lab while ticked"), (await dis(page, "#csGo")) === true && /Something looks wrong/.test(await txt(page, "#csSendBar")), await txt(page, "#csSendBar"));
  await page.evaluate(() => document.getElementById("csFlagTick").click()); await sleep(250);
  await page.evaluate(() => document.getElementById("csTick").click()); await sleep(250);
  check(L("unticking the flag lets the tech continue (tick again to send)"), (await dis(page, "#csGo")) === false);
  await page.evaluate(() => document.getElementById("csFlagTick").click()); await sleep(250);
  const msg = "The field blank is listed first but I expected it last, and sample 3 should be Personal not Static.";
  await setVal(page, "#csFlagText", msg); await sleep(100);
  await page.evaluate(() => document.getElementById("csFlagSend").click()); await sleep(2200);
  const al = tbl(page, "envss_coc_sends").filter(x => x.kind === "alert")[0] || {};
  check(L("manual flag error report: comment on top, marked 'raised by hand', checks list says none failed"), /by hand from the CoC preview/.test(al.body_text) && al.tech_flag && al.tech_flag.manual === true && al.tech_flag.comment === msg && /none: the tech raised the flag by hand/.test(al.body_text), (al.body_text || "").slice(0, 500));
  check(L("manual flag: no send to the lab was created"), tbl(page, "envss_coc_sends").filter(x => x.kind === "send").length === 0);
  await page.close();
}

async function privacyScenario(vp) {
  const L = s => `${vp}: ${s}`;
  const page = await boot(vp, fixture());
  /* simulate an app / template change that leaks the tech name and a mobile onto the spreadsheet */
  await page.evaluate(() => {
    const orig = window.buildCocV45c;
    window.buildCocV45c = async function () {
      const out = await orig.apply(this, arguments);
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(out.buf); const ws = wb.worksheets[0];
      ws.getCell("B7").value = "Taylor Tester"; ws.getCell("C11").value = "Mob: 0419 628 710"; ws.getCell("B6").value = "tt@envss.com.au";
      out.buf = await wb.xlsx.writeBuffer(); return out;
    };
  });
  await openScreen(page); await fillCollection(page);
  const pr = await page.evaluate(() => cocSend.state().r.blocks.filter(b => b.id === "privacy").map(b => b.value));
  check(L("privacy lint blocks a tech name, a mobile number and a personal email on the generated spreadsheet (app side)"), pr.some(v => /tech name/.test(v)) && pr.some(v => /phone number/.test(v)) && pr.some(v => /email address/.test(v)), JSON.stringify(pr));
  check(L("privacy block is an app problem: Send blocked, tech can send an error report"), (await dis(page, "#csGo")) === true && /isn't something you can fix/.test(await txt(page, "#csChecks")));
  await page.close();
}

async function offlineScenario(vp) {
  const L = s => `${vp}: ${s}`; const shot = async n => page.screenshot({ path: path.join(OUT, `coc-${n}-${vp}.png`) });
  const page = await boot(vp, fixture());
  await openScreen(page); await fillCollection(page);
  await page.evaluate(() => document.getElementById("csTick").click()); await sleep(200);
  page.store.offline = true; await page.setOfflineMode(true); await sleep(200);
  await page.evaluate(() => cocSend.state() && 0); await setVal(page, "#csLoc", "10 Bermondsey Street, West Leederville WA 6007"); await sleep(600); await waitChecks(page);
  await page.evaluate(() => document.getElementById("csTick").click()); await sleep(250);
  check(L("offline: button reads 'Send when online' and still needs the tick"), /Send when online/.test(await txt(page, "#csGo")) && (await dis(page, "#csGo")) === false, await txt(page, "#csGo"));
  await shot("15-offline-send-when-online");
  await page.evaluate(() => document.getElementById("csGo").click()); await sleep(1500);
  const pend = await page.evaluate(() => cocSend.pending());
  check(L("offline: tap saves the send on the device (queue = 1), no row reached the server"), pend === 1 && tbl(page, "envss_coc_sends").length === 0, "pending=" + pend);
  check(L("offline: screen says it will send when back online and offers to cancel"), /Waiting for signal/.test(await txt(page, "#csSendInfo")) && (await has(page, "#csCancelQ")), await txt(page, "#csSendInfo"));
  const hold = await page.evaluate(() => /CoC send/.test(String((window.v4816 && v4816.blockers && v4816.blockers()) || "")) || cocSend.pending() > 0);
  check(L("offline queue holds the safe auto-update (counted as pending)"), hold);
  await shot("16-offline-queued");
  await page.setOfflineMode(false); page.store.offline = false; await page.evaluate(() => window.dispatchEvent(new Event("online"))); await sleep(3500);
  const sends = tbl(page, "envss_coc_sends");
  check(L("back online: the queued send goes (one row, queued for the worker) without another tap"), sends.length === 1 && sends[0].status === "queued" && (await page.evaluate(() => cocSend.pending())) === 0, "rows=" + sends.length);
  check(L("back online: Drive copies queued after the send row exists"), tbl(page, "envss_drive_copies").length >= 3);
  await page.close();
}
const vps = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of vps) await run(vp);
await browser.close(); server.close();
check("no requests left the test box (only localhost, jsdelivr CDN, mocked supabase)", ext.length === 0, ext.join(" | "));
const failed = results.filter(r => !r.ok);
fs.writeFileSync(path.join(OUT, "coc-send-test-results.json"), JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 1));
console.log("\n" + (results.length - failed.length) + " passed, " + failed.length + " failed");
process.exit(failed.length ? 1 : 0);
