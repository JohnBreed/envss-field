/* v46/v47 test harness: serves the repo, fakes a signed-in session, mocks Supabase REST in memory (no production writes). */
import fs from "fs"; import path from "path"; import http from "http";
const puppeteer = (await import("/tmp/pw/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
export const root = process.env.ROOT || "/workspace/envss-field";
export async function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let p = path.join(root, decodeURIComponent(url.pathname));
    if (url.pathname === "/") p = path.join(root, "field.html");
    fs.readFile(p, (err, buf) => {
      if (err) { res.writeHead(404); res.end("missing"); return; }
      const ext = path.extname(p);
      const type = ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : ext === ".svg" ? "image/svg+xml" : ext === ".css" ? "text/css" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(buf);
    });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { server, base: "http://127.0.0.1:" + server.address().port };
}
export const VIEWPORTS = {
  chromebook: { viewport: { width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: true },
    ua: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36" },
  pixel7: { viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36" }
};
export async function launch(extra = []) {
  return puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"].concat(extra) });
}
/* mock store: table -> Map(id -> row) */
export function mockSupabase(page, store, opts = {}) {
  const log = [];
  page.on("request", async req => {
    const u = req.url();
    if (!u.includes(".supabase.co/")) { req.continue(); return; }
    if (store.offline) { req.abort("internetdisconnected"); log.push("ABORT " + req.method() + " " + u.split(".co")[1]); return; }
    const url = new URL(u); const m = req.method();
    log.push(m + " " + url.pathname + url.search.slice(0, 80));
    const hdr = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Content-Type": "application/json" };
    if (m === "OPTIONS") return req.respond({ status: 200, headers: hdr, body: "" });
    const mt = url.pathname.match(/\/rest\/v1\/([a-z_]+)/);
    if (mt) {
      const t = mt[1]; store[t] = store[t] || new Map();
      if (opts.failTables && opts.failTables.includes(t) && m !== "GET") return req.respond({ status: 503, headers: hdr, body: "{}" });
      if (opts.tableStatus && opts.tableStatus[t]) return req.respond({ status: opts.tableStatus[t], headers: Object.assign({ "Retry-After": "60" }, hdr), body: "{}" }).catch(e => { log.push("RESPOND-ERR " + e.message); req.abort(); });
      if (m === "GET") {
        let rows = [...store[t].values()];
        const off = +(url.searchParams.get("offset") || 0), lim = +(url.searchParams.get("limit") || 100000);
        const idEq = url.searchParams.get("id"); if (idEq && idEq.startsWith("eq.")) rows = rows.filter(r => r.id === idEq.slice(3));
        return req.respond({ status: 200, headers: hdr, body: JSON.stringify(rows.slice(off, off + lim)) });
      }
      if (m === "POST" || m === "PATCH") {
        let body = []; try { body = JSON.parse(req.postData() || "[]"); } catch (e) {}
        (Array.isArray(body) ? body : [body]).forEach(r => { if (r && r.id) store[t].set(r.id, Object.assign(store[t].get(r.id) || {}, r)); else if (r) store[t].set("x" + store[t].size, r); });
        return req.respond({ status: 201, headers: hdr, body: "" });
      }
      return req.respond({ status: 200, headers: hdr, body: "[]" });
    }
    if (url.pathname.includes("/storage/v1/")) return req.respond({ status: 200, headers: hdr, body: JSON.stringify({ Key: "ok" }) });
    if (url.pathname.includes("/functions/v1/")) return req.respond({ status: opts.fnStatus || 200, headers: hdr, body: JSON.stringify(opts.fnBody || { rows: [] }) });
    return req.respond({ status: 200, headers: hdr, body: "{}" });
  });
  return log;
}
export const SESSION = `localStorage.setItem("envss-field-auth-v45", JSON.stringify({access_token:"fake.at", refresh_token:"fake-rt", expires_at: Math.floor(Date.now()/1000)+3600, user:{id:"00000000-0000-0000-0000-00000000test", email:"field.test@envss.com.au", name:"V46 Test"}})); localStorage.setItem("envss-field-operator", JSON.stringify({name:"V46 Test", email:"field.test@envss.com.au", source:"google", device:"Chromebook", setAt: new Date().toISOString()}));`;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
