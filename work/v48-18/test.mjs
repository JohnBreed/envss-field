/* v48.18 tests: same-device save clash + second tab warning + quieter same-device merge audits + auto-update does not reload mid-save.
   Usage: ROOT=/workspace/envss-v4818 LABEL=after PWT=/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.mjs node work/v48-18/test.mjs
   Headless Chrome via playwright-core. Supabase REST is answered by an in-memory mock (page.route) and *.supabase.co is
   also mapped to a dead local port, so nothing can reach the live project. Fixture names are made up. */
import fs from "fs"; import path from "path"; import http from "http";
const { chromium } = await import(process.env.PWT || "/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.mjs");
const ROOT = process.env.ROOT || "/workspace/envss-v4818";
const LABEL = process.env.LABEL || "after";
const OUT = process.env.OUT || "/workspace/clash-shots/v4818"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail != null && !ok ? " — " + String(detail).slice(0, 400) : "")); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VIEWPORTS = {
  pixel7: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36" },
  chromebook: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, isMobile: false, hasTouch: true,
    userAgent: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36" }
};
/* static server for the repo */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); let p = path.join(ROOT, decodeURIComponent(u.pathname)); if (u.pathname === "/") p = path.join(ROOT, "field.html");
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); return res.end(); } const x = path.extname(p);
    res.writeHead(200, { "Content-Type": x === ".html" ? "text/html" : x === ".js" ? "text/javascript" : x === ".svg" ? "image/svg+xml" : x === ".css" ? "text/css" : "application/octet-stream", "Cache-Control": "no-store" }); res.end(b); });
});
await new Promise(r => server.listen(0, "127.0.0.1", r)); const BASE = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"] });

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const train = (id, n, extra) => Object.assign({ id, eventId: "eC", trainKind: "airborne_static", mode: "static", sampleNo: n, pouch: String(n), contaminantId: "", analyses: [],
  pumpSerial: "7700" + n, headId: "R00" + n, mediaId: "RESS" + n, startFlow: "3", endFlow: "", rotameter: "R1", shiftDate: TODAY, shiftKind: "day", status: "prepped",
  startAt: "", endAt: "", location: "Room " + n, comments: "", person: {}, rpd: {}, hpd: {}, audit: [{ at: "2026-11-20T05:00:00.000Z", who: "Fixture", action: "Created", field: "", from: "", to: "" }] }, extra || {});
const RES = { code: "RES", name: "Respirable dust" }, SIL = { code: "SIL", name: "Silica, crystalline (quartz)" };
function seedStore() {
  const row = (id, payload, extra) => Object.assign({ id, payload, updated_at: "2026-11-20T05:00:00.000Z", updated_by: "Fixture" }, extra || {});
  const s = { envss_projects: new Map(), envss_events: new Map(), envss_trains: new Map(), envss_deletions: new Map(), envss_hires: new Map() };
  s.envss_projects.set("pC", row("pC", { id: "pC", number: "0019999", name: "v48.18 clash test", source: "field", status: "Active", site: "Test site" }));
  s.envss_events.set("eC", row("eC", { id: "eC", projectId: "pC", code: "0019999-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] }, { project_id: "pC" }));
  for (let i = 1; i <= 5; i++) s.envss_trains.set("t" + i, row("t" + i, train("t" + i, i), { event_id: "eC" }));
  return s;
}
/* in-memory Supabase. ctl.delayBulk = ms: the next bulk GET of envss_trains reads the store now and answers that (stale) copy later. */
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
      else if (ctl.failBulk) return route.fulfill({ status: 503, headers: hdr, body: "{}" });
      const off = +(url.searchParams.get("offset") || 0), lim = +(url.searchParams.get("limit") || 1e6); rows = rows.slice(off, off + lim);
      if (!idEq && t === "envss_trains" && ctl.delayBulk) { const d = ctl.delayBulk; ctl.delayBulk = 0; ctl.log.push("stale GET held " + d + "ms"); await sleep(d); }
      return route.fulfill({ status: 200, headers: hdr, body: JSON.stringify(rows) });
    }
    if (m === "POST" || m === "PATCH") {
      let body = []; try { body = JSON.parse(req.postData() || "[]"); } catch (e) {}
      if (ctl.delayUpsert) { const d = ctl.delayUpsert; ctl.delayUpsert = 0; ctl.log.push("upsert held " + d + "ms"); await sleep(d); }
      (Array.isArray(body) ? body : [body]).forEach(r => { if (r && r.id) { store[t].set(r.id, Object.assign(store[t].get(r.id) || {}, r)); if (t === "envss_trains") ctl.log.push("upsert " + r.id); } });
      return route.fulfill({ status: 201, headers: hdr, body: "" });
    }
    return route.fulfill({ status: 200, headers: hdr, body: "[]" });
  });
}
const SESSION = (who) => `localStorage.setItem("envss-field-auth-v45", JSON.stringify({access_token:"fake.at", refresh_token:"fake-rt", expires_at: Math.floor(Date.now()/1000)+3600, user:{id:"00000000-0000-0000-0000-00000000test", email:"field.test@envss.com.au", name:"${who}"}})); localStorage.setItem("envss-field-operator", JSON.stringify({name:"${who}", email:"field.test@envss.com.au", source:"google", device:"Android", setAt: new Date().toISOString()}));`;
async function newCtx(vp) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, VIEWPORTS[vp]));
  const store = seedStore(), ctl = {}; await mock(ctx, store, ctl);
  ctx.on("page", p => { p.on("dialog", d => d.accept()); });
  return { ctx, store, ctl };
}
async function openPage(ctx, first) {
  const page = await ctx.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
  if (first) { await page.goto(BASE + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION("Ben Test")); }
  await page.goto(BASE + "/field.html", { waitUntil: "load" });
  await page.waitForFunction(() => typeof db !== "undefined" && db.trains && db.trains.some(t => t.id === "t1") && typeof activityLoaded !== "undefined", null, { timeout: 15000 });
  await sleep(1200);
  return page;
}
const L = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(db.trains.find(x => x.id === i) || null)), id);
const S = (store, id) => JSON.parse(JSON.stringify(store.envss_trains.get(id).payload));
const merges = p => (p.audit || []).filter(a => /Merged with a newer copy/.test(a.action || "")).length;
const codes = a => (a || []).map(x => x.code).sort().join("+");
/* the field the UI would change, the way the app writes it (field value + audit line, then commit) */
const edit = (page, id, field, value, label) => page.evaluate(([i, f, v, lb]) => {
  const t = db.trains.find(x => x.id === i); const was = t[f];
  t[f] = v; t.audit = t.audit || []; t.audit.push({ at: new Date().toISOString(), who: whoText(), action: "Changed " + lb, field: f, from: JSON.stringify(was), to: JSON.stringify(v) });
  commit(); try { render(); } catch (e) {}
}, [id, field, value, label]);
/* screenshot with a small "Test note" caption (added by the test, not part of the app) and the sample's audit log open */
async function noteShot(page, vp, n, note, audit = true) {
  await page.evaluate(([t, au]) => {
    let c = document.getElementById("testNote"); if (!c) { c = document.createElement("div"); c.id = "testNote"; c.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:20000;background:#FFF4C2;color:#222;font:600 14px/1.35 system-ui;padding:8px 12px;border-top:3px solid #E0A800;white-space:pre-wrap"; document.body.appendChild(c); }
    c.textContent = "Test note: " + t;
    if (au) { const b = document.getElementById("auditBox"); if (b) { b.hidden = false; const h = document.getElementById("auditToggle"); (h || b).scrollIntoView({ block: "start" }); window.scrollBy(0, -10); } }
  }, [note, audit]);
  await sleep(250); await page.screenshot({ path: path.join(OUT, `${LABEL}-${vp}-${n}.png`) });
  await page.evaluate(() => { const c = document.getElementById("testNote"); if (c) c.remove(); });
}
const shot = (page, vp, n, full = false) => page.screenshot({ path: path.join(OUT, `${LABEL}-${vp}-${n}.png`), fullPage: full });

async function run(vp) {
  const tag = `[${LABEL} ${vp}]`;
  /* ---- 1. own save vs an 8 s pull that left before the save landed (Marisabel sample 1, 20 Nov) ---- */
  {
    const { ctx, store, ctl } = await newCtx(vp); const page = await openPage(ctx, true);
    await page.evaluate(() => { openTrain("t1"); });
    ctl.delayBulk = 2500; page.evaluate(() => pullActivity()); await sleep(150);          // pull reads Supabase now, answers in 2.5 s
    await edit(page, "t1", "analyses", [RES], "Analyses"); await page.evaluate(() => { const t = db.trains.find(x => x.id === "t1"); t.contaminantId = "RES"; commit(); });
    await sleep(1500);
    check(`${tag} 1a own save reached Supabase (RES)`, codes(S(store, "t1").analyses) === "RES", codes(S(store, "t1").analyses));
    await sleep(1600);                                                                     // the held (stale) pull answers now
    const afterPull = await L(page, "t1");
    check(`${tag} 1b a pull that left before the save does not undo it on the device`, codes(afterPull.analyses) === "RES", "device now shows analyses=" + (codes(afterPull.analyses) || "(none)"));
    await page.evaluate(() => render()); await sleep(200);
    await noteShot(page, vp, "1-after-stale-pull", "RES was saved to Supabase, then an 8 s pull that left before the save answered. Device now shows analyses = " + (codes(afterPull.analyses) || "(none)") + " · Supabase = " + codes(S(store, "t1").analyses));
    /* user ticks SIL on what the screen shows (before the fix the screen had lost RES, so the list becomes SIL only) */
    const cur = await L(page, "t1");
    await edit(page, "t1", "analyses", (cur.analyses || []).concat([SIL]), "Analyses");
    await sleep(2500);
    const sv = S(store, "t1"), lv = await L(page, "t1");
    check(`${tag} 1c no 'Merged with a newer copy from another device' from its own save`, merges(sv) === 0, merges(sv) + " merge entries: " + JSON.stringify((sv.audit || []).filter(a => /Merged|conflict/.test(a.action)).map(a => a.action + " " + (a.field || "") + " " + (a.detail || "")).slice(0, 3)));
    check(`${tag} 1d RES is still on the sample in Supabase (no analyses lost)`, (sv.analyses || []).some(a => a.code === "RES"), "Supabase analyses=" + codes(sv.analyses));
    check(`${tag} 1e device and Supabase agree`, codes(lv.analyses) === codes(sv.analyses), codes(lv.analyses) + " vs " + codes(sv.analyses));
    await page.evaluate(() => { openTrain("t1"); }); await sleep(300);
    await noteShot(page, vp, "2-sample-after-second-save", "After ticking SIL: Supabase analyses = " + (codes(sv.analyses) || "(none)") + " · merge entries from its own save = " + merges(sv));
    check(`${tag} 1f no page errors`, !page.errs.length, page.errs.join(" | "));
    await ctx.close();
  }
  /* ---- 2. Ben's pattern: quick edits while the 8 s pull keeps running ---- */
  {
    const { ctx, store, ctl } = await newCtx(vp); const page = await openPage(ctx, true);
    let n = 0;
    for (let i = 0; i < 5; i++) {
      ctl.delayBulk = 1800; page.evaluate(() => pullActivity()); await sleep(100);
      await edit(page, "t2", "location", "GPLA Room v" + i, "Location"); n++;
      await sleep(2200);
      await edit(page, "t2", "startFlow", String(3 + i / 10), "Start flow"); n++;
      await sleep(900);
    }
    await sleep(1500);
    const sv = S(store, "t2"), lv = await L(page, "t2");
    check(`${tag} 2a ${n} quick edits with overlapping pulls: no self-merge`, merges(sv) === 0, merges(sv) + " merge entries");
    check(`${tag} 2b last values kept on device and in Supabase`, sv.location === "GPLA Room v4" && sv.startFlow === "3.4" && lv.location === "GPLA Room v4", JSON.stringify([sv.location, sv.startFlow, lv.location, lv.startFlow]));
    await ctx.close();
  }
  /* ---- 3. a real second device ticks RES while this device ticks SIL: both kept ---- */
  {
    const { ctx, store, ctl } = await newCtx(vp); const page = await openPage(ctx, true);
    ctl.failBulk = true;                                                                // this device can't see the other change before it saves
    const r = store.envss_trains.get("t3"); const p = r.payload;
    p.analyses = [RES]; p.contaminantId = "RES"; p.audit.push({ at: new Date().toISOString(), who: "Other Person <other@envss.com.au> · Chromebook", action: "Changed Analyses", field: "analyses", from: "", to: "RES" });
    r.updated_by = "Other Person <other@envss.com.au> · Chromebook"; r.updated_at = new Date().toISOString();
    await edit(page, "t3", "analyses", [SIL], "Analyses");
    await sleep(2500); ctl.failBulk = false;
    const sv = S(store, "t3");
    check(`${tag} 3a genuine two-device edit is merged (audited)`, merges(sv) === 1, merges(sv));
    check(`${tag} 3b both analyses kept (RES from the other device + SIL from this one)`, codes(sv.analyses) === "RES+SIL", codes(sv.analyses));
    check(`${tag} 3c both devices' audit entries kept`, sv.audit.some(a => /Other Person/.test(a.who || "")) && sv.audit.some(a => /Ben Test/.test(a.who || "") && a.field === "analyses"), "");
    await page.evaluate(() => pullActivity()); await sleep(600); await page.evaluate(() => { openTrain("t3"); }); await sleep(300);
    await noteShot(page, vp, "3-real-two-device-merge", "Real second device ticked RES while this one ticked SIL. Supabase analyses = " + codes(sv.analyses));
    await ctx.close();
  }
  /* ---- 4. sync bookkeeping lost (e.g. a second tab overwrote it): Supabase holds this device's own last save ---- */
  {
    const { ctx, store } = await newCtx(vp); const page = await openPage(ctx, true);
    await edit(page, "t4", "location", "Kitchen", "Location"); await sleep(1500);
    await page.evaluate(() => { syncState.hash.trains.t4 = "lost.0"; persist(); });
    await edit(page, "t4", "startFlow", "2.5", "Start flow"); await sleep(2000);
    const sv = S(store, "t4");
    check(`${tag} 4a own earlier save is recognised (no merge with itself)`, merges(sv) === 0 && sv.location === "Kitchen" && sv.startFlow === "2.5", merges(sv) + " " + sv.location + " " + sv.startFlow);
    await ctx.close();
  }
  /* ---- 5. second tab on the same device ---- */
  {
    const { ctx, store, ctl } = await newCtx(vp); const a = await openPage(ctx, true);
    await a.evaluate(() => { openTrain("t1"); });
    const b = await openPage(ctx, false);
    await sleep(800);
    const bInfo = await b.evaluate(() => ({ banner: (document.getElementById("v487Tab") || {}).innerText || "", ro: !!window.envssReadOnly, cls: document.body.classList.contains("v487-ro") }));
    const aInfo = await a.evaluate(() => ({ banner: (document.getElementById("v487Tab") || {}).innerText || "", ro: !!window.envssReadOnly }));
    check(`${tag} 5a second tab warns it is already open elsewhere and is read-only`, bInfo.ro && /already open/i.test(bInfo.banner), JSON.stringify(bInfo));
    check(`${tag} 5b first tab stays editable with no banner`, !aInfo.ro && !aInfo.banner, JSON.stringify(aInfo));
    await b.evaluate(() => { openTrain("t1"); }); await sleep(300); await shot(b, vp, "5-second-tab-read-only");
    const before = await a.evaluate(() => localStorage.getItem("envss-field-next-v32"));
    const ups0 = ctl.log.filter(x => x.startsWith("upsert")).length;
    await b.evaluate(() => { const t = db.trains.find(x => x.id === "t1"); t.location = "Typed in second tab"; commit(); });
    await sleep(1500);
    const after = await a.evaluate(() => localStorage.getItem("envss-field-next-v32"));
    check(`${tag} 5c second tab writes nothing (device copy and Supabase untouched)`, before === after && ctl.log.filter(x => x.startsWith("upsert")).length === ups0 && S(store, "t1").location === "Room 1", "");
    /* take over */
    if (!(await b.$("#v487Take"))) { check(`${tag} 5d 'Use this tab instead' button shown`, false, "no take-over button (no second-tab guard)"); await ctx.close(); return; }
    await b.click("#v487Take"); await sleep(2500);
    const b2 = ctx.pages().find(p => p !== a) || b;
    const bAfter = await b2.evaluate(() => ({ ro: !!window.envssReadOnly, banner: (document.getElementById("v487Tab") || {}).innerText || "" }));
    const aAfter = await a.evaluate(() => ({ ro: !!window.envssReadOnly, banner: (document.getElementById("v487Tab") || {}).innerText || "" }));
    check(`${tag} 5d 'Use this tab' moves editing: new tab editable, old tab read-only with a banner`, !bAfter.ro && aAfter.ro && /another tab/i.test(aAfter.banner), JSON.stringify({ bAfter, aAfter }));
    await shot(a, vp, "6-old-tab-after-take-over");
    await b2.evaluate(() => { const t = db.trains.find(x => x.id === "t1"); t.location = "Edited after take over"; commit(); }); await sleep(1500);
    check(`${tag} 5e edits save from the tab that took over`, S(store, "t1").location === "Edited after take over", S(store, "t1").location);
    /* closing the editing tab frees the lock: the other tab offers to edit */
    await b2.close(); await sleep(1200);
    const aFree = await a.evaluate(() => ({ ro: !!window.envssReadOnly, banner: (document.getElementById("v487Tab") || {}).innerText || "" }));
    check(`${tag} 5f when the editing tab closes, the remaining tab can edit again`, !aFree.ro || /closed/i.test(aFree.banner), JSON.stringify(aFree));
    check(`${tag} 5g no page errors`, !a.errs.length && !b.errs.length, a.errs.concat(b.errs).join(" | "));
    await ctx.close();
  }

  /* ---- 6. item 9: lost hash + own memory cleared should not spam same-device merge audits ---- */
  {
    const { ctx, store } = await newCtx(vp); const page = await openPage(ctx, true);
    await edit(page, "t5", "location", "Bay 0", "Location"); await sleep(1500);
    for (let i = 1; i <= 6; i++) {
      await page.evaluate(() => { syncState.hash.trains.t5 = "lost." + Math.random(); syncState.own = {}; persist(); });
      await edit(page, "t5", "location", "Bay " + i, "Location");
      await sleep(1800);
    }
    const sv = S(store, "t5"), lv = await L(page, "t5");
    check(`${tag} 6a last location kept after repeated hash loss`, sv.location === "Bay 6" && lv.location === "Bay 6", JSON.stringify([sv.location, lv.location]));
    check(`${tag} 6b same-device hash-loss retries do not spam merge audits (0 or 1, not one per edit)`, merges(sv) <= 1, merges(sv) + " merge entries: " + JSON.stringify((sv.audit || []).filter(a => /Merged/.test(a.action || "")).map(a => a.detail).slice(0, 3)));
    await ctx.close();
  }
  /* ---- 7. auto-update must not reload while a save is in flight or this tab is read-only ---- */
  {
    const { ctx, store, ctl } = await newCtx(vp); const page = await openPage(ctx, true);
    const idle = await page.evaluate(() => {
      const r = (window.envssUpdate && envssUpdate.blockers()) || [];
      return { v: APP_VERSION, hasUpdate: !!(window.envssUpdate && envssUpdate.safe), flushing, busy: !!(window.v4818Sync && v4818Sync.busy()), blockers: r };
    });
    check(`${tag} 7a app is v48.19 and auto-update hooks are present`, idle.v === "48.19" && idle.hasUpdate, JSON.stringify(idle));
    check(`${tag} 7b idle tab is not blocked by a save in flight`, !idle.flushing && !idle.busy && !idle.blockers.includes("uploading") && !idle.blockers.includes("save in flight"), JSON.stringify(idle.blockers));
    const flushingBlock = await page.evaluate(() => {
      const was = flushing; flushing = true;
      const r = envssUpdate.blockers();
      const safe = envssUpdate.safe();
      flushing = was;
      return { r, safe };
    });
    check(`${tag} 7c auto-update is not safe while flushing (uploading)`, flushingBlock.r.includes("uploading") && flushingBlock.safe === false, JSON.stringify(flushingBlock));
    /* start a slow upsert and confirm inflight is a blocker */
    ctl.delayUpsert = 2500;
    const p = edit(page, "t1", "comments", "mid-save comment", "Comments");
    let mid = null;
    for (let i = 0; i < 20; i++) {
      mid = await page.evaluate(() => ({ busy: !!(window.v4818Sync && v4818Sync.busy()), inflight: window.v4818Sync && v4818Sync.inflight(), flushing, blockers: envssUpdate.blockers(), safe: envssUpdate.safe() }));
      if (mid.busy || mid.flushing || mid.blockers.some(x => /to upload|save in flight|uploading/.test(x))) break;
      await sleep(100);
    }
    await p; await sleep(2800);
    check(`${tag} 7d a queued or in-flight save blocks auto-update`, mid.safe === false && (mid.busy || mid.flushing || mid.blockers.some(x => /to upload|save in flight|uploading/.test(x))), JSON.stringify(mid));
    const b = await openPage(ctx, false); await sleep(600);
    const ro = await b.evaluate(() => ({ ro: !!window.envssReadOnly, blockers: (window.envssUpdate && envssUpdate.blockers()) || [], safe: window.envssUpdate && envssUpdate.safe() }));
    check(`${tag} 7e a read-only second tab is not allowed to apply an update`, ro.ro && ro.safe === false && ro.blockers.includes("this tab is read-only"), JSON.stringify(ro));
    await ctx.close();
  }
}

const which = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of which) { try { await run(vp); } catch (e) { check(`[${LABEL} ${vp}] run`, false, e && e.stack || e); } }
await browser.close(); server.close();
const pass = results.filter(r => r.ok).length;
console.log(`\n${LABEL}: ${pass}/${results.length} passed`);
fs.writeFileSync(path.join(OUT, `${LABEL}-results.json`), JSON.stringify(results, null, 2));
if (pass < results.length) process.exitCode = 1;
