/* v48.13 Drive copy worker (Apps Script) simulation: fake Drive, Supabase and Storage, no network.
   Checks the Fit-Tests folder, the legacy "Fit Test" folder (left alone, read only) and that nothing existing is changed. */
import fs from "fs"; import path from "path"; import vm from "vm"; import { fileURLToPath } from "url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.GS || path.join(dir, "../drive-worker/Code.gs");
const code = fs.readFileSync(SRC, "utf8");
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (!ok && detail ? " — " + String(detail).slice(0, 600) : "")); }

function world(opts) {
  let n = 0; const id = p => p + "_" + (++n);
  const files = new Map(); const log = [];
  const add = f => { files.set(f.id, f); return f; };
  add({ id: "job", name: "0019389 HYG Example Site", parents: ["shared"], mimeType: "application/vnd.google-apps.folder", appProperties: {} });
  add({ id: "fa", name: "0019389_Field-App", parents: ["job"], mimeType: "application/vnd.google-apps.folder", appProperties: { envssFieldApp: "1" } });
  if (opts.legacy) {
    add({ id: "old", name: "Fit Test", parents: ["fa"], mimeType: "application/vnd.google-apps.folder", appProperties: { envssFitTest: "1" } });
    add({ id: "oldpdf", name: "Breed_John_Aura-9322A_25-11-2026.pdf", parents: ["old"], mimeType: "application/pdf", appProperties: { envssSource: "file:drv_old", envssFieldApp: "1" } });
  }
  const before = JSON.stringify([...files.values()]);
  function match(q, f) {
    if (/trashed = false/.test(q) && f.trashed) return false;
    let m = q.match(/'([^']+)' in parents/); if (m && !(f.parents || []).includes(m[1])) return false;
    m = q.match(/name = '([^']+)'/); if (m && f.name !== m[1]) return false;
    /* Job-folder search returns every folder whose name contains the job number, {job}_Field-App included;
       the worker must pick the outermost one. */
    m = q.match(/name contains '([^']+)'/); if (m && !f.name.includes(m[1])) return false;
    if (/mimeType = 'application\/vnd.google-apps.folder'/.test(q) && f.mimeType !== "application/vnd.google-apps.folder") return false;
    m = q.match(/appProperties has \{ key='([^']+)' and value='([^']+)' \}/); if (m && !((f.appProperties || {})[m[1]] === m[2])) return false;
    return true;
  }
  const Drive = { Files: {
    list: a => { log.push(["list", a.q]); return { files: [...files.values()].filter(f => match(a.q, f)).map(f => Object.assign({}, f)) }; },
    create: (meta, blob) => { const f = add(Object.assign({ id: id("new"), mimeType: meta.mimeType || "application/pdf", appProperties: {} }, meta, { bytes: blob ? 1 : 0 })); log.push(["create", f.name, (meta.parents || [])[0]]); return Object.assign({ webViewLink: "https://drive/" + f.id }, f); },
    update: (meta, fid) => { log.push(["update", fid, (files.get(fid) || {}).name]); const f = files.get(fid); if (f) f.updated = (f.updated || 0) + 1; return f; },
    remove: fid => { log.push(["delete", fid]); }, copy: () => { log.push(["copy"]); }
  } };
  const patches = [];
  const rows = opts.rows;
  const UrlFetchApp = { fetch: (url, o) => {
    o = o || {};
    if (url.includes("/storage/v1/object/")) return { getResponseCode: () => 200, getBlob: () => ({ setName() { return this; }, setContentType() { return this; } }) };
    if (url.includes("envss_drive_copies") && (o.method === "get")) return { getResponseCode: () => 200, getContentText: () => JSON.stringify(rows.filter(r => r.status === "queued")) };
    if (url.includes("envss_drive_copies") && o.method === "patch") {
      const body = JSON.parse(o.payload); const rid = decodeURIComponent((url.match(/id=eq\.([^&]+)/) || [])[1] || "");
      patches.push({ rid, body });
      const row = rows.find(r => r.id === rid); if (row) Object.assign(row, body);
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(row ? [row] : []) };
    }
    return { getResponseCode: () => 404, getContentText: () => "" };
  } };
  const ctx = {
    Drive, UrlFetchApp, console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "test-key-not-real" }) },
    Utilities: { newBlob: (t) => ({ t, setName() { return this; }, setContentType() { return this; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Logger: { log() {} }, ScriptApp: {}, Object, JSON, Date, String, Math
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { ctx, files, log, patches, rows, before };
}
const row = (over) => Object.assign({ id: "r1", status: "queued", kind: "file", job_number: "0019389", event_code: "0019389-FIT-001", file_name: "Breed_John_Aura-9322A_25-11-2026.pdf", bucket: "field-exports", storage_path: "g/0019389/x/y.pdf", source_key: "file:drv_new", tries: 0 }, over);

/* 1. No fit folder yet: Fit-Tests is created inside {job}_Field-App and the PDF goes in it. */
{
  const w = world({ legacy: false, rows: [row()] });
  w.ctx.processDriveQueue();
  const ft = [...w.files.values()].filter(f => f.name === "Fit-Tests");
  const pdf = [...w.files.values()].find(f => f.appProperties && f.appProperties.envssSource === "file:drv_new");
  check("creates Fit-Tests inside 0019389_Field-App when missing", ft.length === 1 && ft[0].parents[0] === "fa" && ft[0].appProperties.envssFitTest === "1", JSON.stringify(ft));
  check("fit PDF is created in Fit-Tests", pdf && pdf.parents[0] === (ft[0] || {}).id, JSON.stringify(pdf));
  check("row marked copied with the Fit-Tests folder id", w.rows[0].status === "copied" && w.rows[0].drive_folder_id === (ft[0] || {}).id, JSON.stringify(w.rows[0]));
  check("manifest.csv stays in {job}_Field-App", [...w.files.values()].some(f => f.name === "manifest.csv" && f.parents[0] === "fa"));
  check("no 'Fit Test' folder is created", ![...w.files.values()].some(f => f.name === "Fit Test"));
}
/* 2. Old "Fit Test" folder exists (v48.12): left alone; a v48.12-queued copy goes to Fit-Tests. */
{
  const w = world({ legacy: true, rows: [row({ id: "r2", source_key: "file:drv_v4812_queued" })] });
  const oldBefore = JSON.stringify([w.files.get("old"), w.files.get("oldpdf")]);
  w.ctx.processDriveQueue();
  const ft = [...w.files.values()].filter(f => f.name === "Fit-Tests");
  const pdf = [...w.files.values()].find(f => f.appProperties && f.appProperties.envssSource === "file:drv_v4812_queued");
  check("v48.12-queued fit copy goes to Fit-Tests (old Fit Test folder exists)", ft.length === 1 && pdf && pdf.parents[0] === ft[0].id, JSON.stringify({ ft, pdf }));
  check("old 'Fit Test' folder and its PDF are unchanged (not moved, renamed or written)", JSON.stringify([w.files.get("old"), w.files.get("oldpdf")]) === oldBefore, oldBefore);
  check("nothing is created inside the old 'Fit Test' folder", !w.log.some(l => l[0] === "create" && l[2] === "old"), JSON.stringify(w.log));
}
/* 3. Copy already in the old folder (same source_key): not uploaded again, nothing moved. */
{
  const w = world({ legacy: true, rows: [row({ id: "r3", source_key: "file:drv_old" })] });
  w.ctx.processDriveQueue();
  const creates = w.log.filter(l => l[0] === "create" && l[1] !== "manifest.csv" && l[1] !== "Fit-Tests");
  check("existing copy in old 'Fit Test' is reused, not uploaded twice", creates.length === 0 && w.rows[0].status === "copied" && w.rows[0].drive_file_id === "oldpdf" && w.rows[0].drive_folder_id === "old", JSON.stringify({ creates, row: w.rows[0] }));
}
/* 4. Non-fit rows still go to {job}_Field-App. */
{
  const w = world({ legacy: true, rows: [row({ id: "r4", event_code: "0019389-001", file_name: "0019389-001_Laboratory_COC.xlsx", source_key: "file:coc" })] });
  w.ctx.processDriveQueue();
  const f = [...w.files.values()].find(x => x.appProperties && x.appProperties.envssSource === "file:coc");
  check("hygiene COC still goes to {job}_Field-App", f && f.parents[0] === "fa", JSON.stringify(f));
}
/* 5. Across all scenarios: the only update is manifest.csv; no delete / copy / move. */
{
  const w = world({ legacy: true, rows: [row({ id: "a", source_key: "file:a" }), row({ id: "b", source_key: "file:drv_old" }), row({ id: "c", event_code: "0019389-001", source_key: "file:c" })] });
  w.ctx.processDriveQueue();
  const bad = w.log.filter(l => l[0] === "delete" || l[0] === "copy" || (l[0] === "update" && l[2] !== "manifest.csv"));
  check("only manifest.csv is ever updated; no delete, copy or move", bad.length === 0, JSON.stringify(bad));
  check("source has no Drive.Files.delete / copy / parents change", !/Drive\.Files\.(remove|delete|copy)|addParents|removeParents|setTrashed/.test(code));
}
console.log("\n" + results.filter(r => r.ok).length + " passed, " + results.filter(r => !r.ok).length + " failed");
process.exit(results.every(r => r.ok) ? 0 : 1);
