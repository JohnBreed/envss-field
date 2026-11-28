/* v48.19c capture-guard tests (John 28 Nov 2026 AWST): fit-test OCR + completeness, end-flow confirm, noise stop results, daily-log queue.
   Usage: ROOT=<worktree> OUT=<dir> node work/v48-19c/test.mjs [pixel7|chromebook]   (default: both)
   Supabase is mocked in memory, *.supabase.co goes to a dead port, the Vision reply is scripted (fixtures/fit-vision.json: made-up worker). */
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
const __d = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || "/workspace/capture-shots/v4819c"; fs.mkdirSync(OUT, { recursive: true });
const vision = JSON.parse(fs.readFileSync(path.join(__d, "fixtures/fit-vision.json"), "utf8"));
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 700) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date());
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const person = (first, last) => ({ first, last, sex: "male", sexSet: true, dob: "1985-03-04", dobD: "04", dobM: "03", dobY: "1985", occupation: "Fitter", company: "Acme Mining", hours: "12", daysOn: "8", daysOff: "6" });
const H = (id, ev, n, extra) => Object.assign({ id, eventId: ev, trainKind: "airborne_personal", mode: "personal", sampleNo: n, pouch: String(n), contaminantId: "INH", pumpSerial: "7700" + n, headId: "IESS-" + id, mediaId: "C-" + id,
  startFlow: "2.0", endFlow: "", rotameter: "FR4A40BNBN-NL-02", shiftDate: TODAY, shiftKind: "day", status: "running", startAt: ago(2), endAt: "", comments: "", location: "Bay " + n,
  person: person("Sam" + n, "Testone"), rpd: {}, hpd: {}, audit: [{ at: ago(2), action: "START pressed", detail: "" }] }, extra || {});
const NZ = (id, ev, n, extra) => Object.assign({ id, eventId: ev, trainKind: "noise_personal", mode: "personal", sampleNo: n, pouch: String(n), contaminantId: "NOISE", dosimeterSerial: "D-" + id, fieldCalibrator: "59311", shiftDate: TODAY, status: "running", startAt: ago(2), endAt: "", person: person("Noa" + n, "Testtwo"), audit: [{ at: ago(2), action: "START pressed", detail: "" }] }, extra || {});
const cal = { [TODAY]: { start: { ref: "94.0", reading: "94.0", at: ago(3), by: "test" } } };
const done = { asked: "no", model: "", classRating: "" };
function fixture() {
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }, { id: "NOISE", name: "Noise dose", code: "NOISE", kind: "noise" }], pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p1", number: "0019919", name: "v48.19c capture test", source: "field", site: "Test site", client: "Acme Mining" }],
    events: [{ id: "eH", projectId: "p1", code: "0019919-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      { id: "eN", projectId: "p1", code: "0019919-002", type: "noise", date: TODAY, stage: "planned", audit: [], noiseCal: cal },
      { id: "eFit", projectId: "p1", code: "0019919-RFT-001", type: "fit", date: TODAY, stage: "planned", audit: [] }],
    trains: [H("h1", "eH", 1), H("h2", "eH", 2), H("h3", "eH", 3), H("h4", "eH", 4), H("h5", "eH", 5),
      NZ("n1", "eN", 1), NZ("n2", "eN", 2), NZ("n3", "eN", 3, { hpdAsked: true, hpd: { asked: "no" }, noise: { method: "dose", entry: "manual", values: { LAeq: { v: "85.0", src: "manual" }, LCpeak: { v: "110.0", src: "manual" } }, octave: {}, hpdAtt: [] } }),
      NZ("n4", "eN", 4, { status: "ended", startAt: ago(5), endAt: ago(4) })],
    fitReports: [], deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
  };
}
const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
async function boot(vp, storeOpts) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); const store = Object.assign({}, storeOpts || {}); page.store = store; page.mlog = mockSupabase(page, store, {});
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  const fx = fixture(); await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); }, fx);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(d => { window.ENVSS_CONFIG.admins = ["field.test@envss.com.au"]; db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains)); db.fitReports = []; db.catalogs = Object.assign(db.catalogs || {}, d.catalogs); persist(); }, fx);
  await sleep(200); return page;
}
const T = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(db.trains.find(x => x.id === i))), id);
const open = async (page, id) => { await page.evaluate(i => openTrain(i), id); await sleep(350); };
const modal = page => page.evaluate(() => { const g = document.querySelector(".g19-modal"); if (g) return "g19:" + g.dataset.g19; if (document.getElementById("v488Modal")) return "v488"; if (document.querySelector('.cg-modal')) return "cg"; const v = document.querySelector('.v483-modal[data-v483="laptop"]'); return v ? "v483laptop" : ""; });
/* press STOP and walk the other warnings (long run / laptop) but stop at the modal named in opts.stopAt */
async function stop(page, opts) {
  opts = opts || {}; const seen = [];
  await page.evaluate(() => { const e = document.getElementById("btnStop"); if (e) e.scrollIntoView({ block: "center", behavior: "instant" }); }); await sleep(100);
  await page.click("#btnStop"); await sleep(300);
  for (let i = 0; i < 6; i++) {
    const m = await modal(page); if (!m) break; seen.push(m);
    if (opts.stopAt === m) return seen;
    if (m === "v488") await page.click("#v488No"); else if (m === "v483laptop") await page.click("#v483NudgeOk"); else if (m === "cg") break; else await page.click("#g19Yes");
    await sleep(350);
  }
  await sleep(300); return seen;
}
const jsClick = (page, sel) => page.evaluate(q => { const e = document.querySelector(q); if (!e) throw new Error("missing " + q); e.click(); }, sel);
const fitFile = async page => { const jpeg = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 300; c.height = 400; c.getContext("2d").fillRect(0, 0, 50, 50); return c.toDataURL("image/jpeg", 0.8).split(",")[1]; }); const f = "/tmp/v4819c-fit.jpg"; fs.writeFileSync(f, Buffer.from(jpeg, "base64")); return f; };
const fitVals = page => page.evaluate(() => { const r = db.fitReports[0] || {}; const g = id => (document.getElementById(id) || {}).value; return { n: db.fitReports.length, st: r.ocrStatus, co: r.company, model: r.model, proto: r.protocol, res: r.result, domCo: g("fitCompany"), domModel: g("fitModel"), domProto: g("fitProtocol"), domRes: g("fitResult"), screen: view.fitScreen }; });

async function run(vp) {
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, `${vp}-${n}.png`) });
  const P = `[${vp}] `;
  let page = await boot(vp, { ocrBody: vision, ocrStatus: 200, ocrDelay: 2500 });
  check(P + "app is v48.19 and the new exports are present", await page.evaluate(() => APP_VERSION === "48.19" && !!window.v4819c && !!window.v44DailyLog.queue && typeof ENVSS_NOISE.stopGaps === "function" && typeof envssFit.missingFields === "function"));

  /* ---------- 1. FIT-TEST: OCR must fill the boxes, completeness gates sign/PDF ---------- */
  await page.evaluate(() => { openEvent("eFit"); }); await sleep(500);
  const f = await fitFile(page);
  await (await page.$("#fitNewPhoto")).uploadFile(f); await sleep(700);
  let s = await page.evaluate(() => ({ reading: !!document.getElementById("fitReading"), dis: !!(document.getElementById("fitToSign") || {}).disabled, screen: view.fitScreen }));
  check(P + "(fit) photo opens the confirm screen in a 'reading' state with Continue off while Vision works", s.screen === "confirm" && s.reading && s.dis, JSON.stringify(s));
  await shot(page, "fit-1-reading");
  await page.evaluate(() => { const b = document.getElementById("fitToSign"); if (b) { b.disabled = false; b.click(); } }); await sleep(300);
  s = await page.evaluate(() => ({ screen: view.fitScreen, co: (db.fitReports[0] || {}).company, alert: 1 }));
  check(P + "(fit) forcing Continue while reading does not leave the confirm screen", s.screen === "confirm", JSON.stringify(s));
  await sleep(3200);
  let v = await fitVals(page);
  check(P + "(fit) after the read, company / model / protocol / pass-fail are filled on screen AND on the record", v.co === "Westfield Metals" && /RP2VC-T/.test(v.model) && !!v.proto && v.res === "PASS" && v.domCo === v.co && !!v.domModel && !!v.domProto && v.domRes === "PASS", JSON.stringify(v));
  await shot(page, "fit-2-read-filled"); await sleep(3000);
  page.dialogs.length = 0; await jsClick(page, "#fitToSign"); await sleep(1200);
  v = await fitVals(page); v.dialogs = page.dialogs.slice();
  check(P + "(fit) Continue to signature keeps the OCR values (no blank write-back) and opens the sign screen", v.screen === "sign" && v.co === "Westfield Metals" && !!v.model && !!v.proto && v.res === "PASS", JSON.stringify(v));
  await shot(page, "fit-3-sign");
  /* retake: blank the record's company then retake with the same Vision reply; must refill, and a blank OCR must never blank */
  await page.evaluate(() => { const r = db.fitReports[0]; r.company = ""; r.model = ""; r.protocol = ""; r.result = ""; view.fitScreen = ""; persist(); render(); }); await sleep(300);
  await page.evaluate(() => document.querySelector("[data-fit-open]").click()); await sleep(500);
  const hasRetake = await page.evaluate(() => !!document.getElementById("fitRetake"));
  if (hasRetake) {
    page.store.ocrDelay = 800;
    await (await page.$("#fitPhotoInput")).uploadFile(f); await sleep(2800);
    v = await fitVals(page);
    check(P + "(fit) RETAKE refills company/model/protocol/pass-fail from the new photo (0019389 bug)", v.co === "Westfield Metals" && !!v.model && !!v.proto && v.res === "PASS" && v.domCo === "Westfield Metals", JSON.stringify(v));
    await shot(page, "fit-4-retake-filled");
  } else check(P + "(fit) retake control present on the confirm screen", false, "no #fitRetake");
  /* blank OCR never blanks existing values; missing list names blanks */
  const un = await page.evaluate(() => { const api = envssFit; const rep = { company: "Keep Co", model: "M1", protocol: "P1", result: "PASS", lastName: "L", firstName: "F" }; api.applyParsed(rep, { company: "", model: "", protocol: "", result: "", lastName: "", firstName: "" }, "retake"); const miss = api.missingFields({ lastName: "L", firstName: "F" }).map(x => x.key); return { kept: rep.company === "Keep Co" && rep.model === "M1" && rep.protocol === "P1" && rep.result === "PASS", miss, empty: api.isEmptyReport({}), notEmpty: api.isEmptyReport({ company: "x" }), complete: api.isReportComplete({ lastName: "L", firstName: "F", company: "c", model: "m", protocol: "p", result: "PASS", sigClient: "data:image/png;base64,AAAA", signedAt: "2026-11-28T00:00:00Z" }) }; });
  check(P + "(fit) a blank OCR value never blanks a filled field; the 'missing' check lists result, company, model, protocol", un.kept && ["result", "company", "model", "protocol"].every(k => un.miss.includes(k)) && un.empty && !un.notEmpty && un.complete, JSON.stringify(un));

  /* blank report cannot be signed or PDF'd */
  await page.evaluate(() => { db.fitReports = [{ id: "frBlank", eventId: "eFit", lastName: "Testthree", firstName: "Blank", exercises: [], audit: [], createdAt: new Date().toISOString() }]; persist(); openEvent("eFit"); }); await sleep(500);
  await page.evaluate(() => document.querySelector("[data-fit-open]").click()); await sleep(500);
  check(P + "(fit) a report with blanks shows the 'Still to fill in' panel naming the blanks", await page.evaluate(() => { const l = document.getElementById("fitMissingList"); return !!l && /Pass\/fail/.test(l.textContent) && /Company/.test(l.textContent) && /Respirator model/.test(l.textContent) && /Protocol/.test(l.textContent); }));
  await shot(page, "fit-5-missing-panel");
  page.dialogs.length = 0;
  await jsClick(page, "#fitToSign"); await sleep(400);
  v = await fitVals(page);
  check(P + "(fit) Continue to signature is refused until pass/fail, company, model and protocol are filled", v.screen === "confirm" && page.dialogs.some(d => /can't be signed yet/.test(d)), JSON.stringify([v.screen, page.dialogs]));
  /* a report that already has a name + signature but blanks: the sign screen must not make a PDF */
  await page.evaluate(() => { db.fitReports[0].exercises = []; view.fitScreen = "sign"; view.fitReportId = db.fitReports[0].id; render(); }); await sleep(500);
  const gate = await page.evaluate(() => ({ note: /Not complete/.test((document.getElementById("fitSignMissing") || {}).textContent || ""), btn: !!document.getElementById("fitMakePdf") }));
  page.dialogs.length = 0; await jsClick(page, "#fitMakePdf"); await sleep(500);
  const nPdf = await page.evaluate(() => ({ pdf: !!db.fitReports[0].pdfName, signed: !!db.fitReports[0].signedAt }));
  check(P + "(fit) the sign screen shows 'Not complete: ...' and Sign / PDF does nothing while fields are blank", gate.note && gate.btn && !nPdf.pdf && !nPdf.signed && page.dialogs.some(d => /can't be signed yet/.test(d)), JSON.stringify([gate, nPdf, page.dialogs]));
  await shot(page, "fit-5b-sign-blocked");

  /* empty reports: manual entry stays in memory, Save draft on empty saves nothing */
  await page.evaluate(() => { db.fitReports = []; persist(); view.fitScreen = ""; openEvent("eFit"); }); await sleep(400);
  await jsClick(page, "#fitAddManual"); await sleep(500);
  let n1 = await page.evaluate(() => db.fitReports.length);
  page.dialogs.length = 0; await jsClick(page, "#fitSaveDraft"); await sleep(400);
  let n2 = await page.evaluate(() => db.fitReports.length);
  check(P + "(fit) 'Enter manually' then Save draft with nothing typed creates NO report (no blank report saved)", n1 === 0 && n2 === 0 && page.dialogs.some(d => /nothing to save/i.test(d)), JSON.stringify([n1, n2, page.dialogs]));
  await page.type("#fitLast", "Testfour"); await sleep(300);
  check(P + "(fit) the report is added only once something is typed", await page.evaluate(() => db.fitReports.length === 1));
  await page.evaluate(() => { db.fitReports.push({ id: "frEmpty", eventId: "eFit", exercises: [], audit: [], createdAt: new Date().toISOString() }); view.fitScreen = ""; persist(); openEvent("eFit"); }); await sleep(400);
  const emptyRow = await page.evaluate(() => ({ txt: document.getElementById("app").innerText, empty: envssFit.isEmptyReport(db.fitReports.find(r => r.id === "frEmpty")) }));
  check(P + "(fit) an already-saved empty report is recognised as empty and labelled in the list (not deleted)", emptyRow.empty && /empty|nothing entered|blank/i.test(emptyRow.txt) && await page.evaluate(() => db.fitReports.some(r => r.id === "frEmpty")), emptyRow.txt.slice(0, 300));
  await shot(page, "fit-6-event-list");
  await page.evaluate(() => { db.fitReports = [{ id: "frInc", eventId: "eFit", lastName: "Testfive", firstName: "Inc", sigClient: "data:image/png;base64,AAAA", signedAt: new Date().toISOString(), exercises: [], audit: [] }]; persist(); view.fitScreen = ""; openEvent("eFit"); }); await sleep(400);
  page.dialogs.length = 0; await page.evaluate(() => { const b = document.getElementById("fitMarkComplete"); if (b) b.click(); else markEventUpload("eFit"); }); await sleep(400);
  check(P + "(fit) Mark complete is refused while a signed report still has blanks", page.dialogs.some(d => /cannot be marked complete/.test(d)) && await page.evaluate(() => eventById("eFit").stage !== "uploaded" && eventById("eFit").stage !== "complete"), JSON.stringify(page.dialogs));
  check(P + "(fit) no page errors in the fit flow", !page.errs.length, page.errs.join(" | "));
  await page.close();

  /* ---------- 2. END FLOW: explicit confirm, 'confirmed equal' in the audit ---------- */
  page = await boot(vp);
  await open(page, "h1");
  let seen = await stop(page, { stopAt: "v488" });
  const tx = await page.evaluate(() => ({ read: (document.getElementById("v488Read") || {}).textContent || "", btn: (document.getElementById("v488No") || {}).textContent || "", pre: (document.getElementById("v488End") || {}).value }));
  check(P + "(end flow) the STOP question asks the tech to read the rotameter; the button says 'Rotameter reads 2.0 L/min: confirm'", seen.includes("v488") && /rotameter/i.test(tx.read) && /Rotameter reads 2\.0 L\/min: confirm/.test(tx.btn), JSON.stringify(tx));
  check(P + "(end flow) the sample is NOT stopped until the tech taps", (await T(page, "h1")).status === "running" && !(await T(page, "h1")).endAt);
  await shot(page, "endflow-1-confirm");
  await page.click("#v488No"); await sleep(500);
  let t1 = await T(page, "h1");
  check(P + "(end flow) confirm stops the sample, flags endFlowBasis=confirmed_equal and audits 'End flow confirmed equal to start'", t1.status === "ended" && t1.endFlow === "2.0" && t1.endFlowBasis === "confirmed_equal" && t1.audit.some(a => a.action === "End flow confirmed equal to start"), JSON.stringify([t1.status, t1.endFlow, t1.endFlowBasis]));
  /* dismiss the daily log sheet so it does not cover the next screens */
  await page.evaluate(() => document.querySelectorAll("#dlRemind [data-r=later]").forEach(b => b.click())); await sleep(200);
  await open(page, "h2"); await stop(page, { stopAt: "v488" });
  await page.type("#v488End", "1.8", { delay: 10 }).catch(() => {}); await page.evaluate(() => { const i = document.getElementById("v488End"); i.value = "1.8"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.click("#v488Save"); await sleep(600);
  for (let i = 0; i < 4 && (await T(page, "h2")).status !== "ended"; i++) { const m = await modal(page); if (m === "g19:flow" || m.startsWith("g19")) await page.click("#g19Yes"); else if (m === "v488") await page.click("#v488Save"); await sleep(400); }
  let t2 = await T(page, "h2");
  check(P + "(end flow) a typed, different reading is recorded as measured and not flagged equal", t2.status === "ended" && t2.endFlow === "1.8" && t2.endFlowBasis === "measured" && !t2.audit.some(a => a.action === "End flow confirmed equal to start"), JSON.stringify([t2.status, t2.endFlow, t2.endFlowBasis]));
  await page.evaluate(() => document.querySelectorAll("#dlRemind [data-r=later]").forEach(b => b.click())); await sleep(200);
  await open(page, "h3"); await stop(page, { stopAt: "v488" });
  await page.evaluate(() => { const i = document.getElementById("v488End"); i.value = "2.0"; i.dispatchEvent(new Event("input", { bubbles: true })); }); await page.click("#v488Save"); await sleep(600);
  let t3 = await T(page, "h3");
  check(P + "(end flow) typing exactly the start value is flagged 'confirmed equal' (typed_equal)", t3.status === "ended" && t3.endFlowBasis === "typed_equal" && t3.audit.some(a => a.action === "End flow confirmed equal to start"), JSON.stringify([t3.status, t3.endFlowBasis]));
  await page.close();

  /* ---------- 3. DAILY LOG queue on rapid back-to-back stops ---------- */
  page = await boot(vp);
  for (const id of ["h1", "h2", "h3", "h4", "h5"]) { await open(page, id); await stop(page); }
  await sleep(600);
  let q = await page.evaluate(() => ({ q: v44DailyLog.queue(), sheet: !!document.getElementById("dlRemind"), more: (document.getElementById("dlRemind") || {}).textContent || "", stopped: db.trains.filter(t => /^h/.test(t.id) && t.endAt).length }));
  check(P + "(daily log) five stops in a row (S13-S17 pattern) all stopped and ALL five are queued for the daily-log prompt", q.stopped === 5 && q.q.length === 5 && q.sheet && /4 more waiting/.test(q.more), JSON.stringify(q));
  await shot(page, "dailylog-1-queue");
  await sleep(21000);
  check(P + "(daily log) the prompt does not close itself after 20 s", await page.evaluate(() => !!document.getElementById("dlRemind") && v44DailyLog.queue().length === 5));
  await page.reload({ waitUntil: "networkidle0" }); await sleep(2200);
  check(P + "(daily log) the queue survives a reload", await page.evaluate(() => v44DailyLog.queue().length === 5 && !!document.getElementById("dlRemind")));
  for (let i = 0; i < 5; i++) { await page.evaluate(i => { const b = document.querySelector('#dlRemind [data-r="' + (i % 2 ? "later" : "not_supplied") + '"]'); if (b) b.click(); }, i); await sleep(250); }
  const after = await page.evaluate(() => ({ q: v44DailyLog.queue().length, sheet: !!document.getElementById("dlRemind"), st: ["h1", "h2", "h3", "h4", "h5"].map(i => v44DailyLog.statusOf(db.trains.find(t => t.id === i))) }));
  check(P + "(daily log) answering each one clears the queue and every sample has a daily-log status", after.q === 0 && !after.sheet && after.st.every(Boolean), JSON.stringify(after));
  check(P + "(daily log) samples already stopped before this version are not queued", await page.evaluate(() => !v44DailyLog.queue().includes("n4")));
  await page.close();

  /* ---------- 4. NOISE: LAeq + LCpeak (+ hearing protection) before STOP ---------- */
  page = await boot(vp);
  await open(page, "n1");
  seen = await stop(page, { stopAt: "cg" });
  const c1 = await page.evaluate(() => ({ why: (document.getElementById("cgWhy") || {}).textContent, hasA: !!document.getElementById("cgLAeq"), hasC: !!document.getElementById("cgLCpeak"), hpd: !!document.getElementById("cgHpd") }));
  check(P + "(noise) STOP on a running noise sample asks for LAeq, LCpeak and hearing protection; not stopped yet", seen.includes("cg") && c1.hasA && c1.hasC && c1.hpd && (await T(page, "n1")).status === "running" && !(await T(page, "n1")).endAt, JSON.stringify(c1));
  await shot(page, "noise-1-stop-results");
  await page.click("#cgYes"); await sleep(250);
  check(P + "(noise) Save and STOP with nothing entered is refused with a message", await page.evaluate(() => /LAeq/.test((document.getElementById("cgErr") || {}).textContent || "") && !!document.querySelector(".cg-modal")) && (await T(page, "n1")).status === "running");
  await page.type("#cgLAeq", "84.9"); await page.click("#cgYes"); await sleep(250);
  check(P + "(noise) LAeq alone is not enough (LCpeak required)", await page.evaluate(() => /LCpeak/.test((document.getElementById("cgErr") || {}).textContent || "")) && (await T(page, "n1")).status === "running");
  await page.type("#cgLCpeak", "103.8"); await page.click("#cgYes"); await sleep(250);
  check(P + "(noise) hearing protection must be answered too", await page.evaluate(() => /hearing protection/i.test((document.getElementById("cgErr") || {}).textContent || "")) && (await T(page, "n1")).status === "running");
  await page.click('#cgHpd [data-hpd="no"]'); await shot(page, "noise-2-filled");
  await page.click("#cgYes"); await sleep(900);
  for (let i = 0; i < 4 && (await T(page, "n1")).status !== "ended"; i++) { const m = await modal(page); if (m.startsWith("g19")) await page.click("#g19Yes"); else if (m === "v483laptop") await page.click("#v483NudgeOk"); await sleep(400); }
  let n = await T(page, "n1");
  check(P + "(noise) with both results and hearing protection saved, the sample stops with the values on the record", n.status === "ended" && !!n.endAt && n.noise && n.noise.values.LAeq.v === "84.9" && n.noise.values.LCpeak.v === "103.8" && (n.hpd && n.hpd.asked === "no" || n.hpdAsked), JSON.stringify([n.status, n.noise && n.noise.values, n.hpd, n.hpdAsked]));
  await page.evaluate(() => document.querySelectorAll("#dlRemind [data-r=later]").forEach(b => b.click())); await sleep(200);
  await open(page, "n2"); await stop(page, { stopAt: "cg" }); await page.click("#cgNo"); await sleep(300);
  n = await T(page, "n2");
  check(P + "(noise) Cancel leaves the sample running", n.status === "running" && !n.endAt && !(await modal(page)));
  await open(page, "n3"); seen = await stop(page);
  n = await T(page, "n3");
  check(P + "(noise) a sample that already has LAeq, LCpeak and hearing protection stops with no extra prompt", n.status === "ended" && !seen.includes("cg"), JSON.stringify([n.status, seen]));
  await page.evaluate(() => document.querySelectorAll("#dlRemind [data-r=later]").forEach(b => b.click())); await sleep(200);
  const n4a = await T(page, "n4"); await open(page, "n4"); const n4b = await T(page, "n4");
  check(P + "(noise) an already-stopped sample is not retro-blocked or changed by opening it", n4a.endAt === n4b.endAt && n4b.status === "ended" && !(await modal(page)));
  check(P + "(noise) no page errors", !page.errs.length, page.errs.join(" | "));
  await page.close();
}
const which = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of which) { console.log("=== " + vp); try { await run(vp); } catch (e) { check(`[${vp}] test run completed`, false, e.stack || e); } }
await browser.close(); server.close();
const pass = results.filter(r => r.ok).length;
fs.writeFileSync(path.join(OUT, "test-results.json"), JSON.stringify({ pass, total: results.length, results }, null, 1));
console.log(`${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
