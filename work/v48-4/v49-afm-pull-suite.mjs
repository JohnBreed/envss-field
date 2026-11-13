/* v48.2: read-only AFM pull from Podio (mirror views) — checks with mocked Supabase only.
   Usage: ROOT=/workspace/afm-build node work/v49/afm-pull.test.mjs <chromebook|pixel7>
   Fixture: work/v49/fixtures/podio-afm-20261113.json (real mirror rows for 0017889, 0018637, 0019299 on 13 Nov 2026;
   contact names/phones/emails replaced because the repo is public). No production reads or writes. */
process.env.ROOT = process.env.ROOT || "/workspace/afm-build";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "../v46/harness.mjs";
import fs from "fs";
import path from "path";
const vp = process.argv[2] || "chromebook";
const root = process.env.ROOT;
const shotDir = path.join(root, "work/v48-4/regress-shots/v49");
fs.mkdirSync(shotDir, { recursive: true });
const fx = JSON.parse(fs.readFileSync(path.join(root, "work/v49/fixtures/podio-afm-20261113.json"), "utf8"));
const upg = JSON.parse(fs.readFileSync(path.join(root, "work/v49/fixtures/afm-upgrade-v34.json"), "utf8"));

const { server, base } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const results = []; let fails = 0;
const ok = (name, cond, extra) => { const line = (cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : ""); console.error(line); results.push(line); if (!cond) fails++; };
const page = await browser.newPage();
await page.setViewport(VIEWPORTS[vp].viewport);
await page.setUserAgent(VIEWPORTS[vp].ua);
await page.setRequestInterception(true);
const store = {
  envss_projects: new Map(fx.projects.map(p => [p.id, { id: p.id, updated_at: "2026-11-12T00:00:00Z", payload: p }])),
  v_field_afm_events: new Map(fx.v_field_afm_events.map(r => [String(r.item_id), r])),
  v_field_afm_samples: new Map(fx.v_field_afm_samples.map(r => [String(r.item_id), r]))
};
const opts = {};
const log = mockSupabase(page, store, opts);
const allUrls = []; page.on("request", r => allUrls.push(r.method() + " " + r.url()));
const errs = []; page.on("pageerror", e => errs.push(String(e)));
page.on("dialog", async d => { await d.accept(); });

await page.goto(base + "/field.html", { waitUntil: "domcontentloaded" });
await page.evaluate(SESSION);
await page.reload({ waitUntil: "networkidle0" });
await sleep(1500);
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const shot = n => page.screenshot({ path: path.join(shotDir, `${vp}-podio-${n}.png`), fullPage: true });

/* 0. boot + storage names */
const boot = await ev(() => ({ v: (document.getElementById("appVersion") || {}).textContent, key: KEY, legacy: LEGACY_KEY, api: !!window.envssAfmPodio,
  src: document.documentElement.innerHTML }));
ok("boot: app v48.4", boot.v === "v48.4", boot.v);
ok("storage: local key unchanged (envss-field-next-v32)", boot.key === "envss-field-next-v32");
ok("storage: legacy key unchanged (envss-field-v04)", boot.legacy === "envss-field-v04");
ok("storage: IndexedDB names unchanged (photos, drive, v46)", boot.src.includes("envss-field-photos") && boot.src.includes("envss-field-drive") && boot.src.includes("envss-field-v46"));
ok("AFM Podio pull loaded", boot.api);

/* 1. existing data that must stay untouched: legacy AFM fixture + a hygiene event */
await ev(u => {
  db.projects.push(u.project); db.events.push(u.event); u.trains.forEach(t => db.trains.push(JSON.parse(JSON.stringify(t))));
  db.projects.push({ id: "p-hyg", number: "0019500", name: "Hygiene fixture", status: "Active", active: true });
  db.events.push({ id: "e-hyg", projectId: "p-hyg", type: "hygiene", stage: "planned", date: "2026-11-12", code: "0019500-001", multiDay: false, notes: "", uploadReady: false, operators: [] });
  save();
}, upg);
const snap = () => ev(() => JSON.stringify({ e: db.events.filter(e => ["e-afm-upg", "e-hyg"].includes(e.id)), t: db.trains.filter(t => ["e-afm-upg", "e-hyg"].includes(t.eventId)) }));
const before = await snap();

/* 2. pure mapping on the real rows */
const pure = await ev(fx => {
  const M = envssAfmPodio.map;
  const evs = fx.v_field_afm_events.map(M.event);
  const sm = fx.v_field_afm_samples.map(M.sample);
  const by = id => sm.filter(s => s.eventItemId === id).sort((a, b) => a.sampleNo - b.sampleNo);
  return { evs, counts: Object.fromEntries(evs.map(e => [e.jobNumber, by(e.itemId).length])), s: Object.fromEntries(evs.map(e => [e.jobNumber, by(e.itemId)])),
    cow: [M.cowl("ENVSS12577"), M.cowl("ESS 01850"), M.cowl("", 1850), M.cowl("12 582")] };
}, fx);
const E = j => pure.evs.find(e => e.jobNumber === j);
ok("map: three events found with job numbers 0017889/0018637/0019299", ["0017889", "0018637", "0019299"].every(j => E(j)), pure.evs.map(e => e.jobNumber).join(","));
ok("map: references kept", E("0017889").reference === "ENVSS-HAZ-AFM-0017889-0011-20261113" && E("0018637").reference === "ENVSS-HAZ-AFM-0018637-0011-20261113" && E("0019299").reference === "ENVSS-HAZ-AFM-0019299-0010-20261113");
ok("map: date 2026-11-13 07:00, Next Day 0700 → next_0700, task Earthworks", pure.evs.every(e => e.date === "2026-11-13" && e.startTime === "07:00" && e.tat === "next_0700" && e.task === "Earthworks"));
ok("map: all three are open (report not generated)", pure.evs.every(e => e.open));
ok("map: site address from Podio location", E("0019299").siteAddress === "Camfield Dr, Burswood WA 6100, Australia" && E("0018637").siteAddress === "PESP-CMC/PWD", E("0018637").siteAddress);
ok("map: Podio sample counts 11 / 9 / 5", pure.counts["0017889"] === 11 && pure.counts["0018637"] === 9 && pure.counts["0019299"] === 5, JSON.stringify(pure.counts));
ok("map: sample 0 is the field blank on each event", Object.values(pure.s).every(l => l[0].sampleNo === 0 && l[0].blank && !l[0].pumpSerial));
ok("map: 0019299 Pump 1 = pump 101587, cowl 12577, rotameter 4435, flow 2, location stripped", (s => s.pumpSerial === "101587" && s.cowl === "12577" && s.rotameter === "4435" && s.startFlow === 2 && s.location === "Exclusion Zone – Northern Boundary (West)")(pure.s["0019299"][1]), JSON.stringify(pure.s["0019299"][1]));
ok("map: 0018637 blank cowl 12581, Pump 8 cowl 12589", pure.s["0018637"][0].cowl === "12581" && pure.s["0018637"][8].cowl === "12589");
ok("map: 0017889 has no cowls in Podio yet", pure.s["0017889"].every(s => !s.cowl));
ok("map: cowl strips ENVSS/ESS, pads number field, keeps 5 digits", JSON.stringify(pure.cow) === JSON.stringify(["12577", "01850", "01850", "12582"]), JSON.stringify(pure.cow));

/* 3. project page: refresh + start 0017889 */
await ev(() => openProject("podio-3387717386"));
await sleep(300);
await ev(() => envssAfmPodio.pull());
await sleep(300);
const card = await ev(() => ({ html: (document.getElementById("afmPodioPlan") || {}).innerText || "", btn: !!document.querySelector("[data-afm-start='3393177640']"), hyg: !!document.getElementById("podioPlan") }));
ok("project: 'AFM planned in Podio' card lists ENVSS-HAZ-AFM-0017889-0011-20261113", /ENVSS-HAZ-AFM-0017889-0011-20261113/.test(card.html) && card.btn, card.html.slice(0, 200));
ok("project: card shows field blank 0 + 10 pumps", /field blank 0 \+ 10 pumps/.test(card.html), card.html);
ok("project: hygiene 'Planned in Podio' card still there", card.hyg);
await shot("project-0017889");
await ev(() => document.querySelector("[data-afm-start='3393177640']").click());
await sleep(400);
const e1 = await ev(() => {
  const e = db.events.find(x => x.podioAfmItemId === "3393177640");
  const ts = trainsOf(e.id);
  return { code: e.code, type: e.type, date: e.date, tat: e.tat, proto: e.protocol, rota: e.rotameter, task: e.taskDesc, site: e.siteAddress, page: view.page,
    labels: ts.map(displayNo), p1: ts.find(t => sampleNoOf(t) === 1), blank: ts.find(t => sampleNoOf(t) === 0), n: ts.length,
    started: ts.some(t => t.startAt || t.endAt || t.status !== "prepped"), card: (document.getElementById("afmPodioPrefill") || {}).innerText || "" };
});
ok("start: event code is the Podio AFM reference", e1.code === "ENVSS-HAZ-AFM-0017889-0011-20261113", e1.code);
ok("start: AFM event (type fibre) on 2026-11-13, next_0700, Earthworks, background", e1.type === "fibre" && e1.date === "2026-11-13" && e1.tat === "next_0700" && e1.task === "Earthworks" && e1.proto === "background", JSON.stringify([e1.date, e1.tat, e1.proto]));
ok("start: event rotameter from Podio samples (2520A4A0BNBN-NL-05)", e1.rota === "2520A4A0BNBN-NL-05", e1.rota);
ok("start: 11 samples numbered 0, Pump 1 … Pump 10", e1.n === 11 && e1.labels[0] === "0" && e1.labels[1] === "Pump 1" && e1.labels[10] === "Pump 10", e1.labels.join(","));
ok("start: Pump 1 pump 91648, location 'North Eastern Boundary', flow 2.0", e1.p1.pumpSerial === "91648" && e1.p1.location === "North Eastern Boundary" && e1.p1.startFlow === "2.0", JSON.stringify([e1.p1.pumpSerial, e1.p1.location, e1.p1.startFlow]));
ok("start: no cowl invented when Podio has none", !e1.p1.cowlNo && !e1.blank.cowlNo);
ok("start: nothing STARTed — Podio planned times are not used as START/STOP", !e1.started);
ok("start: Podio planned start kept for display only", e1.p1.podioAfm && /2026-11-13 07:00/.test(e1.p1.podioAfm.plannedStart || ""), JSON.stringify(e1.p1.podioAfm));
ok("start: 'From Podio (AFM)' card shows reference, site and what came from Podio", /From Podio \(AFM\)/.test(e1.card) && /Burswood WA 6100/.test(e1.card) && /came from Podio/.test(e1.card), e1.card.slice(0, 200));
await shot("event-0017889");
await ev(() => { const e = db.events.find(x => x.podioAfmItemId === "3393177640"); openTrain(trainsOf(e.id).find(t => sampleNoOf(t) === 1).id); });
await sleep(300);
const tl = await ev(() => (document.getElementById("afmPodioTrain") || {}).textContent || "");
ok("sample page: shows which fields came from Podio", /From Podio \(read only\)/.test(tl) && /Pump serial/.test(tl) && /Location/.test(tl), tl);
await shot("sample-0017889-pump1");

/* 4. 0018637: start, then field edits must survive a refill */
await ev(() => { openProject("podio-3387709482"); });
await sleep(300);
await ev(() => envssAfmPodio.start("3393177499"));
await sleep(300);
const e2a = await ev(() => { const e = db.events.find(x => x.podioAfmItemId === "3393177499"); const ts = trainsOf(e.id); return { id: e.id, cowls: ts.map(t => t.cowlNo), n: ts.length }; });
ok("start 0018637: 9 samples with Podio cowls 12581…12589", e2a.n === 9 && e2a.cowls.join(",") === "12581,12582,12583,12584,12585,12586,12587,12588,12589", e2a.cowls.join(","));
await ev(id => {
  const ts = trainsOf(id);
  const p1 = ts.find(t => sampleNoOf(t) === 1), p2 = ts.find(t => sampleNoOf(t) === 2), p3 = ts.find(t => sampleNoOf(t) === 3);
  p1.cowlNo = "55555"; p1.mediaId = "55555"; p1.location = "Typed on site"; p1.startFlow = "2.2";
  p2.pumpSerial = "";        // cleared on site: refill may fill this blank again
  p3.status = "running"; p3.startAt = "2026-11-13T07:05:00+08:00";
  save();
}, e2a.id);
const sum2 = await ev(id => envssAfmPodio.refill(id), e2a.id);
const e2b = await ev(id => { const ts = trainsOf(id); const g = n => ts.find(t => sampleNoOf(t) === n); return { p1: g(1), p2: g(2), p3: g(3), n: ts.length }; }, e2a.id);
ok("refill: Pump 1 cowl/location/flow typed in the field app are kept", e2b.p1.cowlNo === "55555" && e2b.p1.location === "Typed on site" && e2b.p1.startFlow === "2.2", JSON.stringify([e2b.p1.cowlNo, e2b.p1.location, e2b.p1.startFlow]));
ok("refill: kept values are reported", sum2 && sum2.kept.some(k => k.field === "Cowl" && k.field_app === "55555" && k.podio === "12582"), JSON.stringify(sum2 && sum2.kept.slice(0, 3)));
ok("refill: blank Pump 2 serial filled again from Podio (101561)", e2b.p2.pumpSerial === "101561", e2b.p2.pumpSerial);
ok("refill: running Pump 3 keeps its START and status", e2b.p3.status === "running" && e2b.p3.startAt === "2026-11-13T07:05:00+08:00");
ok("refill: no duplicate samples added", e2b.n === 9 && sum2.added === 0, String(e2b.n));

/* 5. 0019299 */
await ev(() => { openProject("podio-3387707678"); });
await sleep(300);
await ev(() => envssAfmPodio.start("3393177423"));
await sleep(300);
const e3 = await ev(() => { const e = db.events.find(x => x.podioAfmItemId === "3393177423"); const ts = trainsOf(e.id); return { code: e.code, rota: e.rotameter, proto: e.protocol, labels: ts.map(displayNo), cowls: ts.map(t => t.cowlNo), pumps: ts.map(t => t.pumpSerial), blankRota: ts[0].rotameter, poc: e.poc }; });
ok("start 0019299: code, Control, 0 + Pump 1–4", e3.code === "ENVSS-HAZ-AFM-0019299-0010-20261113" && e3.proto === "control" && e3.labels.join(",") === "0,Pump 1,Pump 2,Pump 3,Pump 4", e3.labels.join(","));
ok("start 0019299: cowls 12576–12580 and pumps 101587/101564/101568/87652", e3.cowls.join(",") === "12576,12577,12578,12579,12580" && e3.pumps.join(",") === ",101587,101564,101568,87652", e3.cowls.join(",") + " | " + e3.pumps.join(","));
ok("start 0019299: event rotameter 4435 (pump samples), blank has none", e3.rota === "4435" && !e3.blankRota, e3.rota);
ok("start 0019299: POC filled from Podio", e3.poc && e3.poc.company === "Main Roads Western Australia");
await shot("event-0019299");

/* 6. starting again opens the same event (no duplicate) */
const again = await ev(() => { openProject("podio-3387707678"); envssAfmPodio.start("3393177423"); return db.events.filter(x => x.podioAfmItemId === "3393177423").length; });
ok("start twice: one event per Podio AFM item", again === 1, String(again));

/* 7. edit keeps the Podio code */
const codeAfterEdit = await ev(() => {
  const e = db.events.find(x => x.podioAfmItemId === "3393177423"); view.eventId = e.id; view.page = "editEvent"; render();
  if (typeof editEventHtml === "function" && !document.getElementById("edate")) { document.getElementById("app").innerHTML = editEventHtml(); }
  const had = !!document.getElementById("edate");
  if (had) saveEventEdits();
  return { code: e.code, had };
});
ok("edit: Podio-linked AFM event keeps its Podio reference as code", codeAfterEdit.had && codeAfterEdit.code === "ENVSS-HAZ-AFM-0019299-0010-20261113", JSON.stringify(codeAfterEdit));

/* 8. existing data untouched */
const after = await snap();
ok("existing AFM + hygiene records unchanged", before === after);

/* 9. views not deployed → friendly note, nothing lost */
opts.tableStatus = { v_field_afm_events: 404 };
await ev(() => { openProject("podio-3387717386"); });
await sleep(200);
const r404 = await ev(async () => { const r = await envssAfmPodio.pull(); return { r, note: envssAfmPodio.state().note, cached: envssAfmPodio.cache().events.length }; });
ok("views missing (404): note shown, cached Podio copy kept", r404.r === false && /isn't switched on yet/.test(r404.note) && r404.cached === 3, JSON.stringify(r404));
await sleep(200);
await shot("views-missing");
delete opts.tableStatus;

/* 10. read only: only GETs to the AFM views, nothing to Podio */
const afmReq = log.filter(l => /v_field_afm_/.test(l));
ok("network: AFM views only read (GET, plus browser CORS preflight OPTIONS)", afmReq.some(l => /^GET /.test(l)) && afmReq.every(l => /^(GET|OPTIONS) /.test(l)), afmReq.slice(0, 3).join(" | "));
ok("network: no request to podio.com or api.podio.com", !allUrls.some(u => /podio\.com/i.test(u.split(" ")[1] || "")));
ok("network: no Edge Function call for AFM", !log.some(l => /functions\/v1\/.*afm/i.test(l)));
ok("network: no writes to podio_items", !log.some(l => /podio_items/.test(l)));

ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
console.log("\n--- " + vp + " " + results.length + " checks, " + fails + " failed ---");
results.forEach(r => console.log(r));
await browser.close(); server.close();
process.exit(fails ? 1 : 0);
