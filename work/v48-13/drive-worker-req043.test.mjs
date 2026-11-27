/* REQ-043 (27 Nov 2026): Drive copy queue false failure. Reproduces the live symptom with a fake Drive whose
   Files.get(alt=media) throws "Response Code: 200. Message: <csv>" (as the Apps Script advanced service does).
   The file was created, but the row stayed queued forever. Run with GS=<path> to test another Code.gs. */
import fs from "fs"; import path from "path"; import vm from "vm"; import { fileURLToPath } from "url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.GS || path.join(dir, "../drive-worker/Code.gs");
const code = fs.readFileSync(SRC, "utf8");
const results = [];
function check(name, ok, detail) { results.push(!!ok); console.log((ok ? "PASS" : "FAIL") + "  " + name + (!ok && detail ? " — " + String(detail).slice(0, 500) : "")); }

function world(rows, opts) {
  opts = opts || {};
  let n = 0; const files = new Map(); const log = [];
  const add = f => { files.set(f.id, f); return f; };
  add({ id: "job", name: "0019145 HYG Example Site", parents: ["shared"], mimeType: "application/vnd.google-apps.folder", appProperties: {} });
  add({ id: "fa", name: "0019145_Field-App", parents: ["job"], mimeType: "application/vnd.google-apps.folder", appProperties: { envssFieldApp: "1" } });
  add({ id: "man", name: "manifest.csv", parents: ["fa"], mimeType: "text/csv", appProperties: { envssManifest: "1", envssFieldApp: "1" },
    text: 'copied_at,job_number,event_code,kind,file_name,drive_file_id,source_key,bytes\n"x","0019145","0019145-001","file","0019145-001_Laboratory_COC.xlsx","coc","file:drv_coc","1"\n' });
  /* Copies already made by the broken worker (file created, row never marked copied). */
  (opts.already || []).forEach(a => add({ id: a.id, name: a.name, parents: ["fa"], mimeType: "image/jpeg", appProperties: { envssSource: a.source, envssFieldApp: "1" } }));
  function match(q, f) {
    if (/trashed = false/.test(q) && f.trashed) return false;
    let m = q.match(/'([^']+)' in parents/); if (m && !(f.parents || []).includes(m[1])) return false;
    m = q.match(/name = '([^']+)'/); if (m && f.name !== m[1]) return false;
    m = q.match(/name contains '([^']+)'/); if (m && !f.name.includes(m[1])) return false;
    if (/mimeType = 'application\/vnd.google-apps.folder'/.test(q) && f.mimeType !== "application/vnd.google-apps.folder") return false;
    m = q.match(/appProperties has \{ key='([^']+)' and value='([^']+)' \}/); if (m && !((f.appProperties || {})[m[1]] === m[2])) return false;
    return true;
  }
  const Drive = { Files: {
    list: a => ({ files: [...files.values()].filter(f => match(a.q, f)).map(f => Object.assign({}, f)) }),
    get: (fid, o) => { if (o && o.alt === "media") throw new Error("Response Code: 200. Message: " + (files.get(fid) || {}).text); return Object.assign({}, files.get(fid)); },
    create: (meta, blob) => { const f = add(Object.assign({ id: "new_" + (++n), appProperties: {} }, meta, { text: blob && blob.t })); log.push(["create", f.name]); return Object.assign({ webViewLink: "https://drive/" + f.id }, f); },
    update: (meta, fid, blob) => { log.push(["update", fid, (files.get(fid) || {}).name]); files.get(fid).text = blob.t; return files.get(fid); }
  } };
  const UrlFetchApp = { fetch: (url, o) => {
    o = o || {};
    const dm = url.match(/googleapis\.com\/drive\/v3\/files\/([^?]+)\?alt=media/);
    if (dm) { const f = files.get(decodeURIComponent(dm[1])); log.push(["read", f && f.name]); return { getResponseCode: () => f ? 200 : 404, getContentText: () => f ? f.text : "" }; }
    if (url.includes("/storage/v1/object/")) return { getResponseCode: () => 200, getBlob: () => ({ t: "jpg", setName() { return this; }, setContentType() { return this; } }) };
    if (url.includes("envss_drive_copies") && o.method === "get") return { getResponseCode: () => 200, getContentText: () => JSON.stringify(rows.filter(r => r.status === "queued")) };
    if (url.includes("envss_drive_copies") && o.method === "patch") {
      const body = JSON.parse(o.payload); const rid = decodeURIComponent((url.match(/id=eq\.([^&]+)/) || [])[1] || "");
      const row = rows.find(r => r.id === rid); if (row) Object.assign(row, body);
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(row ? [row] : []) };
    }
    return { getResponseCode: () => 404, getContentText: () => "" };
  } };
  const ctx = { Drive, UrlFetchApp, console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "test-key-not-real" }) },
    Utilities: { newBlob: (t) => ({ t, setName() { return this; }, setContentType() { return this; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Logger: { log() {} }, ScriptApp: { getOAuthToken: () => "fake-token" }, Object, JSON, Date, String, Math };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { ctx, files, log, rows };
}
const row = (id, name, src) => ({ id, status: "queued", kind: "photo", job_number: "0019145", event_code: "0019145-001", file_name: name, bucket: "field-photos", storage_path: "p/x/" + id + ".jpg", source_key: src, tries: 16 });

/* 1. Stuck rows whose files are already in Drive: marked copied, pointing at the existing file, no new upload. */
{
  const w = world([row("r1", "0019145-001_S01_log_1.jpg", "photo:a"), row("r2", "0019145-001_S02_log_1.jpg", "photo:b")],
    { already: [{ id: "A", name: "0019145-001_S01_log_1.jpg", source: "photo:a" }, { id: "B", name: "0019145-001_S02_log_1.jpg", source: "photo:b" }] });
  w.ctx.processDriveQueue();
  check("stuck rows are marked copied", w.rows.every(r => r.status === "copied"), JSON.stringify(w.rows));
  check("rows point at the files already in Drive", w.rows[0].drive_file_id === "A" && w.rows[1].drive_file_id === "B", JSON.stringify(w.rows));
  check("no new file is uploaded (no _2 duplicates)", !w.log.some(l => l[0] === "create"), JSON.stringify(w.log));
  const t = w.files.get("man").text;
  check("manifest gets one line per backfilled row", t.split("photo:a").length === 2 && t.split("photo:b").length === 2, t);
  check("only manifest.csv is updated", w.log.filter(l => l[0] === "update").every(l => l[2] === "manifest.csv"), JSON.stringify(w.log));
}
/* 2. New file in a folder that already has a manifest: uploaded once and marked copied. */
{
  const w = world([row("r3", "0019145-001_S07_log_1.jpg", "photo:c")]);
  w.ctx.processDriveQueue();
  check("new copy in an existing folder is marked copied", w.rows[0].status === "copied" && !!w.rows[0].drive_file_id, JSON.stringify(w.rows));
  check("uploaded exactly once", w.log.filter(l => l[0] === "create").length === 1, JSON.stringify(w.log));
  w.rows[0].status = "queued"; w.rows[0].drive_file_id = null; w.ctx.processDriveQueue();
  check("re-queued row reuses the file, never a second copy", w.log.filter(l => l[0] === "create").length === 1, JSON.stringify(w.log));
}
/* 3. Manifest read fails: the row is still marked copied (manifest never blocks). */
{
  const w = world([row("r4", "0019145-001_S08_log_1.jpg", "photo:d")]);
  w.files.get("man").text = undefined; w.files.delete("man");
  w.files.set("man", { id: "man", name: "manifest.csv", parents: ["fa"], appProperties: { envssManifest: "1" } });
  const orig = w.ctx.UrlFetchApp.fetch;
  w.ctx.UrlFetchApp.fetch = (u, o) => /googleapis/.test(u) ? { getResponseCode: () => 500, getContentText: () => "" } : orig(u, o);
  w.ctx.processDriveQueue();
  check("manifest error does not leave the row queued", w.rows[0].status === "copied", JSON.stringify(w.rows));
}
check("source still has no delete / copy / move", !/Drive\.Files\.(remove|delete|copy)|addParents|removeParents|setTrashed/.test(code));
check("source no longer uses Drive.Files.get alt=media", !/Drive\.Files\.get\([^)]*alt:\s*"media"/.test(code));
console.log("\n" + results.filter(Boolean).length + " passed, " + results.filter(r => !r).length + " failed");
process.exit(results.every(Boolean) ? 0 : 1);
