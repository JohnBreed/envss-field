/* Read-only dry run of v48.7 auto-create against a copy of the live mirror (fetched read-only 23 Nov 2026 AWST).
   Runs the real field.html in headless Chrome with Supabase mocked in memory from that copy; nothing is sent anywhere. */
import fs from "fs";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "/workspace/envss-auto/work/v48-7/harness.mjs";
const j = JSON.parse(fs.readFileSync(process.env.LIVE || "/workspace/envss-auto-dryrun/live-20261123.json", "utf8"));
const M = rows => new Map((rows || []).map(r => [String(r.id || r.item_id), r]));
const store = { v_field_hyg_events: M(j.items), envss_events: M(j.events), envss_deletions: M(j.deletions), envss_projects: M(j.projects), envss_trains: M(j.trains), envss_hires: new Map() };
const { server, base } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
await page.setViewport(VIEWPORTS.chromebook.viewport); await page.setRequestInterception(true);
const log = mockSupabase(page, store, {});
await page.goto(base + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
await page.reload({ waitUntil: "networkidle0" });
for (let i = 0; i < 60 && !(await page.evaluate(() => activityLoaded && projectsLoaded)); i++) await sleep(250);
await page.evaluate(() => { flushing = true; });   /* nothing leaves this page even to the mock */
const before = await page.evaluate(() => db.events.length);
const beforeIds = await page.evaluate(() => db.events.map(e => e.id));
await page.evaluate(() => envssPodio.refresh()); await sleep(1500);
const firstRun = await page.evaluate(() => envssAuto.last());
await page.evaluate(() => envssAuto.run()); await sleep(300);
const out = await page.evaluate((beforeIds) => {
  const L = envssAuto.last(), offers = envssAuto.offers();
  const made = db.events.filter(e => e.podioAuto && !e.updatedAt?.startsWith?.("x")).filter(e => !beforeIds.includes(e.id))
    .map(e => ({ code: e.code, project: (db.projects.find(p => p.id === e.projectId) || {}).number, date: e.date || "(no date)", item: e.podioItemId, ref: e.podioReference, status: (envssAuto.snap().rows.find(r => r.itemId === e.podioItemId) || {}).payload }));
  const off = Object.keys(offers).map(k => { const r = envssAuto.snap().rows.find(x => x.itemId === k); return { item: k, ref: r.payload.reference, start: r.payload.startDate || "(no date)", handMade: offers[k].map(id => { const e = db.events.find(x => x.id === id); return e.code + " @ " + (e.date || "no date"); }) }; });
  const older = envssAuto.snap().rows.filter(r => /more than/.test(envssAuto.eligible(r))).map(r => r.payload.reference.slice(0,45) + " @ " + r.payload.startDate + " · " + r.payload.reportStatus);
  return { older, secondRunSkipped: L.skipped, made: made.map(m => ({ code: m.code, date: m.date, item: m.item, ref: m.ref, startStatus: m.status && m.status.startStatus, report: m.status && m.status.reportStatus, coc: m.status && m.status.cocStatus })), offers: off };
}, beforeIds);
console.log(JSON.stringify({ eventsBefore: before, firstRunSkipped: firstRun.skipped, firstRunCreated: firstRun.created.length, ...out }, null, 1));
console.log("writes attempted:", log.filter(l => /^(POST|PATCH|DELETE)/.test(l)).length);
await browser.close(); server.close();
