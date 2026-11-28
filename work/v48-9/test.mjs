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
  /* v48.18: each boot is its own browser context so the second-tab lock does not make later pages read-only. */
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage(); page._envssCtx = ctx;
  const _close = page.close.bind(page);
  page.close = async function () { try { await _close(); } finally { try { await ctx.close(); } catch (e) {} } };
  page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
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
  check(`[${vp}] app is v48.19 with fit-test module`, await page.evaluate(() => APP_VERSION === "48.19" && document.getElementById("appVersion").textContent === "v48.19" && document.title === "ENVSS Field v48.19" && !!(window.envssFit && envssFit.parseReport)), await page.evaluate(() => ({ v: APP_VERSION, t: document.title, fit: !!(window.envssFit) })));

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

  const helpUi = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const addHelp = ((document.getElementById("fitAddReport") || {}).closest(".fit-action") || {}).innerText || "";
    const manHelp = ((document.getElementById("fitAddManual") || {}).closest(".fit-action") || {}).innerText || "";
    const markHelp = ((document.getElementById("fitMarkComplete") || {}).closest(".fit-action") || {}).innerText || "";
    return {
      add: /Photograph the PortaCount printout/.test(addHelp) && /person who was tested signs/.test(addHelp),
      man: /Type the report fields yourself/.test(manHelp),
      mark: /Once all fit tests are done/.test(markHelp) && /every report is signed/.test(markHelp),
      page: /Enter manually opens a blank form/.test(text) && /does not read a photo/.test(text),
      incomplete: ((document.getElementById("fitIncomplete") || {}).textContent || ""),
      ids: !!(document.getElementById("fitManualHelp") && document.getElementById("fitIncomplete") && document.getElementById("fitEventActions"))
    };
  });
  check(`[${vp}] event buttons have helper lines and Enter manually is explained on the page`, helpUi.add && helpUi.man && helpUi.mark && helpUi.page && helpUi.ids && /Add and sign at least one fit-test report/.test(helpUi.incomplete), JSON.stringify(helpUi));
  const shotDir = "/workspace/guard-shots/v4819";
  fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, `fit-${vp}-event.png`), fullPage: true });

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
  await page.screenshot({ path: path.join(shotDir, `fit-${vp}-manual-confirm.png`), fullPage: true });

  await page.evaluate(() => {
    document.getElementById("fitLast").value = "Breed";
    document.getElementById("fitFirst").value = "John";
    document.getElementById("fitModel").value = "Aura 9322A+";
    document.getElementById("fitTestDate").value = "25/11/2026";
    document.getElementById("fitResult").value = "PASS";
    document.getElementById("fitPassLevel").value = "100";
    document.getElementById("fitOverallFf").value = "200+";
  });
  /* Persist the typed fields, return to the event, and check unsigned reports are listed and block complete. */
  await page.evaluate(() => {
    const r = (db.fitReports || [])[0];
    if (r) {
      r.lastName = "Breed"; r.firstName = "John"; r.model = "Aura 9322A+";
      r.testDateDisplay = "25/11/2026"; r.result = "PASS"; r.passLevel = "100"; r.overallFf = "200+";
    }
    persist();
    view.fitScreen = ""; view.fitReportId = "";
    openEvent("eFit");
  });
  await sleep(400);
  const incomplete = await page.evaluate(() => (document.getElementById("fitIncomplete") || {}).textContent || "");
  check(`[${vp}] unsigned reports are listed on the event before complete is allowed`, /Not yet complete/.test(incomplete) && /Breed, John/.test(incomplete) && /Aura 9322A\+/.test(incomplete), incomplete);
  await page.screenshot({ path: path.join(shotDir, `fit-${vp}-event-incomplete.png`), fullPage: true });
  page.dialogs.length = 0;
  await page.evaluate(() => { const b = document.getElementById("fitMarkComplete"); if (b) b.click(); });
  await sleep(300);
  const blocked = page.dialogs.join("\n");
  const stillOpen = await page.evaluate(() => !eventById("eFit").uploadReady);
  check(`[${vp}] mark complete is blocked and names the unsigned report`, stillOpen && /cannot be marked complete until every report is signed/i.test(blocked) && /Breed, John/.test(blocked) && /Aura 9322A\+/.test(blocked), blocked + " ready=" + !stillOpen);
  await page.evaluate(() => {
    const row = document.querySelector("[data-fit-open]");
    if (row) row.click();
  });
  await sleep(400);
  await page.evaluate(() => { const b = document.getElementById("fitToSign"); if (b) b.scrollIntoView({ block: "center" }); });
  await sleep(200);
  await page.evaluate(() => { const b = document.getElementById("fitToSign"); if (b) b.click(); });
  await sleep(600);
  const onSign = await page.evaluate(() => {
    const body = document.body.innerText || "";
    return {
      client: !!document.getElementById("fitSigClient"),
      noTechPad: !document.getElementById("fitSigTech"),
      card: !!document.getElementById("fitTechSignOff"),
      name: /V46 Test/.test(body),
      email: /field\.test@envss\.com\.au/.test(body),
      person: /Person tested/.test(body),
      auto: /filled in from your ENVSS sign-in/.test(body)
    };
  });
  check(`[${vp}] continue opens only the individual’s signature pad and shows the electronic tech sign-off`, onSign.client && onSign.noTechPad && onSign.card && onSign.name && onSign.email && onSign.person && onSign.auto, JSON.stringify(onSign) + (await page.evaluate(() => document.getElementById("fitConfirm") ? " still on confirm" : "")));
  if (!onSign.client) return;
  await page.evaluate(() => { try { window.scrollTo(0, 0); } catch (e) {} });
  await sleep(200);
  await shot(page, "03-signatures");
  await page.screenshot({ path: path.join(OUT, `${vp}-03-signatures-full.png`), fullPage: true });

  await signPad(page, "#fitSigClient");
  // Programmatic strokes as a fallback if the headless mouse did not mark the pad dirty.
  await page.evaluate(() => {
    const c = document.getElementById("fitSigClient"); if (!c) return;
    const ev = (type, x, y) => c.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons: 1 }));
    const r = c.getBoundingClientRect();
    ev("mousedown", r.left + 10, r.top + 10);
    ev("mousemove", r.left + 80, r.top + 40);
    ev("mouseup", r.left + 80, r.top + 40);
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
    return { signed: !!r.signedAt, name: r.pdfName || "", result: r.result, last: r.lastName, evStage: deriveEventStage(eventById("eFit")), n: (db.fitReports || []).length, pdfLib: !!(window.PDFLib),
      tech: r.techSignOff || null, sigTech: !!(r.sigTech), sigClient: !!(r.sigClient), isSigned: !!(envssFit.isReportSigned && envssFit.isReportSigned(r)) };
  });
  check(`[${vp}] signed PDF is named Surname_First_Model_DD-MM-YYYY.pdf`, afterPdf.signed && afterPdf.name === "Breed_John_Aura-9322A_25-11-2026.pdf" && afterPdf.result === "PASS", JSON.stringify(afterPdf) + " dialogs=" + JSON.stringify(page.dialogs));
  check(`[${vp}] payload stores tech sign-off from the signed-in account and no tech pad image`, !!(afterPdf.tech && afterPdf.tech.name === "V46 Test" && afterPdf.tech.email === "field.test@envss.com.au" && afterPdf.tech.signedAt && afterPdf.signed && !afterPdf.sigTech && afterPdf.sigClient && afterPdf.isSigned), JSON.stringify(afterPdf.tech) + " sigTech=" + afterPdf.sigTech);
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
  const noIncomplete = await page.evaluate(() => !document.getElementById("fitIncomplete"));
  check(`[${vp}] incomplete list is gone once every report is signed`, noIncomplete, await page.evaluate(() => (document.getElementById("fitIncomplete") || {}).textContent || ""));
  await page.screenshot({ path: path.join(shotDir, `fit-${vp}-event-complete.png`), fullPage: true });

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
  await signPad(page3, "#fitSigClient");
  await page3.evaluate(() => {
    const c = document.getElementById("fitSigClient"); if (!c) return;
    const ev = (type, x, y) => c.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons: 1 }));
    const r = c.getBoundingClientRect();
    ev("mousedown", r.left + 10, r.top + 10);
    ev("mousemove", r.left + 80, r.top + 40);
    ev("mouseup", r.left + 80, r.top + 40);
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
  const signedFlat = signedLine.replace(/\s+/g, " ");
  check(`[${vp}] signed PDF has the electronic tech sign-off, not a handwritten technician mark`, /Electronically signed by V46 Test \(field\.test@envss\.com\.au\)/.test(signedFlat) && /\d{2}\/\d{2}\/2026 \d{2}:\d{2} AWST/.test(signedFlat) && /V46 Test/.test(signedFlat), signedFlat.slice(signedFlat.lastIndexOf("FITTEST OPERATOR")));
  await page3.close();

  /* Direct PDF cases: email-only sign-off, and an older report that already has a technician pad image. */
  const page4 = await boot(vp, { status: 503, body: { error: "OCR_NOT_CONFIGURED", message: "OCR not set up yet, enter manually" } });
  const cases = await page4.evaluate(async () => {
    const ev = eventById("eFit");
    function base() {
      const r = envssFit.blankReport(ev);
      r.lastName = "Breed"; r.firstName = "John"; r.model = "Aura 9322A+";
      r.testDateDisplay = "25/11/2026"; r.result = "PASS"; r.operator = "EA";
      r.signedAt = "2026-11-26T03:05:00.000Z";
      const c = document.createElement("canvas"); c.width = 200; c.height = 80;
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 200, 80);
      x.strokeStyle = "#111"; x.lineWidth = 3; x.beginPath(); x.moveTo(10, 50); x.quadraticCurveTo(80, 10, 190, 40); x.stroke();
      r.sigClient = c.toDataURL("image/png");
      return { r, pad: c.toDataURL("image/png") };
    }
    const emailOnly = base();
    emailOnly.r.techSignOff = { name: "", email: "solo@envss.com.au", signedAt: "2026-11-26T03:05:00.000Z", source: "google" };
    const emailPdf = await envssFit.buildReportPdf(emailOnly.r, { signed: true });
    const legacy = base();
    legacy.r.sigTech = legacy.pad;
    const legacyPdf = await envssFit.buildReportPdf(legacy.r, { signed: true });
    const flags = {
      clientOnly: envssFit.isReportSigned({ sigClient: "x", signedAt: "t" }),
      bothPads: envssFit.isReportSigned({ sigTech: "x", sigClient: "x" }),
      techOnly: envssFit.isReportSigned({ sigTech: "x", signedAt: "t" }),
      blank: envssFit.isReportSigned({}),
      line: envssFit.techSignOffLine({ name: "", email: "solo@envss.com.au", signedAt: "2026-11-26T03:05:00.000Z" }),
      awst: envssFit.formatAwst("2026-11-26T03:05:00.000Z")
    };
    function b64(bytes, name) {
      const u = new Uint8Array(bytes);
      let s = ""; const step = 0x8000;
      for (let i = 0; i < u.length; i += step) s += String.fromCharCode.apply(null, u.subarray(i, i + step));
      return { name, b64: btoa(s), bytes: u.length };
    }
    /* buildReportPdf returns blob, not raw bytes — read the blob */
    return {
      flags,
      email: { name: emailPdf.name, bytes: emailPdf.bytes, b64: await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.readAsDataURL(emailPdf.blob); }) },
      legacy: { name: legacyPdf.name, bytes: legacyPdf.bytes, b64: await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.readAsDataURL(legacyPdf.blob); }) }
    };
  });
  function writePdf(name, b64) {
    const dest = path.join(OUT, `${vp}-${name}.pdf`);
    fs.writeFileSync(dest, Buffer.from(b64, "base64"));
    return dest;
  }
  const emailPath = writePdf("email-only-signoff", cases.email.b64);
  const legacyPath = writePdf("legacy-tech-pad", cases.legacy.b64);
  const emailText = execSync("pdftotext -layout " + JSON.stringify(emailPath) + " -", { encoding: "utf8" });
  const legacyText = execSync("pdftotext -layout " + JSON.stringify(legacyPath) + " -", { encoding: "utf8" });
  execSync("pdftoppm -png -r 140 " + JSON.stringify(emailPath) + " " + JSON.stringify(path.join(OUT, vp + "-08-email-only-pdf")));
  execSync("pdftoppm -png -r 140 " + JSON.stringify(legacyPath) + " " + JSON.stringify(path.join(OUT, vp + "-09-legacy-tech-pdf")));
  const emailFlat = emailText.replace(/\s+/g, " ");
  check(`[${vp}] isReportSigned: individual + signedAt, or legacy both pads; not tech-only`, cases.flags.clientOnly && cases.flags.bothPads && !cases.flags.techOnly && !cases.flags.blank && cases.flags.awst === "26/11/2026 11:05 AWST" && /Electronically signed by solo@envss\.com\.au 26\/11\/2026 11:05 AWST/.test(cases.flags.line), JSON.stringify(cases.flags));
  check(`[${vp}] PDF falls back to the email when no sign-in name is stored`, /Electronically signed by solo@envss\.com\.au/.test(emailFlat) && /26\/11\/2026 11:05 AWST/.test(emailFlat) && /solo@envss\.com\.au/.test(emailFlat) && !/Electronically signed by \(/.test(emailFlat), emailFlat.slice(emailFlat.lastIndexOf("FITTEST OPERATOR")));
  check(`[${vp}] older report with a technician pad image still renders that image and has no electronic sign-off line`, /FITTEST OPERATOR/.test(legacyText) && !/Electronically signed by/.test(legacyText) && /EA/.test(legacyText), legacyText.slice(legacyText.indexOf("FITTEST OPERATOR"), legacyText.indexOf("FITTEST OPERATOR") + 400));
  await page4.close();

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
