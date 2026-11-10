/* Upgrade-path harness: v45c -> v46 -> v47 on persistent "devices" (Chrome profiles) against an in-memory
   PostgREST-like mock seeded with a COPY of the live rows. Never talks to the live Supabase. */
import fs from "fs"; import path from "path"; import http from "http"; import crypto from "crypto"; import { execSync } from "child_process";
const puppeteer = (await import("/tmp/pw/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const LIVE = "/tmp/upg/live-" + process.pid;
export function setVersion(v) { execSync(`rm -rf ${LIVE} && mkdir -p ${LIVE} && cp -r /tmp/upg/${v}/. ${LIVE}/`); fs.appendFileSync(LIVE + "/config.js", "\n/* TEST ONLY (mock run): tester A is an admin so sample deletes (tombstones) can be exercised */ window.ENVSS_CONFIG.admins = [\"tester.a@envss.com.au\"];\n"); }
export async function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let p = path.join(LIVE, decodeURIComponent(url.pathname));
    if (url.pathname === "/") p = path.join(LIVE, "field.html");
    if (server.down) { req.socket.destroy(); return; }
    fs.readFile(p, (err, buf) => {
      if (err) { res.writeHead(404); res.end("missing"); return; }
      const ext = path.extname(p);
      const type = ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : ext === ".svg" ? "image/svg+xml" : ext === ".css" ? "text/css" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "max-age=0, must-revalidate" }); res.end(buf);
    });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { server, base: "http://127.0.0.1:" + server.address().port };
}
const DIR = "/workspace/envss-field/work/datacheck";
const LIVE_TABLES = ["envss_projects", "envss_events", "envss_trains", "envss_deletions", "envss_hires", "envss_state", "envss_login_log", "envss_admins"];
const VIEWS = ["v_field_pumps", "v_field_hyg_events"];
export function seedStore() {
  const st = { offline: false, writes: [], errors: [] };
  LIVE_TABLES.forEach(t => st[t] = new Map());
  const rows = JSON.parse(fs.readFileSync(DIR + "/before_1_fullrows_events_trains_deletions.json")).concat(JSON.parse(fs.readFileSync(DIR + "/before_1_fullrows_projects_referenced.json")));
  rows.forEach(x => { const r = JSON.parse(x.j); st[x.t].set(r.id, r); });
  return st;
}
const H = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "*", "Content-Type": "application/json" };
export function attachMock(page, st, dev) {
  page.on("request", req => {
    const u = req.url();
    if (/cdn\.jsdelivr|googleapis|gstatic|google\.com/.test(u)) return req.respond({ status: 200, headers: { "Content-Type": "text/javascript" }, body: "" });
    if (!u.includes(".supabase.co/")) return req.continue();
    const m = req.method();
    if (m === "OPTIONS") return req.respond({ status: 200, headers: H, body: "" });
    if (st.offline || dev.supaOff) { req.abort("internetdisconnected"); return; }
    const url = new URL(u);
    const mt = url.pathname.match(/\/rest\/v1\/([a-z_]+)/);
    if (!mt) return req.respond({ status: 200, headers: H, body: url.pathname.includes("/functions/") ? '{"rows":[]}' : "{}" });
    const t = mt[1];
    if (VIEWS.includes(t)) return req.respond({ status: 200, headers: H, body: "[]" });
    if (!LIVE_TABLES.includes(t)) return req.respond({ status: 404, headers: H, body: JSON.stringify({ code: "42P01", message: "relation does not exist" }) });
    const tab = st[t];
    const idEq = (url.searchParams.get("id") || "").startsWith("eq.") ? decodeURIComponent(url.searchParams.get("id").slice(3)) : null;
    if (m === "GET") {
      let rows = [...tab.values()].sort((a, b) => String(a.id) < String(b.id) ? -1 : 1);
      if (idEq) rows = rows.filter(r => r.id === idEq);
      const off = +(url.searchParams.get("offset") || 0), lim = +(url.searchParams.get("limit") || 1e6);
      return req.respond({ status: 200, headers: H, body: JSON.stringify(rows.slice(off, off + lim)) });
    }
    let body; try { body = JSON.parse(req.postData() || "null"); } catch (e) { body = null; }
    const list = Array.isArray(body) ? body : [body];
    const prefer = req.headers()["prefer"] || "";
    if (m === "POST") {
      const upsert = /merge-duplicates/.test(prefer) || url.searchParams.has("on_conflict");
      for (const r of list) {
        if (!r) continue;
        const id = r.id || ("gen-" + crypto.randomUUID());
        const prev = tab.get(id);
        if (prev && !upsert) { st.errors.push(dev.name + " 409 " + t + " " + id); return req.respond({ status: 409, headers: H, body: "{}" }); }
        st.writes.push({ dev: dev.name, ver: dev.ver, m, t, id, at: Date.now(), replaced: !!prev });
        tab.set(id, Object.assign({}, prev || {}, r, { id }));   // PostgREST upsert: supplied columns replace the old ones
      }
      return req.respond({ status: 201, headers: H, body: "" });
    }
    if (m === "PATCH") {
      if (!idEq) { st.errors.push(dev.name + " PATCH without id " + t); return req.respond({ status: 400, headers: H, body: "{}" }); }
      const prev = tab.get(idEq); if (prev) { tab.set(idEq, Object.assign({}, prev, body)); st.writes.push({ dev: dev.name, ver: dev.ver, m, t, id: idEq, at: Date.now(), replaced: true }); }
      return req.respond({ status: 204, headers: H, body: "" });
    }
    if (m === "DELETE") { st.writes.push({ dev: dev.name, ver: dev.ver, m, t, id: idEq, at: Date.now() }); st.errors.push(dev.name + " DELETE " + t + " " + idEq); return req.respond({ status: 204, headers: H, body: "" }); }
    return req.respond({ status: 405, headers: H, body: "{}" });
  });
}
const UA = { chromebook: ["Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36", { width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: true }],
  pixel7: ["Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36", { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }] };
export async function device(name, kind, st, base) {
  const prof = "/tmp/upg/prof-" + process.pid + "-" + name; execSync(`rm -rf ${prof}`);
  const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, userDataDir: prof, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const dev = { name, kind, browser, ver: "", errs: [], dialogs: [] };
  async function newPage() {
    const page = await browser.newPage();
    await page.setUserAgent(UA[kind][0]); await page.setViewport(UA[kind][1]);
    await page.setRequestInterception(true); attachMock(page, st, dev);
    page.on("pageerror", e => dev.errs.push(String(e).slice(0, 200)));
    page.on("dialog", d => { dev.dialogs.push(d.message().slice(0, 120)); d.accept(); });
    return page;
  }
  dev.page = await newPage();
  dev.reopen = async () => { try { await dev.page.close(); } catch (e) {} dev.page = await newPage(); };
  const who = name === "A" ? "Field Tester A" : "Field Tester B";
  dev.session = `localStorage.setItem("envss-field-auth-v45", JSON.stringify({access_token:"fake.at", refresh_token:"fake-rt", expires_at: Math.floor(Date.now()/1000)+36000, user:{id:"00000000-0000-0000-0000-0000000000${name === "A" ? "0a" : "0b"}", email:"tester.${name.toLowerCase()}@envss.com.au", name:"${who}"}})); localStorage.setItem("envss-field-operator", JSON.stringify({name:"${who}", email:"tester.${name.toLowerCase()}@envss.com.au", source:"google", device:"${kind === "pixel7" ? "Android" : "Chromebook"}", setAt: new Date().toISOString()}));`;
  dev.open = async (first) => {
    if (first) { await dev.page.goto(base + "/field.html", { waitUntil: "load" }); await dev.page.evaluate(dev.session); }
    await dev.page.goto(base + "/field.html", { waitUntil: "load", timeout: 30000 }).catch(e => dev.errs.push("goto " + e.message));
    await sleep(500);
    dev.ver = await dev.page.evaluate(() => typeof APP_VERSION !== "undefined" ? APP_VERSION + (window.ENVSS_NOISE ? "/noise " + ENVSS_NOISE.version : "") : "?").catch(() => "?");
    return dev.ver;
  };
  dev.ev = (fn, ...a) => dev.page.evaluate(fn, ...a);
  dev.settle = async (ms = 4000) => { await sleep(ms); };
  dev.dump = () => dev.ev(() => {
    const d = JSON.parse(localStorage.getItem("envss-field-next-v32") || "null");
    const s = JSON.parse(localStorage.getItem("envss-field-next-v32-sync") || "null");
    return { d, pending: s ? Object.keys(s.pending || {}) : [], app: typeof APP_VERSION !== "undefined" ? APP_VERSION : "?", sw: navigator.serviceWorker && navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : "" };
  });
  dev.close = () => browser.close();
  return dev;
}
/* ---------- comparison ---------- */
export function stable(v, skip) {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return "[" + v.map(x => stable(x, skip)).join(",") + "]";
  return "{" + Object.keys(v).filter(k => v[k] !== undefined && !(skip && skip[k])).sort().map(k => JSON.stringify(k) + ":" + stable(v[k], skip)).join(",") + "}";
}
function diffPaths(a, b, p = "", out = []) {
  if (stable(a) === stable(b)) return out;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => diffPaths(a[k], b[k], p ? p + "." + k : k, out));
  } else out.push(p + ": " + String(stable(a)).slice(0, 60) + " -> " + String(stable(b)).slice(0, 60));
  return out;
}
export const COLLS = ["projects", "events", "trains", "deletions", "hires"];
export function localDiff(before, after, opts = {}) {
  const r = { missing: [], added: [], changed: [], volatileOnly: [] };
  for (const c of COLLS) {
    const A = new Map(((before.d || {})[c] || []).map(x => [x.id || x.trainId || x.at, x])), B = new Map(((after.d || {})[c] || []).map(x => [x.id || x.trainId || x.at, x]));
    for (const [id, x] of A) {
      if (!B.has(id)) { r.missing.push(c + ":" + id); continue; }
      const y = B.get(id);
      if (stable(x) !== stable(y)) {
        const dp = diffPaths(x, y);
        if (dp.every(s => /^updatedAt:/.test(s))) r.volatileOnly.push(c + ":" + id); else r.changed.push(c + ":" + id + " { " + dp.slice(0, 6).join("; ") + " }");
      }
    }
    for (const id of B.keys()) if (!A.has(id)) r.added.push(c + ":" + id);
    const dupIds = (((after.d || {})[c]) || []).map(x => x.id).filter(Boolean); const dups = dupIds.filter((x, i) => dupIds.indexOf(x) !== i);
    if (dups.length) r.changed.push(c + " DUPLICATE ids " + dups.join(","));
  }
  return r;
}
export function serverSnap(st) {
  const o = {}; ["envss_projects", "envss_events", "envss_trains", "envss_deletions", "envss_hires"].forEach(t => { o[t] = new Map([...st[t]].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])); }); return o;
}
export function serverDiff(a, b) {
  const r = { missing: [], added: [], changed: [] };
  for (const t of Object.keys(a)) {
    for (const [id, x] of a[t]) {
      if (!b[t].has(id)) { r.missing.push(t + ":" + id); continue; }
      const y = b[t].get(id);
      if (stable(x) !== stable(y)) r.changed.push(t + ":" + id + " { " + diffPaths(x, y).slice(0, 6).join("; ") + " }");
    }
    for (const id of b[t].keys()) if (!a[t].has(id)) r.added.push(t + ":" + id);
  }
  return r;
}
export function counts(st) { const o = {}; ["envss_projects", "envss_events", "envss_trains", "envss_deletions", "envss_hires", "envss_login_log"].forEach(t => o[t] = st[t].size); return o; }
