/* v48.18 real-data tests: two tabs and rapid edits against a read-only copy of live event 0019185-002
   (fetched 27 Nov 2026 AWST from luyprcmjyruznluboyms; contact fields stripped). Supabase is mocked in memory
   and *.supabase.co is mapped to a dead port — nothing is written to the live project.
   Usage: ROOT=/workspace/envss-v4818 node work/v48-18/real-data.test.mjs */
import fs from "fs"; import path from "path"; import http from "http";
const { chromium } = await import(process.env.PWT || "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.mjs");
const ROOT = process.env.ROOT || "/workspace/envss-v4818";
const OUT = process.env.OUT || "/workspace/clash-shots/v4818"; fs.mkdirSync(OUT, { recursive: true });
const FIX = path.join(ROOT, "work/v48-18/fixtures/live-0019185-002-20261127.json");
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail != null && !ok ? " — " + String(detail).slice(0, 400) : "")); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VIEWPORTS = {
  pixel7: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36" },
  chromebook: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, isMobile: false, hasTouch: true,
    userAgent: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36" }
};
const live = JSON.parse(fs.readFileSync(FIX, "utf8"));
const EVENT_ID = live.event.id, TRAIN_ID = (live.trains.find(t => (t.payload || {}).sampleNo === 1 && (t.payload || {}).trainKind === "airborne_personal") || live.trains[0]).id;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); let p = path.join(ROOT, decodeURIComponent(u.pathname)); if (u.pathname === "/") p = path.join(ROOT, "field.html");
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); return res.end(); } const x = path.extname(p);
    res.writeHead(200, { "Content-Type": x === ".html" ? "text/html" : x === ".js" ? "text/javascript" : x === ".svg" ? "image/svg+xml" : x === ".css" ? "text/css" : "application/octet-stream", "Cache-Control": "no-store" }); res.end(b); });
});
await new Promise(r => server.listen(0, "127.0.0.1", r)); const BASE = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"] });

function seedStore() {
  const asRow = (r, extra) => Object.assign({ id: r.id, payload: r.payload, updated_at: r.updated_at, updated_by: r.updated_by }, extra || {});
  const s = { envss_projects: new Map(), envss_events: new Map(), envss_trains: new Map(), envss_deletions: new Map(), envss_hires: new Map(), envss_fit_reports: new Map() };
  if (live.project) s.envss_projects.set(live.project.id, asRow(live.project));
  s.envss_events.set(live.event.id, asRow(live.event, { project_id: live.event.project_id }));
  for (const t of live.trains) s.envss_trains.set(t.id, asRow(t, { event_id: t.event_id }));
  return s;
}
async function mock(ctx, store, ctl) {
  ctl.log = [];
  await ctx.route(/supabase\.co\//, async route => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method();
    const hdr = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Content-Type": "application/json" };
    if (m === "OPTIONS") return route.fulfill({ status: 200, headers: hdr, body: "" });
    const mt = url.pathname.match(/\/rest\/v1\/([a-z_]+)/);
    if (!mt) return route.fulfill({ status: 200, headers: hdr, body: url.pathname.includes("/functions/") ? '{"rows":[]}' : "{}" });
    const t = mt[1]; store[t] = store[t] || new Map();
    if (m === "GET") {
      const idEq = url.searchParams.get("id");
      let rows = JSON.parse(JSON.stringify([...store[t].values()]));
      if (idEq && idEq.startsWith("eq.")) rows = rows.filter(r => r.id === idEq.slice(3));
      const evEq = url.searchParams.get("event_id") || url.searchParams.get("project_id");
      if (evEq && evEq.startsWith("eq.")) {
        const col = url.searchParams.get("event_id") ? "event_id" : "project_id";
        rows = rows.filter(r => r[col] === evEq.slice(3) || (r.payload && r.payload[col === "event_id" ? "eventId" : "projectId"] === evEq.slice(3)));
      }
      const off = +(url.searchParams.get("offset") || 0), lim = +(url.searchParams.get("limit") || 1e6); rows = rows.slice(off, off + lim);
      if (!idEq && t === "envss_trains" && ctl.delayBulk) { const d = ctl.delayBulk; ctl.delayBulk = 0; await sleep(d); }
      return route.fulfill({ status: 200, headers: hdr, body: JSON.stringify(rows) });
    }
    if (m === "POST" || m === "PATCH") {
      let body = []; try { body = JSON.parse(req.postData() || "[]"); } catch (e) {}
      (Array.isArray(body) ? body : [body]).forEach(r => { if (r && r.id) { store[t].set(r.id, Object.assign(store[t].get(r.id) || {}, r)); ctl.log.push("upsert " + t + " " + r.id); } });
      return route.fulfill({ status: 201, headers: hdr, body: "" });
    }
    return route.fulfill({ status: 200, headers: hdr, body: "[]" });
  });
}
const SESSION = `localStorage.setItem("envss-field-auth-v45", JSON.stringify({access_token:"fake.at", refresh_token:"fake-rt", expires_at: Math.floor(Date.now()/1000)+3600, user:{id:"00000000-0000-0000-0000-00000000test", email:"field.test@envss.com.au", name:"Ben Test"}})); localStorage.setItem("envss-field-operator", JSON.stringify({name:"Ben Test", email:"field.test@envss.com.au", source:"google", device:"Android", setAt: new Date().toISOString()}));`;

async function run(vp) {
  const tag = `[real ${vp}]`;
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, VIEWPORTS[vp]));
  const store = seedStore(), ctl = {}; await mock(ctx, store, ctl);
  ctx.on("page", p => { p.on("dialog", d => d.accept()); });
  const a = await ctx.newPage(); a.errs = []; a.on("pageerror", e => a.errs.push(String(e)));
  await a.goto(BASE + "/field.html", { waitUntil: "domcontentloaded" }); await a.evaluate(SESSION);
  await a.goto(BASE + "/field.html", { waitUntil: "load" });
  await a.waitForFunction(id => typeof db !== "undefined" && db.events && db.events.some(e => e.id === id) && db.trains && db.trains.length, EVENT_ID, { timeout: 20000 });
  await sleep(800);
  const loaded = await a.evaluate(([eid, tid]) => ({ v: APP_VERSION, ev: !!(db.events || []).find(e => e.id === eid), n: (db.trains || []).filter(t => t.eventId === eid).length, t: !!(db.trains || []).find(x => x.id === tid) }), [EVENT_ID, TRAIN_ID]);
  check(`${tag} loaded v48.18 copy of 0019185-002 (${loaded.n} samples)`, loaded.v === "48.18" && loaded.ev && loaded.t && loaded.n === live.trains.length, JSON.stringify(loaded));
  await a.evaluate((tid) => { try { openTrain(tid); } catch (e) {} }, TRAIN_ID); await sleep(400);
  await a.screenshot({ path: path.join(OUT, `real-${vp}-1-sample.png`) });

  /* rapid edits with overlapping pulls, like a tech tapping through fields */
  for (let i = 0; i < 4; i++) {
    ctl.delayBulk = 1200; a.evaluate(() => pullActivity()); await sleep(80);
    await a.evaluate(([tid, i]) => {
      const t = db.trains.find(x => x.id === tid); const was = t.location;
      t.location = "Rapid loc " + i; t.audit = t.audit || [];
      t.audit.push({ at: new Date().toISOString(), who: whoText(), action: "Changed Location", field: "location", from: JSON.stringify(was), to: JSON.stringify(t.location) });
      commit();
    }, [TRAIN_ID, i]);
    await sleep(1500);
  }
  const after = await a.evaluate(tid => { const t = db.trains.find(x => x.id === tid); return { loc: t.location, merges: (t.audit || []).filter(x => /Merged with a newer copy/.test(x.action || "")).length }; }, TRAIN_ID);
  const sv = store.envss_trains.get(TRAIN_ID).payload;
  const sm = (sv.audit || []).filter(x => /Merged with a newer copy/.test(x.action || "")).length;
  check(`${tag} rapid edits kept last location, no self-merge`, after.loc === "Rapid loc 3" && sv.location === "Rapid loc 3" && after.merges === 0 && sm === 0, JSON.stringify({ after, svLoc: sv.location, sm }));
  await a.screenshot({ path: path.join(OUT, `real-${vp}-2-after-rapid-edits.png`) });

  const b = await ctx.newPage(); b.errs = []; b.on("pageerror", e => b.errs.push(String(e)));
  await b.goto(BASE + "/field.html", { waitUntil: "load" });
  await sleep(1000);
  const bInfo = await b.evaluate(() => ({ ro: !!window.envssReadOnly, banner: (document.getElementById("v487Tab") || {}).innerText || "", v: APP_VERSION }));
  check(`${tag} second tab is read-only with a banner`, bInfo.ro && /already open/i.test(bInfo.banner), JSON.stringify(bInfo));
  await b.evaluate((tid) => { try { openTrain(tid); } catch (e) {} }, TRAIN_ID); await sleep(400);
  await b.screenshot({ path: path.join(OUT, `real-${vp}-3-second-tab-read-only.png`) });
  const before = sv.location;
  const ups0 = ctl.log.filter(x => x.startsWith("upsert")).length;
  await b.evaluate((tid) => { const t = db.trains.find(x => x.id === tid); t.location = "Typed in second tab"; commit(); }, TRAIN_ID);
  await sleep(1200);
  check(`${tag} second tab does not change the copy`, store.envss_trains.get(TRAIN_ID).payload.location === before && ctl.log.filter(x => x.startsWith("upsert")).length === ups0, store.envss_trains.get(TRAIN_ID).payload.location);
  check(`${tag} no page errors`, !a.errs.length && !b.errs.length, a.errs.concat(b.errs).join(" | "));
  await ctx.close();
}
const which = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of which) { try { await run(vp); } catch (e) { check(`[real ${vp}] run`, false, e && e.stack || e); } }
await browser.close(); server.close();
const pass = results.filter(r => r.ok).length;
console.log(`\nreal-data: ${pass}/${results.length} passed`);
fs.writeFileSync(path.join(OUT, "real-data-results.json"), JSON.stringify(results, null, 2));
if (pass < results.length) process.exitCode = 1;
