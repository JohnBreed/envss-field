/* v48.19 test: the project pull downloads only active jobs + safety-net jobs (John 28 Nov 2026 AWST).
   Usage: ROOT=/workspace/envss-v4819 node work/v48-19/projects-pull.test.mjs
   Supabase is mocked in memory (the mock applies the same or(...)/id=in.(...) filters PostgREST would). Nothing reaches production. Fixture data is made up. */
import { serve, launch, VIEWPORTS, SESSION, sleep } from "./harness.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log((ok ? "PASS" : "FAIL") + "  " + n + (!ok && d ? " — " + d : "")); };
const mk = (id, number, status, source, jobType) => ({ id, payload: { id, number, name: "Job " + number, site: "Site", client: "Client", source, status, jobType: jobType || "HYG - Occupational Hygiene", active: !/^(Closed|Cancelled|On Hold)$/.test(status) }, updated_at: "2026-11-20T00:00:00Z" });
const PROJECTS = [
  mk("podio-1", "0010001", "In Progress", "podio"), mk("podio-2", "0010002", "Report Pending", "podio", "Retired - HAZ - Hazardous Materials"),
  mk("podio-3", "0010003", "Closed", "podio"), mk("podio-4", "0010004", "Cancelled", "podio"), mk("podio-5", "0010005", "On Hold", "podio"),
  mk("podio-6", "0010006", "Closed", "podio"),   /* closed but has a field event: safety net */
  mk("podio-7", "0010007", "Closed", "podio"),   /* closed, event only on this device: safety net */
  mk("p-field", "0019900", "In Progress", "field"), mk("podio-8", "0010008", "Closed", "podio")
];
const EVENTS = [{ id: "e6", project_id: "podio-6", payload: { id: "e6", projectId: "podio-6", code: "0010006-001", type: "hygiene", date: "2026-11-20", stage: "planned", audit: [] }, updated_at: "2026-11-20T00:00:00Z" }];
const log = [];
const parseOr = f => { const inner = f.slice(1, -1); return inner.split(/,(?![^()]*\))/); };
function matchOr(row, f) {
  const src = row.payload.source, st = row.payload.status;
  return parseOr(f).some(c => {
    if (c === "payload->>source.is.null") return src == null;
    if (c === "payload->>source.neq.podio") return src != null && src !== "podio";
    const m = c.match(/^payload->>status\.not\.in\.\((.*)\)$/);
    if (m) { const set = m[1].split(",").map(x => x.replace(/^"|"$/g, "")); return st != null && !set.includes(st); }
    throw new Error("unsupported filter " + c);
  });
}
const { server, base } = await serve();
const browser = await launch();
const page = await browser.newPage();
await page.setViewport(VIEWPORTS.pixel7.viewport); await page.setUserAgent(VIEWPORTS.pixel7.ua);
await page.setRequestInterception(true);
page.on("request", async req => {
  const u = req.url();
  if (!u.includes(".supabase.co/")) return req.continue();
  const url = new URL(u); const hdr = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Content-Type": "application/json" };
  if (req.method() === "OPTIONS") return req.respond({ status: 200, headers: hdr, body: "" });
  const mt = url.pathname.match(/\/rest\/v1\/([a-z_]+)/);
  if (!mt || req.method() !== "GET") return req.respond({ status: 200, headers: hdr, body: req.method() === "GET" ? "[]" : "" });
  const t = mt[1]; let rows = [];
  if (t === "envss_projects") {
    log.push(url.search);
    rows = PROJECTS.slice();
    const or = url.searchParams.get("or"); if (or) rows = rows.filter(r => matchOr(r, or));
    const id = url.searchParams.get("id"); if (id && id.startsWith("in.")) { const set = id.slice(4, -1).split(",").map(x => x.replace(/^"|"$/g, "")); rows = rows.filter(r => set.includes(r.id)); }
  } else if (t === "envss_events") rows = EVENTS.map(e => Object.assign({}, e));
  const sel = url.searchParams.get("select");
  if (sel === "project_id") rows = rows.map(r => ({ project_id: r.project_id }));
  return req.respond({ status: 200, headers: hdr, body: JSON.stringify(rows) });
});
await page.goto(base + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
await page.evaluate(() => localStorage.setItem("envss-field-next-v32", JSON.stringify({ projects: [], events: [{ id: "eLocal", projectId: "podio-7", code: "0010007-001", type: "hygiene", date: "2026-11-27", stage: "planned", audit: [] }], trains: [], deletions: [], hires: [], fitReports: [], catalogs: {}, _savedAt: new Date(Date.now() + 60000).toISOString() })));
await page.reload({ waitUntil: "networkidle0" }); await sleep(2500);
await page.evaluate(() => { db.events.push({ id: "eLocal", projectId: "podio-7", code: "0010007-001", type: "hygiene", date: "2026-11-27", stage: "planned", audit: [] }); });
const rows = await page.evaluate(() => fetchProjectRows().then(r => r.map(x => x.id).sort()));
const want = ["p-field", "podio-1", "podio-2", "podio-6", "podio-7"].sort();
check("pull returns field + active + event-linked projects only (5 of 9)", JSON.stringify(rows) === JSON.stringify(want), JSON.stringify(rows));
check("closed, cancelled and on-hold jobs without an event are not downloaded", !rows.some(i => ["podio-3", "podio-4", "podio-5", "podio-8"].includes(i)));
check("a job closed in Podio but with a server event stays (safety net, server list)", rows.includes("podio-6"));
check("a job closed in Podio but with an event only on this device stays (safety net, device list)", rows.includes("podio-7"));
check("an active AFM job typed HAZ is kept (rule is status, not job type)", rows.includes("podio-2"));
check("the pull used the server-side filter, not the full-table download", log.length >= 1 && /or=/.test(log[0]) && log.every(s => /or=|id=in\./.test(s)), JSON.stringify(log));
await page.evaluate(() => { projectsLoaded = false; return pullProjects(); }); await sleep(800);
const st = await page.evaluate(() => ({ n: syncState.projectRowCount, loaded: projectsLoaded, err: syncState.lastError, local: db.projects.length }));
check("pullProjects merges the 5 rows and reports the count", st.n === 5 && st.loaded && !st.err && st.local === 5, JSON.stringify(st));
await page.setRequestInterception(false);
await browser.close(); server.close();
const fails = results.filter(x => !x).length; console.log(fails ? "FAILED " + fails : "ALL PASS " + results.length); process.exit(fails ? 1 : 0);
