/* Node tests for the CoC send worker (Code.gs) with Apps Script, Gmail and Supabase mocked in memory. Nothing is sent anywhere. */
import fs from "fs"; import vm from "vm"; import path from "path"; import { fileURLToPath } from "url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "Code.gs"), "utf8");
const results = [];
function check(n, ok, d) { results.push({ name: n, ok: !!ok }); console.log((ok ? "PASS" : "FAIL") + "  " + n + (!ok && d ? " — " + String(d).slice(0, 600) : "")); }

function world(opts) {
  opts = opts || {};
  const rows = new Map(), files = new Map(), sent = [], logs = [];
  const mk = (code, body) => ({ getResponseCode: () => code, getContentText: () => typeof body === "string" ? body : JSON.stringify(body), getBlob: () => ({ getBytes: () => Array.from(body) }) });
  const ctx = {
    Logger: { log: m => logs.push(String(m)) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === "coc-worker" && !opts.noKey) ? "test-secret" : null }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }) },
    Utilities: {
      base64Encode: b => Buffer.from(b).toString("base64"),
      base64EncodeWebSafe: s => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
      newBlob: (s) => ({ getBytes: () => Array.from(Buffer.from(String(s), "utf8")) })
    },
    Gmail: { Users: { Messages: { send: (res, me) => { if (opts.gmailFails) throw new Error("Gmail down"); const raw = Buffer.from(res.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); sent.push(raw); return { id: "msg" + sent.length, threadId: "th" + sent.length }; } }, Settings: { SendAs: { list: () => ({ sendAs: opts.noAlias ? [{ sendAsEmail: "developer@envss.com.au" }] : [{ sendAsEmail: "lab@envss.com.au", verificationStatus: "accepted" }] }) } } } },
    UrlFetchApp: {
      fetch: (url, o) => {
        o = o || {}; const u = new URL(url), m = String(o.method || "get").toLowerCase();
        if (u.pathname.startsWith("/storage/v1/object/")) { const p = decodeURIComponent(u.pathname.replace("/storage/v1/object/", "")); return files.has(p) ? mk(200, files.get(p)) : mk(404, "{}"); }
        if (u.pathname.startsWith("/rest/v1/envss_coc_sends")) {
          const q = u.searchParams, f = r => { for (const [k, v] of q) { if (["select", "order", "limit"].includes(k)) continue; const [op, val] = [v.split(".")[0], v.slice(v.indexOf(".") + 1)]; const x = String(r[k] == null ? "" : r[k]); if (op === "eq" && x !== val) return false; if (op === "lte" && !(x <= val)) return false; } return true; };
          if (m === "get") { let a = [...rows.values()].filter(f); return mk(200, a.slice(0, +(q.get("limit") || 100))); }
          if (m === "patch") { const hit = [...rows.values()].filter(f); const body = JSON.parse(o.payload); hit.forEach(r => Object.assign(r, body)); return mk(200, hit); }
        }
        return mk(404, "{}");
      }
    }
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const add = (r, fs2) => { rows.set(r.id, Object.assign({ status: "queued", next_at: "2020-01-01T00:00:00Z", tries: 0, from_addr: "lab@envss.com.au", kind: "send", to_addr: "ohlwa@mpl.com.au", cc_addr: null, reply_to: "lab@envss.com.au", requested_at: "2026-11-28T00:00:00Z", body_html: "<p>hi</p>", attachments: [] }, r)); (fs2 || []).forEach(f => files.set("field-exports/" + f.path, Buffer.from(f.data))); };
  return { ctx, rows, sent, logs, add, run: () => vm.runInContext("processCocQueue()", ctx), files };
}
const att = (n, mime) => ({ name: n, mime, bucket: "field-exports", path: "g/0019358/0019358-001/coc-send/cs_1/" + n, bytes: 4 });
const sendRow = (o) => Object.assign({ id: "cs_1", subject: "ENVSS chain of custody 0019358-001 (5 samples)", body_text: "RESULTS REQUIRED IN ESDAT FORMAT\nHello", attachments: [att("a.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), att("a.pdf", "application/pdf")] }, o || {});
const filesFor = (r) => r.attachments.map(a => ({ path: a.path, data: "DATA" + a.name }));

{ const w = world(); w.add(sendRow(), filesFor(sendRow())); w.run();
  const r = w.rows.get("cs_1"), raw = w.sent[0] || "";
  check("send row: one email sent, row marked sent with gmail ids and time", w.sent.length === 1 && r.status === "sent" && r.gmail_message_id === "msg1" && !!r.sent_at, JSON.stringify(r));
  check("email headers: From ENVSS Lab <lab@>, To the lab only, Reply-To lab@, no Cc", /From: ENVSS Lab <lab@envss\.com\.au>/.test(raw) && /To: ohlwa@mpl\.com\.au/.test(raw) && /Reply-To: lab@envss\.com\.au/.test(raw) && !/^Cc:/m.test(raw) && !/^Bcc:/m.test(raw), raw.slice(0, 400));
  check("email has both attachments, base64 content intact", /filename="a\.xlsx"/.test(raw) && /filename="a\.pdf"/.test(raw) && raw.includes(Buffer.from("DATAa.pdf").toString("base64")), raw.slice(0, 900));
  check("email has plain + html parts and the row id header", /text\/plain/.test(raw) && /text\/html/.test(raw) && /X-ENVSS-Row: cs_1/.test(raw)); 
  w.run(); check("running again does not send it twice (at most once)", w.sent.length === 1); }
{ const w = world(); const rr = sendRow({ id: "al_1", kind: "alert", to_addr: "john@envss.com.au", subject: "[ENVSS Field] CoC error report", body_text: "TECH FLAG: SOMETHING LOOKS WRONG\nx", attachments: [att("p.pdf", "application/pdf"), att("p.png", "image/png")] });
  w.add(rr, filesFor(rr)); w.run(); check("alert row goes to john@ with PDF + PNG attached", w.sent.length === 1 && /To: john@envss\.com\.au/.test(w.sent[0]) && /p\.png/.test(w.sent[0]) && w.rows.get("al_1").status === "sent"); }
{ const w = world(); w.add(sendRow({ to_addr: "someone@example.com" }), filesFor(sendRow())); w.run(); check("a send row to any other address is refused and marked failed", w.sent.length === 0 && w.rows.get("cs_1").status === "failed" && /recipient not allowed/.test(w.rows.get("cs_1").message)); }
{ const w = world(); w.add(sendRow({ kind: "alert", to_addr: "ohlwa@mpl.com.au", tech_flag: {} }), filesFor(sendRow())); w.run(); check("an alert to the lab address is refused", w.sent.length === 0 && w.rows.get("cs_1").status === "failed"); }
{ const w = world(); w.add(sendRow({ from_addr: "developer@envss.com.au" }), filesFor(sendRow())); w.run(); check("a row not From lab@ is refused", w.sent.length === 0 && w.rows.get("cs_1").status === "failed"); }
{ const w = world(); w.add(sendRow({ cc_addr: "tech@envss.com.au" }), filesFor(sendRow())); w.run(); check("a row with a Cc is refused (tech email must never reach the lab)", w.sent.length === 0 && w.rows.get("cs_1").status === "failed"); }
{ const w = world(); w.add(sendRow(), []); w.run(); const r = w.rows.get("cs_1"); check("missing attachment: nothing sent, row goes back to queued with a later next_at", w.sent.length === 0 && r.status === "queued" && /not found/.test(r.message) && r.next_at > "2026-01-01" && r.next_at !== "2020-01-01T00:00:00Z", JSON.stringify(r)); }
{ const w = world({ gmailFails: true }); w.add(sendRow({ tries: 4 }), filesFor(sendRow())); w.run(); check("Gmail failure on the 5th try: row marked failed (not retried forever)", w.rows.get("cs_1").status === "failed" && /Gmail down/.test(w.rows.get("cs_1").message)); }
{ const w = world({ noAlias: true }); w.add(sendRow(), filesFor(sendRow())); w.run(); check("lab@ not a verified Send-as alias: nothing sent (Gmail would otherwise send From developer@)", w.sent.length === 0 && /Send-as/.test(w.rows.get("cs_1").message || ""), JSON.stringify(w.rows.get("cs_1"))); }
{ const w = world(); w.add(sendRow({ id: "cs_9", status: "sending", claimed_at: new Date(Date.now() - 30 * 60000).toISOString() }), []); w.run(); check("a row stuck in 'sending' for 15+ min is marked failed, never re-sent", w.sent.length === 0 && w.rows.get("cs_9").status === "failed" && /Sent folder/.test(w.rows.get("cs_9").message)); }
{ const w = world({ noKey: true }); w.add(sendRow(), filesFor(sendRow())); let err = ""; try { w.run(); } catch (e) { err = String(e.message || e); } check("no coc-worker key: stops with a clear message", /coc-worker is not set/.test(err), err); }
{ const w = world(); w.add(sendRow({ id: "cs_a", subject: "Chain – AMENDED é" }), filesFor(sendRow())); w.run(); check("non-ASCII subject is RFC 2047 encoded", /Subject: =\?UTF-8\?B\?/.test(w.sent[0] || ""), (w.sent[0] || "").slice(0, 300)); }
const f = results.filter(r => !r.ok); console.log("\n" + (results.length - f.length) + " passed, " + f.length + " failed"); process.exit(f.length ? 1 : 0);
