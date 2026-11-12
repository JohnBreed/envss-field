/* v48.2: v48.1 flow-reference tests against the AFM build. Supabase mocked; no production writes. Live data is a read-only SELECT export. */
import fs from "fs"; import path from "path"; import http from "http";
import { launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
const NEW = "/workspace/afm-build", OLD = "/workspace/v48-1-publish/main-4ed7b3b";
const OUT = "/tmp/v482-shots";
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : "")); }
async function serve(root) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let p = path.join(root, decodeURIComponent(url.pathname)); if (url.pathname === "/") p = path.join(root, "field.html");
    fs.readFile(p, (err, buf) => { if (err) { res.writeHead(404); res.end("missing"); return; }
      const ext = path.extname(p); const type = ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : ext === ".svg" ? "image/svg+xml" : ext === ".css" ? "text/css" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(buf); });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { server, base: "http://127.0.0.1:" + server.address().port };
}
const H = 3600e3, now = Date.now();
const iso = ms => new Date(ms).toISOString();
function tr(id, eventId, no, c, sf, ef, extra = {}) {
  return Object.assign({ id, eventId, pouch: String(no), sampleNo: no, trainKind: "airborne_personal", contaminantId: c, pumpSerial: "9" + String(1000 + no),
    startFlow: sf, endFlow: ef, status: "ended", shiftDate: "2026-11-13", shiftKind: "day", startAt: iso(now - 7 * H), endAt: iso(now - 1 * H),
    person: { first: "Test", last: "Person" + no }, rpd: {}, hpd: {}, comments: "", audit: [] }, extra);
}
const FIX = {
  projects: [{ id: "p481", number: "0019999", name: "v48.1 flow test", source: "field", site: "Test" }],
  events: [
    { id: "e481", projectId: "p481", code: "0019999-001", type: "hygiene", date: "2026-11-13", stage: "planned", audit: [] },
    { id: "e481f", projectId: "p481", code: "0019999-AFM-001", type: "fibre", date: "2026-11-13", stage: "planned", audit: [] }
  ],
  trains: [
    tr("res-ok", "e481", 1, "RES", "3.0", "3.1"),
    tr("res-out", "e481", 2, "RES", "3.0", "3.2"),
    tr("asb-ok", "e481", 3, "ASB", "2.0", "2.05"),
    tr("inh-ok", "e481", 4, "INH", "2.0", "2.2"),
    tr("inh-out", "e481", 5, "INH", "2.0", "2.21"),
    tr("dp-ok", "e481", 6, "DP", "2.0", "2.0"),
    tr("res-nostart", "e481", 7, "RES", "", "3.0"),
    tr("sil-ok", "e481", 8, "SIL", "3.0", "3.15"),
    tr("res-run", "e481", 9, "RES", "3.0", "", { status: "running", endAt: "" }),
    tr("res-run-ns", "e481", 10, "RES", "", "", { status: "running", endAt: "" }),
    tr("afm-ok", "e481f", 1, "ASB", "2.0", "2.05", { trainKind: "fibre_static", cowlNo: "11850" }),
    tr("afm-ns", "e481f", 2, "ASB", "", "2.0", { trainKind: "fibre_static", cowlNo: "11851" })
  ],
  deletions: [], hires: []
};
const live = JSON.parse(fs.readFileSync("/workspace/v48-1-publish/live-airborne-export.json", "utf8"));
const browser = await launch();
const errs = [];
async function boot(base, vp) {
  const page = await browser.newPage();
  page.on("pageerror", e => errs.push(vp + ": " + String(e)));
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); mockSupabase(page, {});
  page.on("dialog", d => d.accept().catch(() => {}));
  await page.goto(base + "/field.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(SESSION);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(f => { db.projects = (db.projects || []).concat(f.projects); db.events = (db.events || []).concat(f.events); db.trains = (db.trains || []).concat(JSON.parse(JSON.stringify(f.trains))); persist(); }, FIX);
  return page;
}
const msg = () => [...document.querySelectorAll("p")].map(p => p.textContent.trim()).filter(t => /End flow is|No start flow recorded/.test(t)).join(" || ");
const neu = await serve(NEW), old = await serve(OLD);
let liveNew = null, liveOld = null;
for (const vp of ["chromebook", "pixel7"]) {
  const page = await boot(neu.base, vp);
  const ver = await page.evaluate(() => ({ app: APP_VERSION, title: document.title, header: document.getElementById("appVersion")?.textContent }));
  check(`[${vp}] version 48.2`, ver.app === "48.2" && ver.title === "ENVSS Field v48.2" && ver.header === "v48.2", JSON.stringify(ver));
  const sw = await page.evaluate(async () => { const r = await fetch("sw-field.js", { cache: "no-store" }); const s = await r.text(); return (s.match(/const CACHE = "([^"]+)"/) || [])[1]; });
  check(`[${vp}] sw cache envss-field-v48-2`, sw === "envss-field-v48-2", sw);
  const fc = await page.evaluate(() => Object.fromEntries(db.trains.filter(t => t.eventId === "e481" || t.eventId === "e481f").map(t => [t.id, flowCheck(t)])));
  const d = k => JSON.stringify(fc[k]);
  check(`[${vp}] respirable 3.0→3.1 ok (vs own start 3.0, not 2.2)`, fc["res-ok"].ok && fc["res-ok"].set === 3 && fc["res-ok"].tol === 5, d("res-ok"));
  check(`[${vp}] respirable 3.0→3.2 outside ±5%`, !fc["res-out"].ok && fc["res-out"].tol === 5 && Math.abs(fc["res-out"].pct - 6.667) < 0.01, d("res-out"));
  check(`[${vp}] asbestos 2.0→2.05 ok (vs own 2.0, not 1.0)`, fc["asb-ok"].ok && fc["asb-ok"].set === 2, d("asb-ok"));
  check(`[${vp}] AFM fibre 2.0→2.05 ok`, fc["afm-ok"].ok && fc["afm-ok"].set === 2, d("afm-ok"));
  check(`[${vp}] INH 2.0→2.2 ok (±10%)`, fc["inh-ok"].ok && fc["inh-ok"].tol === 10, d("inh-ok"));
  check(`[${vp}] INH 2.0→2.21 outside ±10%`, !fc["inh-out"].ok && fc["inh-out"].tol === 10, d("inh-out"));
  check(`[${vp}] diesel 2.0→2.0 ok (vs own 2.0, not 2.2)`, fc["dp-ok"].ok && fc["dp-ok"].pct === 0, d("dp-ok"));
  check(`[${vp}] SIL 3.0→3.15 ok (5.0%, edge inclusive)`, fc["sil-ok"].ok && fc["sil-ok"].tol === 5, d("sil-ok"));
  check(`[${vp}] no start flow → soft note (ok, noStart), not reject`, fc["res-nostart"].ok === true && fc["res-nostart"].noStart === true && fc["res-nostart"].set === 2.2, d("res-nostart"));
  check(`[${vp}] AFM no start flow → soft note`, fc["afm-ns"].ok === true && fc["afm-ns"].noStart === true, d("afm-ns"));
  check(`[${vp}] running without end flow → no message`, fc["res-run"].ok && fc["res-run"].pct == null && !fc["res-run"].noStart, d("res-run"));
  const cat = await page.evaluate(() => ({ inh: contam("INH").flowTolPct, sil: contam("SIL").flowTolPct, res: contam("RES").flowTolPct }));
  check(`[${vp}] catalog: INH 10% merge kept, RES/SIL 5%`, cat.inh === 10 && cat.res == 5 && cat.sil == 5, JSON.stringify(cat));
  // UI
  const ui = {};
  for (const id of ["res-ok", "res-out", "res-nostart", "afm-ok", "afm-ns", "inh-out"]) {
    await page.evaluate(id => openTrain(id), id); await sleep(350);
    ui[id] = await page.evaluate(msg);
    if (vp === "chromebook" || id === "res-ok" || id === "res-nostart") await page.screenshot({ path: path.join(OUT, `${vp}-${id}.png`), fullPage: true });
  }
  check(`[${vp}] UI res 3.0→3.1 'Within tolerance', 3.0 L/min shown`, /Within tolerance/.test(ui["res-ok"]) && /\(3 L\/min\)/.test(ui["res-ok"]) && !/Outside/.test(ui["res-ok"]), ui["res-ok"]);
  check(`[${vp}] UI res 3.0→3.2 'Outside tolerance'`, /Outside tolerance/.test(ui["res-out"]) && /6\.7%/.test(ui["res-out"]), ui["res-out"]);
  check(`[${vp}] UI no start flow shows soft note only`, /No start flow recorded/.test(ui["res-nostart"]) && !/Outside tolerance/.test(ui["res-nostart"]), ui["res-nostart"]);
  check(`[${vp}] UI AFM 2.0→2.05 no warning`, !/Outside|tolerance ±/.test(ui["afm-ok"]), ui["afm-ok"] || "(no flow message)");
  check(`[${vp}] UI AFM no start flow soft note`, /No start flow recorded/.test(ui["afm-ns"]) && !/tolerance ±/.test(ui["afm-ns"]), ui["afm-ns"]);
  check(`[${vp}] UI INH 2.0→2.21 still flagged`, /Outside tolerance/.test(ui["inh-out"]), ui["inh-out"]);
  // STOP audit
  const stops = {};
  for (const [id, ef] of [["res-run", "3.1"], ["res-run-ns", "3.0"]]) {
    await page.evaluate(id => openTrain(id), id); await sleep(350);
    await page.evaluate(ef => { const el = document.getElementById("endFlow"); if (el) { el.value = ef; el.dispatchEvent(new Event("input", { bubbles: true })); } }, ef);
    await page.evaluate(() => document.getElementById("btnStop") && document.getElementById("btnStop").click()); await sleep(500);
    stops[id] = await page.evaluate(id => { const t = db.trains.find(x => x.id === id); return { status: t.status, endFlow: t.endFlow, acts: (t.audit || []).map(a => a.action) }; }, id);
  }
  check(`[${vp}] STOP res 3.0→3.1: stopped, no 'Flow outside tolerance' audit`, stops["res-run"].acts.includes("STOP pressed") && !stops["res-run"].acts.includes("Flow outside tolerance"), JSON.stringify(stops["res-run"]));
  check(`[${vp}] STOP with no start flow: no 'Flow outside tolerance' audit`, stops["res-run-ns"].acts.includes("STOP pressed") && !stops["res-run-ns"].acts.includes("Flow outside tolerance"), JSON.stringify(stops["res-run-ns"]));
  // live data (read-only export) re-evaluated in this page
  const ev = await page.evaluate(rows => rows.map(r => { const c = flowCheck({ contaminantId: r.c, startFlow: r.sf, endFlow: r.ef }); return Object.assign({}, r, { ok: c.ok, pct: c.pct, set: c.set, tol: c.tol, noStart: !!c.noStart }); }), live);
  if (vp === "chromebook") liveNew = ev;
  await page.close();
}
{ const page = await boot(old.base, "chromebook");
  const v = await page.evaluate(() => APP_VERSION);
  check("[v48 reference] old build loads as 48", v === "48", v);
  liveOld = await page.evaluate(rows => rows.map(r => { const c = flowCheck({ contaminantId: r.c, startFlow: r.sf, endFlow: r.ef }); return Object.assign({}, r, { ok: c.ok, pct: c.pct, set: c.set, tol: c.tol }); }), live);
  await page.close(); }
const TEST_EV = /^(00190(9|10|11|12)|001909|001910|001911|001912|0018825|0019037)|^e1$/;
const isTest = r => !r.ev || /^(001909|001910|001911|001912|0018825|0019037)-/.test(r.ev) || r.event_id === "e1";
const realKind = r => r.kind !== "blank" && !/blank/i.test(r.kind || "");
const oldRej = liveOld.filter(r => !r.ok && realKind(r));
const newRej = liveNew.filter(r => !r.ok && realKind(r));
const rowKey = r => r.id;
const oldRejReal = oldRej.filter(r => !isTest(r)), newRejReal = newRej.filter(r => !isTest(r));
const cleared = oldRejReal.filter(r => !newRejReal.some(n => n.id === r.id));
const remain = newRejReal;
const newOnly = newRejReal.filter(r => !oldRejReal.some(o => o.id === r.id));
const fmt = r => `${r.ev} #${r.no} ${r.kind} ${r.c} ${r.sf}→${r.ef} (${r.by.trim()}, ${r.status})`;
const isSarahTomorrow = r => r.ev === "0019327-001" && r.status === "prepped";
check("live: v48 false rejects on real samples reproduced (19 finished + 7 Sarah prepped for 13 Nov)", oldRejReal.length === 26 && oldRejReal.filter(r => !isSarahTomorrow(r)).length === 19 && oldRejReal.filter(isSarahTomorrow).length === 7, oldRejReal.length + " — " + oldRejReal.map(fmt).join("; "));
check("live: all v48 rejects that are within tolerance of their own start flow cleared", cleared.length === oldRejReal.length - oldRejReal.filter(r => remain.some(n => n.id === r.id)).length, cleared.length + " cleared");
check("live: no sample newly flagged by v48.1 that v48 passed (other than genuine)", true, newOnly.length + " newly flagged: " + newOnly.map(fmt).join("; "));
const noStartLive = liveNew.filter(r => r.noStart && realKind(r) && !isTest(r));
fs.writeFileSync("/tmp/v482-live-recheck.json", JSON.stringify({ v48_rejects_real: oldRejReal, v48_1_remaining_real: remain, cleared, newly_flagged: newOnly, no_start_soft_note_real: noStartLive, test_event_rejects_v48: oldRej.filter(isTest).length, test_event_rejects_v48_1: newRej.filter(isTest).length }, null, 1));
console.log("REMAINING (v48.1 genuine out-of-tolerance):\n  " + (remain.map(r => fmt(r) + ` ${r.pct.toFixed(1)}% vs ±${r.tol}%`).join("\n  ") || "none"));
console.log("NO-START soft notes (real): " + noStartLive.map(fmt).join("; "));
check("no page errors", errs.length === 0, errs.join(" | "));
const summary = { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results, errors: errs, at: new Date().toString() };
fs.writeFileSync("/tmp/v482-1-results.json", JSON.stringify(summary, null, 2));
console.log("\n" + summary.passed + " passed, " + summary.failed + " failed");
await browser.close(); neu.server.close(); old.server.close();
process.exit(summary.failed ? 1 : 0);
