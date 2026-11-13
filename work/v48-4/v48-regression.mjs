/* v48 headless tests. Mock Supabase only — no production writes. */
import fs from "fs";
import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";

const OUT = "/workspace/time-lock/work/v48-4/regress-shots/v48";
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
}

const PRE_V48 = {
  catalogs: { contaminants: [
    { id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 5, defaultFlow: "2.0" },
    { id: "SIL", name: "Respirable silica", code: "SIL", kind: "airborne", headHint: "RESS", flowTolPct: 5, defaultFlow: "2.2" },
    { id: "NOISE", name: "Noise dose", code: "NOISE", kind: "noise" }
  ], pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
  projects: [{ id: "ptest", number: "0019321", name: "V48 upgrade test", source: "field", site: "Test pit" }],
  events: [
    { id: "eyest", projectId: "ptest", code: "0019321-001", type: "hygiene", date: "2026-11-11", stage: "planned", audit: [] },
    { id: "etoday", projectId: "ptest", code: "0019321-002", type: "hygiene", date: "2026-11-12", stage: "planned", audit: [] }
  ],
  trains: [
    { id: "tair", eventId: "etoday", pouch: "7", sampleNo: 7, trainKind: "airborne_personal", contaminantId: "INH",
      pumpSerial: "88473", startFlow: "2.0", endFlow: "1.8", rotameter: "R100", status: "ended",
      shiftDate: "2026-11-12", shiftKind: "day",
      startAt: "2026-11-12T00:00:00.000Z", endAt: "2026-11-12T06:00:00.000Z",
      person: { first: "Sam", last: "Tester", occupation: "Plant operator" },
      rpd: { worn: "", model: "", shaven: "", fit: "" }, hpd: { worn: "" },
      irsstCat: "3", seg: "4", occupationCode: "346000", locationCode: "210",
      comments: "upgrade fixture", audit: [] },
    { id: "tair-old", eventId: "eyest", pouch: "2", sampleNo: 2, trainKind: "airborne_personal", contaminantId: "INH",
      pumpSerial: "88473", startFlow: "2.0", endFlow: "2.0", rotameter: "R99", status: "ended",
      shiftDate: "2026-11-11", shiftKind: "day",
      startAt: "2026-11-11T00:00:00.000Z", endAt: "2026-11-11T06:00:00.000Z",
      person: { first: "Sam", last: "Tester" }, rpd: {}, hpd: {}, audit: [] },
    { id: "tnoise", eventId: "etoday", pouch: "3", sampleNo: 3, trainKind: "noise_personal", contaminantId: "NOISE",
      dosimeterSerial: "0019321-D1", status: "ended",
      shiftDate: "2026-11-12", shiftKind: "day",
      startAt: "2026-11-12T00:30:00.000Z", endAt: "2026-11-12T06:30:00.000Z",
      person: { first: "Sam", last: "Tester", occupation: "Plant operator" },
      rpd: {}, hpd: { worn: "yes", model: "3M" },
      irsstCat: "2", seg: "4", occupationCode: "346000", locationCode: "210",
      noise: { method: "dose", entry: "manual", badgeType: "4448 A", firmware: "1.2.3",
        values: { LAeq: { v: "84.9", src: "manual" }, LCpeak: { v: "103.8", src: "manual" }, LCeq: { v: "90.9", src: "manual" } },
        octave: {}, hpdAtt: [], spectrumPhoto: "kept-spectrum-ref" },
      audit: [] },
    { id: "tnoise-old", eventId: "eyest", pouch: "1", sampleNo: 1, trainKind: "noise_personal", contaminantId: "NOISE",
      dosimeterSerial: "0019321-D1", status: "ended",
      shiftDate: "2026-11-11", shiftKind: "day",
      startAt: "2026-11-11T00:30:00.000Z", endAt: "2026-11-11T06:30:00.000Z",
      person: { first: "Sam", last: "Tester" }, rpd: {}, hpd: {},
      noise: { method: "dose", entry: "manual", values: { LAeq: { v: "80" } }, octave: {}, hpdAtt: [] }, audit: [] }
  ],
  deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
};

const { server, base } = await serve();
const browser = await launch();
const errs = [];
const store = {};

async function boot(vpName) {
  const page = await browser.newPage();
  page.on("pageerror", e => errs.push(String(e)));
  await page.setViewport(VIEWPORTS[vpName].viewport);
  await page.setUserAgent(VIEWPORTS[vpName].ua);
  await page.setRequestInterception(true);
  mockSupabase(page, store);
  let acceptConfirm = true;
  const dialogs = [];
  page.on("dialog", async d => {
    dialogs.push(d.message());
    if (d.type() === "confirm") await (acceptConfirm ? d.accept() : d.dismiss());
    else await d.accept();
  });
  page._v48 = { dialogs, setAccept: v => { acceptConfirm = v; } };
  await page.goto(base + "/field.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(SESSION);
  await page.evaluate(data => {
    localStorage.setItem("envss-field-next-v32", JSON.stringify(data));
  }, PRE_V48);
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(800);
  try { await page.evaluate(() => window.v46Restore); } catch (e) {}
  await page.evaluate(data => {
    /* Re-apply the pre-v48 fixture after any first-visit IndexedDB restore, then persist. */
    db.projects = data.projects;
    db.events = data.events;
    db.trains = JSON.parse(JSON.stringify(data.trains));
    db.deletions = data.deletions || [];
    if (!db.catalogs) db.catalogs = {};
    const inh = (db.catalogs.contaminants || []).find(c => String(c.code || c.id).toUpperCase() === "INH");
    /* catalog INH tol is patched by the app; do not rewrite sample records */
    persist();
  }, PRE_V48);
  await sleep(200);
  return page;
}

async function shot(page, name, fullPage = false) {
  const f = path.join(OUT, name + ".png");
  await page.screenshot({ path: f, fullPage });
  return f;
}

// ---------- Chromebook viewport (primary logic tests) ----------
const page = await boot("chromebook");
const ver = await page.evaluate(() => ({ app: APP_VERSION, title: document.title, header: document.getElementById("appVersion")?.textContent, noise: window.ENVSS_NOISE && window.ENVSS_NOISE.version }));
check("version is 48.4", ver.app === "48.4" && /v48\.4/.test(ver.title || "") && ver.header === "v48.4", JSON.stringify(ver));
check("noise module is 48.0", ver.noise === "48.0", ver.noise);

const catalog = await page.evaluate(() => {
  const inh = db.catalogs.contaminants.find(c => c.code === "INH");
  const sil = db.catalogs.contaminants.find(c => c.code === "SIL");
  return { inhTol: inh && inh.flowTolPct, silTol: sil && sil.flowTolPct, inhFlow: inh && inh.defaultFlow };
});
check("REQ-009 catalog: stale INH 5% raised to 10 on load, SIL stays 5", catalog.inhTol === 10 && catalog.silTol === 5, JSON.stringify(catalog));

const flows = await page.evaluate(() => {
  const t = db.trains.find(x => x.id === "tair");
  const a = flowCheck(t); // end 1.8 vs set 2.0 = 10% — should be ok
  const low = flowCheck(Object.assign({}, t, { endFlow: "1.79" }));
  const hi = flowCheck(Object.assign({}, t, { endFlow: "2.2" }));
  const out = flowCheck(Object.assign({}, t, { endFlow: "2.21" }));
  const startOnly = flowCheck({ contaminantId: "INH", startFlow: "2.0", endFlow: "1.8" });
  const sil = flowCheck({ contaminantId: "SIL", startFlow: "2.2", endFlow: "2.0" }); // ~9% vs 5
  return { a, low, hi, out, startOnly, sil };
});
check("REQ-009 1.8 L/min at set 2.0 is within ±10%", flows.a.ok === true && flows.a.tol === 10 && Math.abs(flows.a.pct - 10) < 0.05, JSON.stringify(flows.a));
check("REQ-009 2.2 L/min at set 2.0 is within ±10%", flows.hi.ok === true, JSON.stringify(flows.hi));
check("REQ-009 1.79 L/min at set 2.0 is outside ±10%", flows.low.ok === false, JSON.stringify(flows.low));
check("REQ-009 2.21 L/min at set 2.0 is outside ±10%", flows.out.ok === false, JSON.stringify(flows.out));
check("REQ-009 SIL 2.0 vs set 2.2 still uses 5% and fails", flows.sil.ok === false && flows.sil.tol === 5, JSON.stringify(flows.sil));

await page.evaluate(() => openTrain("tair"));
await sleep(400);
const airUi = await page.evaluate(() => {
  const pouch = document.getElementById("pouch");
  const flowMsg = [...document.querySelectorAll("p")].map(p => p.textContent).find(t => /End flow is/.test(t)) || "";
  const rota = document.getElementById("rotameterAll");
  return {
    pouchValue: pouch && pouch.value,
    pouchRo: !!(pouch && (pouch.readOnly || pouch.disabled)),
    flowMsg: flowMsg.trim(),
    flowDanger: !!(flowMsg && /Outside tolerance/.test(flowMsg)),
    rotaText: rota ? rota.textContent.trim() : "",
    irsst: !!document.getElementById("irsst"),
    sampleNo: (db.trains.find(x => x.id === "tair") || {}).sampleNo,
    irsstCat: (db.trains.find(x => x.id === "tair") || {}).irsstCat
  };
});
check("REQ-029 sample number 7 shown read-only", airUi.pouchValue === "7" && airUi.pouchRo && airUi.sampleNo === 7, JSON.stringify(airUi));
check("REQ-009 UI: 1.8 vs 2.0 is within tolerance (no error)", /Within tolerance/.test(airUi.flowMsg) && !airUi.flowDanger && /set flow/.test(airUi.flowMsg), airUi.flowMsg);
check("REQ-026 rotameter button wording", airUi.rotaText === "Use this Rotameter for all airborne samples on this event.", airUi.rotaText);
check("airborne still has IRSST (only hidden on dose-badge)", airUi.irsst === true && airUi.irsstCat === "3", JSON.stringify({ irsst: airUi.irsst, cat: airUi.irsstCat }));
await shot(page, "chromebook-airborne-flow-ok-readonly-sample");

// collectTrain must not rewrite sample number or IRSST
const afterCollect = await page.evaluate(() => {
  const t = db.trains.find(x => x.id === "tair");
  const before = { sampleNo: t.sampleNo, pouch: t.pouch, irsstCat: t.irsstCat, comments: t.comments };
  const el = document.getElementById("pouch");
  if (el) { el.disabled = false; el.readOnly = false; el.value = "999"; }
  collectTrain(t);
  return { before, after: { sampleNo: t.sampleNo, pouch: t.pouch, irsstCat: t.irsstCat, comments: t.comments } };
});
check("REQ-029 collectTrain does not rewrite locked sample number", afterCollect.after.sampleNo === 7 && afterCollect.after.pouch === "7", JSON.stringify(afterCollect));
check("live data: IRSST on airborne still 3 after collect", afterCollect.after.irsstCat === "3", JSON.stringify(afterCollect.after));

// out-of-tol UI
await page.evaluate(() => {
  const t = db.trains.find(x => x.id === "tair");
  t.endFlow = "1.7";
  const el = document.getElementById("endFlow"); if (el) el.value = "1.7";
  collectTrain(t); render();
});
await sleep(300);
const outMsg = await page.evaluate(() => ([...document.querySelectorAll("p")].map(p => p.textContent).find(t => /End flow is/.test(t)) || "").trim());
check("REQ-009 UI: 1.7 vs 2.0 shows outside tolerance", /Outside tolerance/.test(outMsg) && /15/.test(outMsg), outMsg);
await shot(page, "chromebook-airborne-flow-outside");
await page.evaluate(() => { const t = db.trains.find(x => x.id === "tair"); t.endFlow = "1.8"; });

// clash: previous day should not warn; same shift should
const clash = await page.evaluate(() => {
  const today = db.trains.find(x => x.id === "tair");
  const pumpPrev = window.v40ClashHits("pumpSerial", "88473", today);
  // add a same-shift peer on another event same day
  const peer = { id: "tair-peer", eventId: "etoday", pouch: "8", sampleNo: 8, trainKind: "airborne_personal",
    pumpSerial: "88473", shiftDate: "2026-11-12", shiftKind: "day", status: "prepped",
    startAt: "2026-11-12T07:00:00.000Z", endAt: "2026-11-12T10:00:00.000Z" };
  db.trains.push(peer);
  const pumpSame = window.v40ClashHits("pumpSerial", "88473", today);
  const night = Object.assign({}, today, { id: "tmp-night", shiftKind: "night", shiftDate: "2026-11-12", startAt: "", endAt: "" });
  const pumpNight = window.v40ClashHits("pumpSerial", "88473", night);
  const noise = db.trains.find(x => x.id === "tnoise");
  const dosiPrev = window.v40ClashHits("dosimeterSerial", "0019321-D1", noise);
  const npeer = { id: "tnoise-peer", eventId: "etoday", pouch: "4", sampleNo: 4, trainKind: "noise_personal",
    dosimeterSerial: "0019321-D1", shiftDate: "2026-11-12", shiftKind: "day", status: "prepped",
    startAt: "2026-11-12T07:30:00.000Z", endAt: "2026-11-12T09:00:00.000Z" };
  db.trains.push(npeer);
  const dosiSame = window.v40ClashHits("dosimeterSerial", "0019321-D1", noise);
  return {
    pumpPrev: pumpPrev.map(x => x.id),
    pumpSame: pumpSame.map(x => x.id),
    pumpNight: pumpNight.map(x => x.id),
    dosiPrev: dosiPrev.map(x => x.id),
    dosiSame: dosiSame.map(x => x.id)
  };
});
check("REQ-028 pump used yesterday does not warn", clash.pumpPrev.length === 0, JSON.stringify(clash.pumpPrev));
check("REQ-028 pump on same shift/day does warn", clash.pumpSame.includes("tair-peer"), JSON.stringify(clash.pumpSame));
check("REQ-028 night shift same calendar day without overlap does not warn", clash.pumpNight.length === 0, JSON.stringify(clash.pumpNight));
check("REQ-028/NEW-B dosimeter used yesterday does not warn", clash.dosiPrev.length === 0, JSON.stringify(clash.dosiPrev));
check("REQ-028/NEW-B dosimeter on same shift/day does warn", clash.dosiSame.includes("tnoise-peer"), JSON.stringify(clash.dosiSame));

await page.evaluate(() => openTrain("tair"));
await sleep(400);
const clashUi = await page.evaluate(() => (document.getElementById("pumpClash") || {}).textContent || "");
check("REQ-028 pump clash UI mentions same shift/day", /same shift\/day/.test(clashUi) && /88473/.test(clashUi), clashUi);
await shot(page, "chromebook-pump-clash-same-shift");

// checkbox jump
await page.evaluate(() => { const t = db.trains.find(x => x.id === "tair"); t.methodOn = false; t.desiredVolumeL = ""; t.minMinutes = ""; render(); });
await sleep(300);
const jump = await page.evaluate(async () => {
  const el = document.getElementById("methodOn");
  if (!el) return { missing: true };
  el.scrollIntoView({ block: "center" });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const beforeY = window.scrollY;
  const beforeTop = el.getBoundingClientRect().top;
  el.click();
  await new Promise(r => setTimeout(r, 80));
  const afterEl = document.getElementById("methodOn");
  const afterY = window.scrollY;
  const afterTop = afterEl ? afterEl.getBoundingClientRect().top : null;
  const box = document.getElementById("methodBox");
  return { beforeY, afterY, beforeTop, afterTop, dy: afterY - beforeY, dTop: afterTop - beforeTop, boxShown: !!(box && box.style.display !== "none"), checked: !!(afterEl && afterEl.checked) };
});
check("REQ-017 method checkbox toggle does not jump scroll (>8px)", !jump.missing && Math.abs(jump.dy) <= 8 && Math.abs(jump.dTop) <= 8, JSON.stringify(jump));
check("REQ-017 method box still opens after toggle", jump.checked && jump.boxShown, JSON.stringify(jump));
await shot(page, "chromebook-checkbox-after-toggle");

// noise dose-badge UI + LAeq + hidden fields preserved
await page.evaluate(() => openTrain("tnoise"));
await sleep(500);
const nzUi = await page.evaluate(() => {
  const t = db.trains.find(x => x.id === "tnoise");
  const html = document.getElementById("nzPanel") ? document.getElementById("nzPanel").innerText : "";
  const headings = [...document.querySelectorAll("#nzPanel h3")].map(h => h.textContent);
  const labels = [...document.querySelectorAll("#nzPanel label")].map(l => l.textContent.trim());
  const required = [...document.querySelectorAll("#nzPanel .nz-req")].map(s => s.textContent);
  const q = (document.getElementById("qSummary") || {}).textContent || "";
  return {
    headings, labels, required, q, html: html.slice(0, 400),
    hasBadgeType: labels.some(l => /Badge type/i.test(l)),
    hasFirmware: labels.some(l => /Firmware/i.test(l)),
    hasLCeq: !!document.getElementById("nzLCeq") || labels.some(l => /LCeq/.test(l)),
    hasLAeq: !!document.getElementById("nzLAeq"),
    hasSpectrum: !!document.getElementById("nzSpectrum"),
    hasIrsst: !!document.getElementById("irsst"),
    stored: t.noise && { badgeType: t.noise.badgeType, firmware: t.noise.firmware, LCeq: (t.noise.values.LCeq || {}).v, spectrum: t.noise.spectrumPhoto, irsstCat: t.irsstCat, sampleNo: t.sampleNo },
    pouch: { value: (document.getElementById("pouch") || {}).value, ro: !!(document.getElementById("pouch") && (document.getElementById("pouch").readOnly || document.getElementById("pouch").disabled)) }
  };
});
check("REQ-012 heading 'Noise readings' hidden on dose badge", !nzUi.headings.some(h => /Noise readings/i.test(h)), JSON.stringify(nzUi.headings));
check("REQ-012 badge type and firmware hidden", !nzUi.hasBadgeType && !nzUi.hasFirmware, JSON.stringify({ labels: nzUi.labels }));
check("REQ-012 LCeq hidden, LAeq shown", !nzUi.hasLCeq && nzUi.hasLAeq, JSON.stringify({ hasLCeq: nzUi.hasLCeq, hasLAeq: nzUi.hasLAeq }));
check("REQ-012 spectrum prompt hidden", !nzUi.hasSpectrum, "spectrum=" + nzUi.hasSpectrum);
check("REQ-015 IRSST hidden on dose-badge SEG", !nzUi.hasIrsst, "irsst in DOM=" + nzUi.hasIrsst);
check("REQ-010 LAeq 'required' not shown when value present", !nzUi.required.includes("required"), JSON.stringify(nzUi.required));
check("stored hidden dose-badge values intact", nzUi.stored.badgeType === "4448 A" && nzUi.stored.firmware === "1.2.3" && nzUi.stored.LCeq === "90.9" && nzUi.stored.spectrum === "kept-spectrum-ref" && nzUi.stored.irsstCat === "2" && nzUi.stored.sampleNo === 3, JSON.stringify(nzUi.stored));
check("REQ-029 noise sample number 3 read-only", nzUi.pouch.value === "3" && nzUi.pouch.ro, JSON.stringify(nzUi.pouch));
await shot(page, "chromebook-dose-badge-hidden-fields");

// REQ-010 live: clear LAeq then type again
const laeqLive = await page.evaluate(async () => {
  const inp = document.getElementById("nzLAeq");
  if (!inp) return { missing: true };
  inp.value = "";
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 50));
  const reqEmpty = [...document.querySelectorAll("#nzPanel .nz-req")].map(s => s.textContent);
  inp.value = "85.1";
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 80));
  const reqFilled = [...document.querySelectorAll("#nzPanel .nz-req")].filter(s => s.style.display !== "none" && s.offsetParent !== null).map(s => s.textContent);
  inp.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  const q = (document.getElementById("qSummary") || {}).textContent || "";
  const v = (((db.trains.find(x => x.id === "tnoise") || {}).noise || {}).values || {}).LAeq;
  return { reqEmpty, reqFilled, q, v };
});
check("REQ-010 required appears when LAeq cleared", laeqLive.reqEmpty.includes("required"), JSON.stringify(laeqLive.reqEmpty));
check("REQ-010 required hides as soon as LAeq is typed", !laeqLive.reqFilled.includes("required"), JSON.stringify(laeqLive));
check("REQ-010 still-to-answer does not list LAeq after entry", !/LAeq/.test(laeqLive.q), laeqLive.q);

// confirm add
const nBefore = await page.evaluate(() => db.trains.length);
page._v48.setAccept(false);
await page.evaluate(() => { try { addTrain("etoday", "airborne_personal"); } catch (e) {} });
await sleep(200);
const nCancel = await page.evaluate(() => db.trains.length);
page._v48.setAccept(true);
await page.evaluate(() => addTrain("etoday", "airborne_personal"));
await sleep(400);
const added = await page.evaluate(() => {
  const t = db.trains[db.trains.length - 1];
  return { n: db.trains.length, kind: t.trainKind, sampleNo: t.sampleNo, pouch: t.pouch, dialogs: 0, current: document.getElementById("pouch") && document.getElementById("pouch").value };
});
check("REQ-002 cancel confirm does not add a sample", nCancel === nBefore, "before=" + nBefore + " after cancel=" + nCancel);
check("REQ-002 accept confirm adds a sample", added.n === nBefore + 1, JSON.stringify(added));
check("REQ-002 confirm wording", page._v48.dialogs.includes("Are you sure you want to add a new sample?"), JSON.stringify(page._v48.dialogs));
check("REQ-029 new sample gets next number (not A001) and is locked", added.sampleNo === 9 && added.pouch === "9" && added.current === "9", JSON.stringify(added));
await shot(page, "chromebook-new-sample-locked-number");

// IndexedDB second copy still uses envss-field-v46
await page.evaluate(() => { try { persist(); } catch (e) {} });
await sleep(600);
const idb = await page.evaluate(async () => {
  const names = (indexedDB.databases ? await indexedDB.databases() : []).map(d => d.name);
  const data = await new Promise((res, rej) => {
    const r = indexedDB.open("envss-field-v46", 1);
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const dbx = r.result;
      if (!dbx.objectStoreNames.contains("kv")) { res({ noStore: true, stores: [...dbx.objectStoreNames] }); return; }
      const tx = dbx.transaction("kv", "readonly");
      const q = tx.objectStore("kv").get("state");
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => rej(q.error);
    };
  });
  const air = data && data.db && (data.db.trains || []).find(x => x.id === "tair");
  const nz = data && data.db && (data.db.trains || []).find(x => x.id === "tnoise");
  return {
    names,
    hasV46: names.includes("envss-field-v46"),
    hasNewName: names.includes("envss-field-v48"),
    appVersionInSnap: data && data.appVersion,
    air: air && { sampleNo: air.sampleNo, irsstCat: air.irsstCat, endFlow: air.endFlow },
    nz: nz && { sampleNo: nz.sampleNo, badgeType: nz.noise && nz.noise.badgeType, LCeq: nz.noise && nz.noise.values && nz.noise.values.LCeq, irsstCat: nz.irsstCat }
  };
});
check("IndexedDB envss-field-v46 name unchanged (no v48 DB)", idb.hasV46 && !idb.hasNewName, JSON.stringify(idb.names));
check("IndexedDB backup holds existing sample numbers and hidden fields", idb.air && idb.air.sampleNo === 7 && idb.nz && idb.nz.sampleNo === 3 && idb.nz.badgeType === "4448 A" && idb.nz.LCeq && idb.nz.LCeq.v === "90.9" && idb.nz.irsstCat === "2", JSON.stringify(idb));

// Restore path: wipe localStorage KEY, keep IDB, reload
await page.evaluate(() => { localStorage.removeItem("envss-field-next-v32"); });
await page.reload({ waitUntil: "networkidle0" });
await sleep(1200);
const restored = await page.evaluate(async () => {
  const r = window.v46Restore ? await window.v46Restore : "no-fn";
  const t = db.trains.find(x => x.id === "tnoise");
  const a = db.trains.find(x => x.id === "tair");
  return { r, noiseNo: t && t.sampleNo, airNo: a && a.sampleNo, LCeq: t && t.noise && t.noise.values && t.noise.values.LCeq, badge: t && t.noise && t.noise.badgeType, app: APP_VERSION };
});
check("upgrade restore from IndexedDB keeps existing samples", restored.noiseNo === 3 && restored.airNo === 7 && restored.badge === "4448 A", JSON.stringify(restored));

await page.close();

// ---------- Pixel / Android viewport screenshots + a couple of UI checks ----------
const phone = await boot("pixel7");
await phone.evaluate(() => openTrain("tair"));
await sleep(400);
await shot(phone, "pixel7-airborne-flow-readonly", true);
await phone.evaluate(() => openTrain("tnoise"));
await sleep(500);
const phoneNz = await phone.evaluate(() => ({
  heading: [...document.querySelectorAll("#nzPanel h3")].map(h => h.textContent),
  required: [...document.querySelectorAll("#nzPanel .nz-req")].map(s => s.textContent),
  irsst: !!document.getElementById("irsst"),
  pouchRo: !!(document.getElementById("pouch") && (document.getElementById("pouch").readOnly || document.getElementById("pouch").disabled)),
  ver: document.getElementById("appVersion") && document.getElementById("appVersion").textContent
}));
check("pixel7: dose-badge hides heading and IRSST; sample no locked; no required", !phoneNz.heading.some(h => /Noise readings/i.test(h)) && !phoneNz.irsst && phoneNz.pouchRo && !phoneNz.required.includes("required") && phoneNz.ver === "v48.4", JSON.stringify(phoneNz));
await shot(phone, "pixel7-dose-badge", true);
await phone.close();

check("no page errors", errs.length === 0, errs.join(" | "));

const summary = { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results, errors: errs, at: new Date().toString() };
fs.writeFileSync("/workspace/time-lock/work/v48-4/v48-regression-results.json", JSON.stringify(summary, null, 2));
console.log("\n" + summary.passed + " passed, " + summary.failed + " failed");
await browser.close();
server.close();
process.exit(summary.failed ? 1 : 0);
