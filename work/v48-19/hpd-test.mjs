/* v48.19 HPD browser tests (optional hearing protection capture). Usage:
   ROOT=/workspace/envss-v4819-hpd OUT=/workspace/guard-shots/v4819 node work/v48-19/hpd-test.mjs [pixel7|chromebook]   (default: both)
   Supabase and Vision are mocked in memory and *.supabase.co is mapped to a dead local port: nothing reaches production.
   The "box" photos are drawn in the browser from made-up text (no manufacturer artwork). Fixture names are made up. */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
const OUT = process.env.OUT || "/workspace/guard-shots/v4819"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 700) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date());
const person = (first, last) => ({ first, last, sex: "male", sexSet: true, dob: "1985-03-04", dobD: "04", dobM: "03", dobY: "1985", occupation: "Fitter", company: "Acme Mining", hours: "12", daysOn: "8", daysOff: "6" });
const NZ = (id, ev, n, first, last, vals) => ({ id, eventId: ev, trainKind: "noise_personal", mode: "personal", sampleNo: n, pouch: String(n), contaminantId: "NOISE", dosimeterSerial: "D-" + id, fieldCalibrator: "59311", shiftDate: TODAY, status: "prepped", startAt: "", endAt: "", location: "Workshop", person: person(first, last), rpd: {}, hpd: {}, audit: [],
  noise: { method: "dose", entry: "typed", values: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { v: String(v), src: "typed" }])), octave: {}, hpdAtt: [] } });
function fixture() {
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }, { id: "NOISE", name: "Noise dose", code: "NOISE", kind: "noise" }], pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p19", number: "0019919", name: "v48.19 HPD test", source: "field", site: "Test site", client: "Acme Mining" }],
    events: [
      { id: "eN", projectId: "p19", code: "0019919-001", type: "hygiene", podioEventKind: "noise", podioJobTypes: ["NSEOC"], date: TODAY, stage: "planned", audit: [] },
      { id: "eA", projectId: "p19", code: "0019919-002", type: "hygiene", podioJobTypes: ["ACA", "NSED"], date: TODAY, stage: "planned", audit: [] },
      { id: "eD", projectId: "p19", code: "0019919-003", type: "hygiene", podioEventKind: "noise", podioJobTypes: ["NSED"], date: TODAY, stage: "planned", audit: [] },
      { id: "eH", projectId: "p19", code: "0019919-004", type: "hygiene", date: TODAY, stage: "planned", audit: [] },
      { id: "eF", projectId: "p19", code: "0019919-AFM-005", type: "fibre", date: TODAY, stage: "planned", rotameter: "FR4A40BNBN-NL-01", audit: [] }],
    trains: [
      NZ("n1", "eN", 1, "Noel", "Testone", { LAeq: 92.4, LCeq: 99.1, LCpeak: 141.2 }), NZ("n2", "eN", 2, "Pat", "Testtwo", { LAeq: 101.5 }), NZ("n3", "eN", 3, "Kim", "Testthree", {}),
      NZ("a1", "eA", 1, "Ann", "Aca", { LAeq: 88.1 }),
      NZ("d1", "eD", 1, "Dee", "Nsed", { LAeq: 90 }),
      { id: "h1", eventId: "eH", trainKind: "airborne_static", mode: "static", sampleNo: 1, pouch: "1", contaminantId: "INH", pumpSerial: "77001", headId: "IESS-1", mediaId: "C-1", startFlow: "2.0", endFlow: "", rotameter: "FR4A40BNBN-NL-02", shiftDate: TODAY, status: "prepped", location: "Bay 1", person: person("", ""), rpd: {}, hpd: {}, audit: [] }
    ], deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
  };
}
const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
const sbOpts = { fnStatus: 200, fnBody: { text: "" } };
const BOXES = {
  superfit: ["3M E-A-Rsoft", "SuperFit", "Disposable Earplugs", "Class 4  SLC80 24 dB", "AS/NZS 1270"],
  skull: ["3M E-A-R", "Skull Screws", "Reusable corded earplugs", "Class 5  SLC80 26 dB"],
  mystery: ["ACME QUIET", "Foam plugs", "Class 3"]
};
async function boxImage(page, name) {
  const b64 = await page.evaluate(lines => { const c = document.createElement("canvas"); c.width = 900; c.height = 1200; const x = c.getContext("2d"); x.fillStyle = "#e9e3cf"; x.fillRect(0, 0, 900, 1200); x.fillStyle = "#1a3d7c"; x.fillRect(0, 0, 900, 150);
    x.fillStyle = "#222"; x.font = "bold 84px sans-serif"; lines.forEach((l, i) => { x.font = (i === 1 ? "bold 120px" : "bold 70px") + " sans-serif"; x.fillText(l, 40, 330 + i * 150, 820); }); return c.toDataURL("image/jpeg", 0.85).split(",")[1]; }, BOXES[name]);
  const f = "/tmp/hpd-box-" + name + ".jpg"; fs.writeFileSync(f, Buffer.from(b64, "base64")); return f;
}
async function boot(vp) {
  const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage(); page.ctx = ctx; page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "warning" && /hpd/i.test(m.text())) page.errs.push(m.text()); });
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); page.store = {}; page.mlog = mockSupabase(page, page.store, sbOpts);
  page.on("request", r => { const u = r.url(); if (!u.startsWith(url) && !u.startsWith("data:") && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|\.supabase\.co\//.test(u)) ext.push(vp + " " + r.method() + " " + u.split("?")[0]); });
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  const fx = fixture(); await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); }, fx);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(d => { window.ENVSS_CONFIG.admins = ["field.test@envss.com.au"]; db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains)); db.catalogs = Object.assign(db.catalogs || {}, d.catalogs); persist(); }, fx);
  await sleep(200); return page;
}
const openEv = async (page, id) => { await page.evaluate(i => openEvent(i), id); await sleep(400); };
const EV = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(db.events.find(x => x.id === i))), id);
const shot = async (page, name, sel, idx) => { if (sel) await page.evaluate((s, i) => { const l = document.querySelectorAll(s); const e = i == null ? l[0] : (i < 0 ? l[l.length + i] : l[i]); if (e) { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -90); } }, sel, idx); await sleep(250); await page.screenshot({ path: path.join(OUT, name + ".png") }); };
const hasCard = page => page.evaluate(() => !!document.getElementById("hpdCard"));
async function upload(page, sel, files) { const h = await page.$(sel); await h.uploadFile(...files); await sleep(150); }

async function run(vp) {
  const tag = vp, page = await boot(vp);
  /* 1. where the card shows */
  await openEv(page, "eN"); check(vp + ": card on NSEOC event", await hasCard(page));
  await openEv(page, "eA"); check(vp + ": card on ACA-NSED event (job types ACA + NSED)", await hasCard(page));
  await openEv(page, "eD"); check(vp + ": card on NSED event", await hasCard(page));
  await openEv(page, "eH"); check(vp + ": no card on an airborne-only event", !(await hasCard(page)));
  await openEv(page, "eF"); check(vp + ": no card on an AFM (fibre) event", !(await hasCard(page)));

  /* 2. photograph a box: item is created at once, Vision suggests the product */
  await openEv(page, "eN");
  await shot(page, "hpd-" + tag + "-01-empty-card", "#hpdCard");
  sbOpts.fnBody = { text: BOXES.superfit.join("\n") };
  const f1 = await boxImage(page, "superfit"), f2 = await boxImage(page, "skull"), f3 = await boxImage(page, "mystery");
  await upload(page, '#hpdCard [data-hpd-file="new"]', [f1]); await sleep(1500);
  let ev = await EV(page, "eN");
  check(vp + ": photo creates one HPD item", ev.hpd && ev.hpd.items.length === 1 && ev.hpd.items[0].photos.length === 1, JSON.stringify(ev.hpd));
  check(vp + ": photo is in the shared photo store with the event path", /^p\/p19\/e\/eN\/t\/hpd_eN\/[0-9a-f-]+\.jpg$/.test(ev.hpd.items[0].photos[0].path), ev.hpd.items[0].photos[0].path);
  check(vp + ": Vision suggested 3M SuperFit and read Class 4 / 24 dB from the box", ev.hpd.items[0].ocr && ev.hpd.items[0].ocr.state === "ok" && ev.hpd.items[0].ocr.suggest.length > 0 && ev.hpd.items[0].ocr.printed.slc === 24 && ev.hpd.items[0].ocr.printed.cls === 4, JSON.stringify(ev.hpd.items[0].ocr));
  check(vp + ": suggestion button shown", await page.evaluate(() => /SuperFit/.test((document.querySelector(".hpd-sugbtn") || {}).innerText || "")));
  await shot(page, "hpd-" + tag + "-02-photo-suggestion", "#hpdCard");

  /* 3. accept the suggestion: Class and SLC80 fill; box values read from the photo */
  await page.click('.hpd-sugbtn'); await sleep(300);
  ev = await EV(page, "eN"); const it = ev.hpd.items[0];
  check(vp + ": accepting fills the library product", it.libId && /^HPD-/.test(it.libId));
  const txt = await page.evaluate(() => document.getElementById("hpdCard").innerText);
  check(vp + ": card shows Class 4, SLC80 24 dB, manufacturer value", /Class 4/.test(txt) && /SLC80 24 dB/.test(txt) && /manufacturer value|box values/.test(txt), txt.slice(0, 400));
  check(vp + ": box values prefilled from the photo and marked as read from the photo", it.boxSlc80 === "24" && it.boxClass === "4" && it.boxSrc === "ocr");
  await shot(page, "hpd-" + tag + "-03-product-picked", "#hpdCard");

  /* 4. a second photo of the same box (back panel) joins the same item */
  await upload(page, '#hpdCard [data-hpd-file="more"]', [f2]); await sleep(1200);
  ev = await EV(page, "eN");
  check(vp + ": another photo of the same box joins the item", ev.hpd.items.length === 1 && ev.hpd.items[0].photos.length === 2, ev.hpd.items.length + "/" + (ev.hpd.items[0] || {}).photos);
  check(vp + ": a second photo of the same box did not replace the product", ev.hpd.items[0].libId === it.libId);

  /* 5. box differs from the library: warning, box value wins */
  await page.evaluate(() => { const el = document.querySelector('#hpdCard [data-hpd-in="boxSlc80"]'); el.value = "27"; el.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(1300);
  const t2 = await page.evaluate(() => document.getElementById("hpdCard").innerText);
  check(vp + ": box value that differs from the library shows a warning", /box says 27 dB but the library has 24 dB/.test(t2), t2.slice(0, 600));
  check(vp + ": Class on the box (4, read from the photo) that does not fit 27 dB is called out", /Class 4 and 27 dB do not go together \(27 dB is Class 5\)/.test(t2), t2.slice(0, 700));

  /* 6. worn by + exposure check */
  await page.evaluate(() => { const b = [...document.querySelectorAll('#hpdCard [data-hpd="who"]')].find(x => /Testone/.test(x.innerText)); b.click(); }); await sleep(300);
  ev = await EV(page, "eN");
  check(vp + ": worn-by tick is saved against the sample id", eq(ev.hpd.items[0].appliesTo, ["n1"]), JSON.stringify(ev.hpd.items[0].appliesTo));
  await page.evaluate(() => { const d = document.querySelector("#hpdCard .hpd-exp"); if (d) d.open = true; });
  const t3 = await page.evaluate(() => (document.querySelector("#hpdCard .hpd-exp") || {}).innerText || "");
  check(vp + ": exposure check lists only the ticked person and uses LCeq − SLC80", /Noel Testone/.test(t3) && !/Pat Testtwo/.test(t3) && /LCeq 99.1 − SLC80 27 = 72.1/.test(t3), t3);
  check(vp + ": LCpeak 141 with a Class 5 box value is fine; 'Class 5 needed' not raised", !/Class 5 is needed\./.test(t3));
  await shot(page, "hpd-" + tag + "-04-box-values-exposure", "#hpdCard .hpd-item");
  await shot(page, "hpd-" + tag + "-04b-exposure-check-open", "#hpdCard .hpd-exp");

  /* 7. second product, typed, "Not in the list" */
  await upload(page, '#hpdCard [data-hpd-file="new"]', [f3]); await sleep(1500);
  ev = await EV(page, "eN");
  check(vp + ": second box becomes a second item (unidentified)", ev.hpd.items.length === 2 && !ev.hpd.items[1].libId);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#hpdCard [data-hpd="other"]')].pop(); b.click(); }); await sleep(300);
  await page.evaluate(() => { const el = [...document.querySelectorAll('#hpdCard [data-hpd-in="name"]')].pop(); el.value = "Acme Quiet foam plugs"; el.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(300);
  await page.evaluate(() => { const el = [...document.querySelectorAll('#hpdCard [data-hpd-in="boxClass"]')].pop(); el.value = "3"; el.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(1200);
  ev = await EV(page, "eN");
  check(vp + ": 'Not in the list' keeps the typed name and box class for the office", ev.hpd.items[1].other === true && ev.hpd.items[1].name === "Acme Quiet foam plugs" && ev.hpd.items[1].boxClass === "3" && !ev.hpd.items[1].libId, JSON.stringify(ev.hpd.items[1]));
  await shot(page, "hpd-" + tag + "-05-not-in-list", "#hpdCard .hpd-item", 1);

  /* 8. type-ahead search on a typed-only item */
  await page.evaluate(() => document.querySelector('#hpdCard [data-hpd="typed"]').click()); await sleep(300);
  await page.evaluate(() => { const el = [...document.querySelectorAll('#hpdCard [data-hpd-in="q"]')].pop(); el.value = "sparkpl"; el.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(300);
  const rowTxt = await page.evaluate(() => (document.querySelector("#hpdCard .hpd-resrow") || {}).innerText || "");
  check(vp + ": typing 'sparkpl' lists Moldex SparkPlugs with Class 5 · 29 dB", /Moldex SparkPlugs/.test(rowTxt) && /Class 5 · 29 dB/.test(rowTxt), rowTxt);
  await shot(page, "hpd-" + tag + "-06-search", "#hpdCard .hpd-item", -1);
  await page.evaluate(() => document.querySelector('#hpdCard .hpd-resrow').click()); await sleep(300);
  ev = await EV(page, "eN");
  check(vp + ": typed-only item picks a library product (no photo needed)", ev.hpd.items[2].libId && ev.hpd.items[2].photos.length === 0);

  /* 9. never blocks: unidentified items present, Mark event complete / Create COC flow shows no HPD prompt */
  const before = page.dialogs.length;
  const gate = await page.evaluate(() => { try { const ts = trainsOf("eN"); const items = ts.flatMap(t => (typeof answerItems === "function" ? answerItems(t) : [])); return items.some(i => /onsite/i.test(i.label + " " + i.key) || /^hpdOnsite/.test(i.key)); } catch (e) { return "err " + e; } });
  check(vp + ": HPD is not in any sample's follow-up list (answerItems)", gate === false, gate);
  await page.evaluate(() => { try { markEventUpload("eN"); } catch (e) { window.__mErr = String(e); } }); await sleep(500);
  const prompts = page.dialogs.slice(before).concat(await page.evaluate(() => [...document.querySelectorAll(".modal,[role=dialog],.v483-modal,.g19-modal")].map(m => m.innerText)));
  check(vp + ": Mark event complete never mentions hearing protection", !prompts.some(p => /hearing protect|HPD/i.test(p)), JSON.stringify(prompts).slice(0, 300));

  /* 10. Drive name for the event-level photo */
  const drv = await page.evaluate(() => (window.envssDrive ? envssDrive.items().filter(i => i.photoType === "hpd").map(i => ({ f: i.fileName, s: i.sampleId, st: i.status, job: i.jobNumber })) : []));
  check(vp + ": photos queue for Drive as <event>_hpd_photo_<n>.jpg", drv.length >= 3 && drv.some(d => d.f === "0019919-001_hpd_photo_1.jpg") && drv.some(d => d.f === "0019919-001_hpd_photo_2.jpg") && drv.every(d => d.job === "0019919"), JSON.stringify(drv));
  ev = await EV(page, "eN");
  check(vp + ": uploaded flag is set on the event's photo reference", ev.hpd.items[0].photos.every(p => p.uploaded === true), JSON.stringify(ev.hpd.items[0].photos.map(p => p.uploaded)));

  /* 11. event syncs with the HPD data (no SQL needed: it rides in the envss_events payload) */
  await sleep(3500);
  const row = page.store.envss_events && [...page.store.envss_events.values()].find(r => r.id === "eN");
  check(vp + ": event row pushed to Supabase carries hpd inside the payload", !!(row && row.payload && row.payload.hpd && row.payload.hpd.items.length === 3), row ? JSON.stringify(Object.keys(row.payload || {})) : "no row");

  /* 12. sample screen: pick from the onsite list fills the worker's own HPD fields */
  await page.evaluate(() => openTrain("n2")); await sleep(500);
  await page.evaluate(() => { const b = document.querySelector('[data-yn="hpd"] [data-v="yes"], [data-yn-field="hpd"][data-v="yes"]'); if (b) b.click(); else { const t = db.trains.find(x => x.id === "n2"); t.hpdAsked = "yes"; t.hpd = { worn: "yes" }; render(); } }); await sleep(400);
  const hasPick = await page.evaluate(() => !!document.getElementById("hpdPickSel"));
  check(vp + ": sample screen offers 'Pick from the onsite HPD list'", hasPick);
  if (hasPick) {
    await page.evaluate(() => { const s = document.getElementById("hpdPickSel"); s.value = s.options[1].value; s.dispatchEvent(new Event("change", { bubbles: true })); }); await sleep(600);
    const t = await page.evaluate(() => JSON.parse(JSON.stringify(db.trains.find(x => x.id === "n2").hpd)));
    check(vp + ": picking fills model, style and class on the sample", /SuperFit/.test(t.model || "") && /earplug/i.test(t.style || "") && /Class 5/.test(t.classRating || "") && /SLC80 27/.test(t.classRating || ""), JSON.stringify(t));
    await shot(page, "hpd-" + tag + "-07-sample-pick", "#hpdPick");
  }

  /* 13. None onsite (a different event) + undo */
  await openEv(page, "eD");
  await page.evaluate(() => document.querySelector('#hpdCard [data-hpd="none"]').click()); await sleep(300);
  ev = await EV(page, "eD");
  check(vp + ": None onsite is saved", ev.hpd && ev.hpd.status === "none_onsite" && ev.hpd.items.length === 0);
  await shot(page, "hpd-" + tag + "-08-none-onsite", "#hpdCard");
  await page.evaluate(() => document.querySelector('#hpdCard [data-hpd="undonone"]').click()); await sleep(300);
  ev = await EV(page, "eD"); check(vp + ": None onsite can be undone", ev.hpd.status === "");

  /* 14. Vision not set up / unavailable: photo is kept, picker stays, nothing breaks */
  sbOpts.fnStatus = 503; sbOpts.fnBody = { error: "OCR_NOT_CONFIGURED", message: "OCR not set up yet, enter manually" };
  await openEv(page, "eA");
  await upload(page, '#hpdCard [data-hpd-file="new"]', [f1]); await sleep(1500);
  ev = await EV(page, "eA");
  check(vp + ": Vision unavailable: photo kept, state 'unavailable', no suggestion", ev.hpd.items.length === 1 && ev.hpd.items[0].ocr.state === "unavailable" && ev.hpd.items[0].photos.length === 1, JSON.stringify(ev.hpd.items[0].ocr));
  check(vp + ": picker still offered", await page.evaluate(() => !!document.querySelector('#hpdCard [data-hpd-in="q"]')));
  await shot(page, "hpd-" + tag + "-09-ocr-unavailable", "#hpdCard");
  sbOpts.fnStatus = 200; sbOpts.fnBody = { text: "" };

  /* 15. offline: photo saved, OCR skipped */
  await openEv(page, "eD");
  await page.setOfflineMode(true); await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await upload(page, '#hpdCard [data-hpd-file="new"]', [f1]); await sleep(1500);
  ev = await EV(page, "eD");
  check(vp + ": offline: photo kept, reading skipped", ev.hpd.items.length === 1 && ev.hpd.items[0].photos.length === 1 && ev.hpd.items[0].ocr && ev.hpd.items[0].ocr.state === "offline", JSON.stringify(ev.hpd.items[0].ocr));
  await page.setOfflineMode(false);

  /* 16. remove an HPD discards its photos; audit entries are on the event */
  await openEv(page, "eN");
  await page.evaluate(() => [...document.querySelectorAll('#hpdCard [data-hpd="rm"]')].pop().click()); await sleep(300);
  ev = await EV(page, "eN");
  check(vp + ": remove drops the item", ev.hpd.items.length === 2);
  check(vp + ": event audit has HPD entries", ev.audit.filter(a => a.field === "hpd").length >= 6, ev.audit.length);

  check(vp + ": no page errors", page.errs.length === 0, page.errs.join(" | "));
  await page.ctx.close();
}
const only = process.argv[2];
for (const vp of only ? [only] : ["pixel7", "chromebook"]) await run(vp);
check("no requests left the box (only the local server, CDN fonts, mocked Supabase)", ext.length === 0, ext.join(" | "));
await browser.close(); server.close();
const fails = results.filter(r => !r.ok).length;
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "hpd-browser-results.json"), JSON.stringify({ at: new Date().toISOString(), total: results.length, failed: fails, results }, null, 1));
console.log(fails ? fails + " FAILED" : "ALL " + results.length + " PASSED"); process.exit(fails ? 1 : 0);
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
