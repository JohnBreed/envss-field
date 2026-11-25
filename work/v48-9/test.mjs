/* v48.12 tests: respirator fit testing event type, exclusions, confirm form, signatures, PDF.
   Usage: ROOT=/workspace/envss-fit-v489 node work/v48-9/test.mjs [pixel7|chromebook]   (default: both)
   Supabase is mocked in memory. Fixture names are made up. */
import fs from "fs"; import path from "path"; import { execSync } from "child_process";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION, root as REPO } from "./harness.mjs";
const OUT = process.env.OUT || "/workspace/fit-shots"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 700) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date());

const OCR_TEXT = `FIT TEST REPORT 25/11/2026
ID NUMBER ENVSS1
LAST NAME Breed
FIRST NAME John
COMPANY ENVSS
LOCATION Various
TEST DATE 25/11/2026 10:45
DUE DATE 25/11/2027
PORTACOUNT S/N 8048192704
N95-COMPANION Yes
RESPIRATOR 3M Aura 9322A+ Disposable P2 Flat-fold, 3-panel de
[100] N95
MANUFACTURER 3M
MODEL Aura 9322A+
RESPIRATOR STYLE Disposable P2 Flat-fold, 3-panel design with exhalation
valve
RESPIRATOR SIZE One Size
PROTOCOL OSHA FAST-FILTERING FACE
PASS LEVEL 100
APPROVAL
EFFICIENCY<99% Yes
EXERCISE DURATION FIT FACTOR PASS
BENDING OVER 50s 200+ Yes
TALKING 30 200+ Yes
HEAD SIDE TO SIDE 30 200+ Yes
HEAD UP AND DOWN 30 200+ Yes
OVERALL FF 200+ Yes
FITTEST OPERATOR EA
NAME John Breed`;

function fixture() {
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }], pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p489", number: "0019489", name: "v48.12 fit-test", source: "field", site: "Test site" }],
    events: [
      { id: "eH", projectId: "p489", code: "0019489-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      { id: "eFit", projectId: "p489", code: "0019489-FIT-001", type: "fit", date: TODAY, stage: "planned", parentEventId: "eH", audit: [] }
    ],
    trains: [
      { id: "h1", eventId: "eH", trainKind: "airborne_personal", mode: "personal", sampleNo: 1, pouch: "1", contaminantId: "INH", status: "prepped", person: { first: "Sam", last: "Tester" }, rpd: {}, audit: [] }
    ],
    hires: [],
    fitReports: [],
    deletions: []
  };
}

function tinyJpeg() {
  /* 1x1 pixel jpeg */
  return Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wAAAQAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAB8f/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/AH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAAE/AH//2Q==", "base64");
}

const { server, base: url } = await serve();
const browser = await launch();
const ext = [];

async function boot(vp, ocr) {
  const page = await browser.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true);
  const store = { ocrStatus: (ocr && ocr.status) || 503, ocrBody: (ocr && ocr.body) || { error: "OCR_NOT_CONFIGURED", message: "OCR not set up yet, enter manually" } };
  page.store = store;
  page.mlog = mockSupabase(page, store, {});
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  const fx = fixture(); await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); }, fx);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(async () => {
    try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } catch (e) {}
    if (!window.PDFLib) {
      await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"; s.onload = res; s.onerror = () => res(); document.head.appendChild(s); });
    }
  });
  await page.evaluate(d => {
    db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains));
    db.fitReports = d.fitReports || []; db.catalogs = Object.assign(db.catalogs || {}, d.catalogs);
    persist();
    pullActivity = async function () {}; window.pullActivity = pullActivity;
  }, fx);
  await sleep(300); return page;
}

async function signPad(page, id) {
  const h = await page.$(id);
  const r = await h.boundingBox();
  await page.mouse.move(r.x + 16, r.y + 20);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width - 20, r.y + r.height - 24, { steps: 8 });
  await page.mouse.up();
  await sleep(100);
}

async function addManual(page) {
  await page.evaluate(() => openEvent("eFit"));
  await sleep(400);
  await page.click("#fitAddManual");
  await sleep(400);
}

async function run(vp) {
  const shot = (page, n, full = false) => page.screenshot({ path: path.join(OUT, `${vp}-${n}.png`), fullPage: full });
  fs.readdirSync(OUT).filter(f => f.endsWith('.pdf') || f.endsWith('.zip')).forEach(f => fs.unlinkSync(path.join(OUT, f)));
  const page = await boot(vp, { status: 503, body: { error: "OCR_NOT_CONFIGURED", message: "OCR not set up yet, enter manually" } });
  check(`[${vp}] app is v48.13 with fit-test module`, await page.evaluate(() => APP_VERSION === "48.13" && document.getElementById("appVersion").textContent === "v48.13" && document.title === "ENVSS Field v48.13" && !!(window.envssFit && envssFit.parseReport)), await page.evaluate(() => ({ v: APP_VERSION, t: document.title, fit: !!(window.envssFit) })));

  const labels = await page.evaluate(() => {
    const ev = eventById("eFit"), hy = eventById("eH");
    return { fit: eventTypeLabel(ev), hyg: eventTypeLabel(hy), isFit: isFitEvent(ev), notHyg: isFitEvent(hy) };
  });
  check(`[${vp}] eventTypeLabel names fit and hygiene correctly`, labels.fit === "Respirator fit testing" && labels.hyg === "Hygiene event" && labels.isFit && !labels.notHyg, JSON.stringify(labels));

  const nums = await page.evaluate(() => {
    const p = project("p489");
    const nextFit = envssFit.nextFitSeq("p489");
    const nextFitCode = envssFit.fitEventCode(p, nextFit);
    const codes = new Set(db.events.map(e => e.code));
    let n = db.events.filter(e => e.projectId === "p489" && !isFibreEvent(e) && !isFitEvent(e)).length + 1;
    while (codes.has(p.number + "-" + String(n).padStart(3, "0"))) n++;
    const nextHyg = p.number + "-" + String(n).padStart(3, "0");
    return { nextFit, nextFitCode, nextHyg };
  });
  check(`[${vp}] next fit is 0019489-FIT-002 and next hygiene stays 0019489-002`, nums.nextFit === "002" && nums.nextFitCode === "0019489-FIT-002" && nums.nextHyg === "0019489-002", JSON.stringify(nums));

  await page.evaluate(() => openEvent("eFit"));
  await sleep(400);
  await shot(page, "01-fit-event");
  const evUi = await page.evaluate(() => ({
    add: !!document.getElementById("fitAddReport"),
    manual: !!document.getElementById("fitAddManual"),
    sample: !!document.getElementById("btnAddSampleTop"),
    title: document.body.innerText.includes("Respirator fit testing"),
    code: document.body.innerText.includes("0019489-FIT-001")
  }));
  check(`[${vp}] fit event shows Add individual report, not Add sample`, evUi.add && evUi.manual && !evUi.sample && evUi.title && evUi.code, JSON.stringify(evUi));

  const coc = await page.evaluate(async () => { const r = await createCoc(); return { r, dialogs: true }; });
  check(`[${vp}] Create COC is blocked on a fit event`, page.dialogs.some(d => /do not have a laboratory COC/i.test(d)), page.dialogs.join(" | "));

  await addManual(page);
  const confirm = await page.evaluate(() => ({
    screen: !!document.getElementById("fitConfirm"),
    retake: !!document.getElementById("fitRetake"),
    msg: (document.getElementById("fitOcrMsg") || {}).textContent || "",
    last: !!document.getElementById("fitLast")
  }));
  check(`[${vp}] manual entry opens the confirm form with retake photo`, confirm.screen && confirm.retake && confirm.last && /manually/i.test(confirm.msg), JSON.stringify(confirm));
  await shot(page, "02-confirm-manual");

  await page.evaluate(() => {
    document.getElementById("fitLast").value = "Breed";
    document.getElementById("fitFirst").value = "John";
    document.getElementById("fitModel").value = "Aura 9322A+";
    document.getElementById("fitTestDate").value = "25/11/2026";
    document.getElementById("fitResult").value = "PASS";
    document.getElementById("fitPassLevel").value = "100";
    document.getElementById("fitOverallFf").value = "200+";
  });
  await page.evaluate(() => { const b = document.getElementById("fitToSign"); if (b) b.scrollIntoView({ block: "center" }); });
  await sleep(200);
  await page.evaluate(() => { const b = document.getElementById("fitToSign"); if (b) b.click(); });
  await sleep(600);
  const onSign = await page.evaluate(() => !!(document.getElementById("fitSigTech") && document.getElementById("fitSigClient")));
  check(`[${vp}] continue opens the two signature pads`, onSign, await page.evaluate(() => document.getElementById("fitConfirm") ? "still on confirm: " + (document.body.innerText || "").slice(0, 200) : "no sign, no confirm"));
  if (!onSign) return;
  await shot(page, "03-signatures");

  await signPad(page, "#fitSigTech");
  await signPad(page, "#fitSigClient");
  // Programmatic strokes as a fallback if the headless mouse did not mark the pads dirty.
  await page.evaluate(() => {
    ["fitSigTech", "fitSigClient"].forEach(id => {
      const c = document.getElementById(id); if (!c) return;
      const ev = (type, x, y) => c.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons: 1 }));
      const r = c.getBoundingClientRect();
      ev("mousedown", r.left + 10, r.top + 10);
      ev("mousemove", r.left + 80, r.top + 40);
      ev("mouseup", r.left + 80, r.top + 40);
    });
  });
  page.dialogs.length = 0;
  const cdp = await page.target().createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: OUT });
  await page.evaluate(() => { const b = document.getElementById("fitMakePdf"); if (b) b.scrollIntoView({ block: "center" }); });
  await sleep(200);
  await page.evaluate(() => { const b = document.getElementById("fitMakePdf"); if (b) b.click(); });
  for (let i = 0; i < 30 && !(await page.evaluate(() => !!(db.fitReports[0] && db.fitReports[0].pdfName))); i++) await sleep(500);
  const afterPdf = await page.evaluate(() => {
    const r = (db.fitReports || [])[0] || {};
    return { signed: !!r.signedAt, name: r.pdfName || "", result: r.result, last: r.lastName, evStage: deriveEventStage(eventById("eFit")), n: (db.fitReports || []).length, pdfLib: !!(window.PDFLib) };
  });
  check(`[${vp}] signed PDF is named Surname_First_Model_DD-MM-YYYY.pdf`, afterPdf.signed && afterPdf.name === "Breed_John_Aura-9322A_25-11-2026.pdf" && afterPdf.result === "PASS", JSON.stringify(afterPdf) + " dialogs=" + JSON.stringify(page.dialogs));
  check(`[${vp}] after signing, event stage is samples-complete (signed reports)`, afterPdf.evStage === "ev_complete", afterPdf.evStage);
  const pdfFiles = fs.readdirSync(OUT).filter(f => f.endsWith(".pdf") && /Breed_John/.test(f));
  check(`[${vp}] a PDF file was saved`, pdfFiles.length > 0, pdfFiles.join(","));
  await shot(page, "04-after-pdf");

  /* complete */
  page.dialogs.length = 0;
  if (!(await page.$("#fitMarkComplete"))) {
    await page.evaluate(() => { view.fitScreen = ""; openEvent("eFit"); });
    await sleep(400);
  }
  await page.evaluate(() => { const b = document.getElementById("fitMarkComplete"); if (b) b.click(); });
  await sleep(300);
  const done = await page.evaluate(() => ({ ready: eventById("eFit").uploadReady, stage: deriveEventStage(eventById("eFit")) }));
  check(`[${vp}] mark complete follows signed reports`, done.ready && done.stage === "upload_ready", JSON.stringify(done));

  /* zip */
  check(`[${vp}] Download all (zip) is offered after a signed report`, await page.evaluate(() => !!document.getElementById("fitZip")));

  /* OCR not configured message on a photo */
  const page2 = await boot(vp, { status: 503, body: { error: "OCR_NOT_CONFIGURED", message: "OCR not set up yet, enter manually" } });
  const ocrMsg = await page2.evaluate(async () => {
    const ev = eventById("eFit");
    const file = new File([new Uint8Array([255, 216, 255, 217])], "x.jpg", { type: "image/jpeg" });
    await envssFit.startFromFile(ev, file, false);
    const r = db.fitReports[db.fitReports.length - 1];
    view.page = "event"; view.fitScreen = "confirm"; view.fitReportId = r.id; render();
    return { status: r.ocrStatus, msg: r.ocrMessage, screen: !!document.getElementById("fitConfirm"), msgOnPage: /OCR not set up yet, enter manually/i.test(document.body.innerText || "") };
  });
  check(`[${vp}] missing Vision key shows OCR not set up yet, enter manually`, /OCR not set up yet, enter manually/i.test(ocrMsg.msg) && ocrMsg.screen && ocrMsg.msgOnPage, JSON.stringify(ocrMsg));
  await page2.screenshot({ path: path.join(OUT, `${vp}-06-ocr-not-configured.png`), fullPage: true });
  await page2.close();

  /* Mocked Vision text fills the form from a generated synthetic report photo */
  const page3 = await boot(vp, { status: 200, body: { text: OCR_TEXT, pages: [], annotations: [] } });
  const synB64 = await page3.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 900; c.height = 1200;
    const x = c.getContext("2d");
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, 900, 1200);
    x.fillStyle = "#111111"; x.font = "28px sans-serif";
    ["FIT TEST REPORT 25/11/2026", "ID NUMBER ENVSS1", "LAST NAME Breed", "FIRST NAME John",
     "COMPANY ENVSS", "MODEL Aura 9322A+", "OVERALL FF 200+ Yes"].forEach((t, i) => x.fillText(t, 40, 70 + i * 40));
    return c.toDataURL("image/jpeg", 0.85).replace(/^data:[^;]+;base64,/, "");
  });
  await page3.evaluate(async (jpegB64) => {
    const ev = eventById("eFit");
    const raw = Uint8Array.from(atob(jpegB64), c => c.charCodeAt(0));
    const file = new File([raw], "report.jpg", { type: "image/jpeg" });
    await envssFit.startFromFile(ev, file, false);
  }, synB64);
  await sleep(800);
  const filled = await page3.evaluate(() => {
    const r = db.fitReports[0] || {};
    return { last: r.lastName, first: r.firstName, model: r.model, result: r.result, date: (r.testDate && r.testDate.display) || r.testDateDisplay, style: r.respiratorStyle, status: r.ocrStatus, hasPhoto: !!(r.photoDataUrl || r.photo), confirm: !!document.getElementById("fitConfirm") };
  });
  check(`[${vp}] mocked Vision text fills name, model, date and PASS`, filled.last === "Breed" && filled.first === "John" && filled.model === "Aura 9322A+" && filled.result === "PASS" && filled.date === "25/11/2026" && /exhalation valve/.test(filled.style || "") && filled.status === "ok", JSON.stringify(filled));
  await page3.screenshot({ path: path.join(OUT, `${vp}-05-ocr-filled.png`), fullPage: true });

  /* Sign the OCR-filled report; the PDF is a one-page TSI layout with signatures and no photo page. */
  if (!filled.confirm) {
    await page3.evaluate(() => {
      const r = db.fitReports[0];
      if (!r) return;
      view.page = "event"; view.eventId = r.eventId; view.fitScreen = "confirm"; view.fitReportId = r.id; render();
    });
    await sleep(400);
  }
  await page3.evaluate(() => { const b = document.getElementById("fitToSign"); if (b) { b.scrollIntoView({ block: "center" }); b.click(); } });
  await sleep(600);
  await signPad(page3, "#fitSigTech");
  await signPad(page3, "#fitSigClient");
  await page3.evaluate(() => {
    ["fitSigTech", "fitSigClient"].forEach(id => {
      const c = document.getElementById(id); if (!c) return;
      const ev = (type, x, y) => c.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons: 1 }));
      const r = c.getBoundingClientRect();
      ev("mousedown", r.left + 10, r.top + 10);
      ev("mousemove", r.left + 80, r.top + 40);
      ev("mouseup", r.left + 80, r.top + 40);
    });
  });
  const cdp3 = await page3.target().createCDPSession();
  await cdp3.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: OUT });
  fs.readdirSync(OUT).filter(f => f.endsWith(".pdf")).forEach(f => {
    const src = path.join(OUT, f);
    if (/manual/.test(f)) return;
    const dest = path.join(OUT, f.replace(/\.pdf$/i, "-manual.pdf"));
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  });
  await page3.evaluate(() => { const b = document.getElementById("fitMakePdf"); if (b) { b.scrollIntoView({ block: "center" }); b.click(); } });
  for (let i = 0; i < 30 && !(await page3.evaluate(() => !!(db.fitReports[0] && db.fitReports[0].pdfName && db.fitReports[0].pdfBytes > 0))); i++) await sleep(500);
  const photoPdfs = fs.readdirSync(OUT).filter(f => f.endsWith(".pdf") && /Breed_John/.test(f) && !/manual/.test(f));
  let pages = 0, signedLine = "";
  if (photoPdfs.length) {
    const pdfPath = path.join(OUT, photoPdfs[0]);
    const info = execSync("pdfinfo " + JSON.stringify(pdfPath), { encoding: "utf8" });
    pages = +((/Pages:\s*(\d+)/.exec(info) || [])[1] || 0);
    signedLine = execSync("pdftotext -layout " + JSON.stringify(pdfPath) + " -", { encoding: "utf8" });
    execSync("pdftoppm -png -r 140 " + JSON.stringify(pdfPath) + " " + JSON.stringify(path.join(OUT, vp + "-07-pdf")));
  }
  check(`[${vp}] signed PDF is a one-page TSI layout with signatures and no photo page`, pages === 1 && /FIT TEST REPORT/.test(signedLine) && /FITTEST OPERATOR/.test(signedLine) && /NOTE:/.test(signedLine) && /envss\.com\.au/.test(signedLine) && /admin@envss\.com\.au/.test(signedLine) && !/ENVSS technician/.test(signedLine) && photoPdfs.length > 0, JSON.stringify({ pages, files: photoPdfs, signed: signedLine.slice(0, 500) }));
  await page3.close();

  const pageErrs = page.errs.filter(e => !/Failed to load|ocr-fit-report|jszip|pdf-lib/i.test(e));
  check(`[${vp}] no unexpected page errors`, pageErrs.length === 0, pageErrs.join(" | "));
  await page.close();
}

const vps = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of vps) {
  try { await run(vp); }
  catch (e) { check(`[${vp}] run threw`, false, e && e.stack || e); }
}
await browser.close(); server.close();
fs.writeFileSync(path.join(OUT, "test-results.json"), JSON.stringify({ results, repo: REPO }, null, 2));
console.log("\n" + results.filter(r => r.ok).length + " passed, " + results.filter(r => !r.ok).length + " failed");
process.exit(results.every(r => r.ok) ? 0 : 1);
