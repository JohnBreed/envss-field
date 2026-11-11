/**
 * ENVSS Field — copy queued photos and generated files into Google Drive.
 *
 * Runs as developer@envss.com.au every 5 minutes.
 * Script property "drive-worker" is a dedicated Supabase secret API key, also named drive-worker
 * (Project Settings → API Keys → Create new secret key). It is not the service-role key.
 * Create that secret so it can be revoked on its own. Never put it in git or in the field app.
 *
 * HARD RULE: this script never edits, moves, renames, or deletes an existing file in a job folder.
 * The only Drive.Files.update call is appendManifest_(), and only for manifest.csv that this script created
 * (appProperties.envssManifest = "1") inside {job}_Field-App.
 * New bytes are created with Drive.Files.create only, as children of {job}_Field-App.
 * A name that already exists gets _2, _3, … A source_key that already has a file is not uploaded again.
 */
var SUPABASE_URL = "https://luyprcmjyruznluboyms.supabase.co";
var FIELD_APP_SUFFIX = "_Field-App";

// === drive-match:start ===
function envssIsSideFolder_(name, job) {
  var rest = String(name || "").slice(String(job || "").length);
  return /^_(admin|lab)(\b|_|\s|$)/i.test(rest);
}
function envssIsProjectRoot_(name, job) {
  job = String(job || "");
  name = String(name || "");
  if (!/^\d{7}$/.test(job)) return false;
  if (name.slice(0, job.length) !== job) return false;
  var rest = name.slice(job.length);
  if (!rest || !/\D/.test(rest.charAt(0))) return false;
  if (envssIsSideFolder_(name, job)) return false;
  return true;
}
function envssMatchJobFolders_(job, folders) {
  var hits = (folders || []).filter(function (f) { return f && envssIsProjectRoot_(f.name, job); });
  if (hits.length === 1) return { ok: true, folder: hits[0] };
  if (!hits.length) return { ok: false, status: "stopped", message: "job folder not found" };
  return { ok: false, status: "stopped", message: "job folder not unique" };
}
function envssUniqueDriveName_(existing, desired) {
  var set = {};
  (existing || []).forEach(function (n) { set[String(n).toLowerCase()] = 1; });
  var want = String(desired || "file");
  if (!set[want.toLowerCase()]) return want;
  var m = want.match(/^(.*?)(\.[^.]+)?$/);
  var stem = m[1], ext = m[2] || "", n = 2, cand = "";
  do { cand = stem + "_" + n + ext; n++; } while (set[cand.toLowerCase()]);
  return cand;
}
function envssPhotoFileName_(eventCode, noise, sampleNo, type, n) {
  var code = String(eventCode || "event").replace(/[^\w.-]+/g, "_");
  var nn = String(sampleNo == null || sampleNo === "" ? 0 : sampleNo);
  while (nn.length < 2) nn = "0" + nn;
  var kind = noise ? "N" : "S";
  var t = String(type || "photo").replace(/[^\w]+/g, "") || "photo";
  var i = Math.max(1, Number(n) || 1);
  return code + "_" + kind + nn + "_" + t + "_" + i + ".jpg";
}
function envssVersionedName_(base, used) {
  return envssUniqueDriveName_(used, base);
}
// === drive-match:end ===

function serviceKey_() {
  // Dedicated Supabase secret API key named drive-worker, stored only in Script Properties.
  // Project Settings → API Keys → Create new secret key, name it drive-worker. Not the service-role key.
  var key = PropertiesService.getScriptProperties().getProperty("drive-worker");
  if (!key) throw new Error("Script property drive-worker is not set. Create a Supabase secret API key named drive-worker and paste it here.");
  return key;
}

function sbFetch_(method, path, body, prefer) {
  var key = serviceKey_();
  var headers = { apikey: key, Authorization: "Bearer " + key };
  if (prefer) headers.Prefer = prefer;
  var opts = { method: method, headers: headers, muteHttpExceptions: true };
  if (body != null) {
    opts.contentType = "application/json";
    opts.payload = JSON.stringify(body);
  }
  var res = UrlFetchApp.fetch(SUPABASE_URL + path, opts);
  var code = res.getResponseCode();
  var text = res.getContentText() || "";
  var json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  return { code: code, text: text, json: json };
}

function q_(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

function driveList_(query, extra) {
  var out = [];
  var page;
  do {
    var args = Object.assign({
      q: query,
      pageSize: 100,
      pageToken: page || "",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives",
      fields: "nextPageToken, files(id,name,parents,appProperties,webViewLink)"
    }, extra || {});
    if (!args.pageToken) delete args.pageToken;
    var res = Drive.Files.list(args);
    (res.files || []).forEach(function (f) { out.push(f); });
    page = res.nextPageToken;
  } while (page);
  return out;
}

function findJobFolders_(job) {
  var files = driveList_("mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains '" + q_(job) + "'");
  return envssMatchJobFolders_(job, files);
}

function childByName_(parentId, name, folder) {
  var q = "trashed = false and '" + q_(parentId) + "' in parents and name = '" + q_(name) + "'";
  if (folder) q += " and mimeType = 'application/vnd.google-apps.folder'";
  return driveList_(q, { corpora: "allDrives" });
}

function ensureFieldApp_(job, projectFolderId) {
  var name = job + FIELD_APP_SUFFIX;
  var kids = childByName_(projectFolderId, name, true);
  if (kids.length === 1) return { ok: true, folder: kids[0] };
  if (kids.length > 1) {
    var ours = kids.filter(function (f) { return f.appProperties && f.appProperties.envssFieldApp === "1"; });
    if (ours.length === 1) return { ok: true, folder: ours[0] };
    return { ok: false, status: "stopped", message: "field-app folder not unique" };
  }
  var created = Drive.Files.create({
    name: name,
    mimeType: "application/vnd.google-apps.folder",
    parents: [projectFolderId],
    appProperties: { envssFieldApp: "1", envssJob: job }
  }, null, { supportsAllDrives: true, fields: "id,name,appProperties" });
  return { ok: true, folder: created };
}

function namesIn_(folderId) {
  var files = driveList_("trashed = false and '" + q_(folderId) + "' in parents", { corpora: "allDrives" });
  return files.map(function (f) { return f.name; });
}

function findBySource_(folderId, sourceKey) {
  var q = "trashed = false and '" + q_(folderId) + "' in parents and appProperties has { key='envssSource' and value='" + q_(sourceKey) + "' }";
  var hits = driveList_(q, { corpora: "allDrives" });
  return hits.length ? hits[0] : null;
}

function createFile_(folderId, name, blob, sourceKey) {
  return Drive.Files.create({
    name: name,
    parents: [folderId],
    appProperties: { envssSource: sourceKey, envssFieldApp: "1" }
  }, blob, { supportsAllDrives: true, fields: "id,name,webViewLink" });
}

function ourManifest_(folderId) {
  var hits = childByName_(folderId, "manifest.csv", false).filter(function (f) {
    return f.appProperties && f.appProperties.envssManifest === "1";
  });
  return hits.length === 1 ? hits[0] : null;
}

/** The only Drive.Files.update in this project. Refuses any file that is not our manifest. */
function appendManifest_(folderId, line, sourceKey) {
  if (line.indexOf(sourceKey) < 0) throw new Error("manifest line missing source key");
  var header = "copied_at,job_number,event_code,kind,file_name,drive_file_id,source_key,bytes\n";
  var existing = ourManifest_(folderId);
  if (!existing) {
    var blob = Utilities.newBlob(header + line + "\n", "text/csv", "manifest.csv");
    Drive.Files.create({
      name: "manifest.csv",
      parents: [folderId],
      mimeType: "text/csv",
      appProperties: { envssManifest: "1", envssFieldApp: "1" }
    }, blob, { supportsAllDrives: true, fields: "id" });
    return;
  }
  if (!existing.appProperties || existing.appProperties.envssManifest !== "1") return;
  var got = Drive.Files.get(existing.id, { alt: "media", supportsAllDrives: true });
  var text = got.getDataAsString();
  if (text.indexOf(sourceKey) >= 0) return;
  var updated = text.replace(/\s*$/, "") + "\n" + line + "\n";
  Drive.Files.update({}, existing.id, Utilities.newBlob(updated, "text/csv", "manifest.csv"), { supportsAllDrives: true });
}

function csv_(v) {
  return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
}

function patchRow_(id, body) {
  body.updated_at = new Date().toISOString();
  return sbFetch_("patch", "/rest/v1/envss_drive_copies?id=eq." + encodeURIComponent(id), body, "return=minimal");
}

function stopRow_(row, message) {
  patchRow_(row.id, { status: "stopped", message: message });
}

function copyOne_(row) {
  if (row.drive_file_id) return;
  var claim = sbFetch_("patch", "/rest/v1/envss_drive_copies?id=eq." + encodeURIComponent(row.id) + "&status=eq.queued", {
    tries: (row.tries || 0) + 1,
    next_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }, "return=representation");
  if (claim.code >= 300 || !claim.json || !claim.json.length) return;

  var match = findJobFolders_(row.job_number);
  if (!match.ok) { stopRow_(row, match.message); return; }

  var appFolder = ensureFieldApp_(row.job_number, match.folder.id);
  if (!appFolder.ok) { stopRow_(row, appFolder.message); return; }
  var folderId = appFolder.folder.id;

  var prior = findBySource_(folderId, row.source_key);
  var file = prior;
  var finalName = prior ? prior.name : "";
  if (!file) {
    var key = serviceKey_();
    var raw = UrlFetchApp.fetch(SUPABASE_URL + "/storage/v1/object/" + encodeURIComponent(row.bucket) + "/" + String(row.storage_path || "").split("/").map(encodeURIComponent).join("/"), {
      method: "get",
      headers: { apikey: key, Authorization: "Bearer " + key },
      muteHttpExceptions: true
    });
    if (raw.getResponseCode() === 404) {
      patchRow_(row, { message: "waiting for storage", next_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
      return;
    }
    if (raw.getResponseCode() >= 300) {
      patchRow_(row, { message: "storage " + raw.getResponseCode(), next_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
      return;
    }
    finalName = envssUniqueDriveName_(namesIn_(folderId), row.file_name);
    var blob = raw.getBlob().setName(finalName).setContentType(row.mime || "application/octet-stream");
    file = createFile_(folderId, finalName, blob, row.source_key);
  }
  var line = [new Date().toISOString(), row.job_number, row.event_code || "", row.kind, finalName || file.name, file.id, row.source_key, row.bytes || ""].map(csv_).join(",");
  appendManifest_(folderId, line, row.source_key);
  var url = file.webViewLink || ("https://drive.google.com/file/d/" + file.id + "/view");
  patchRow_(row, {
    status: "copied",
    drive_file_id: file.id,
    drive_url: url,
    drive_folder_id: folderId,
    file_name: finalName || file.name || row.file_name,
    message: null
  });
}

function processDriveQueue() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var now = new Date().toISOString();
    var res = sbFetch_("get", "/rest/v1/envss_drive_copies?status=eq.queued&next_at=lte." + encodeURIComponent(now) + "&order=created_at.asc&limit=8");
    if (res.code >= 300) throw new Error("queue read " + res.code + " " + res.text.slice(0, 160));
    (res.json || []).forEach(function (row) {
      try { copyOne_(row); }
      catch (e) {
        try {
          patchRow_(row.id, {
            message: String(e && e.message || e).slice(0, 300),
            next_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
          });
        } catch (e2) { Logger.log(e2); }
      }
    });
  } finally {
    lock.releaseLock();
  }
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processDriveQueue") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("processDriveQueue").timeBased().everyMinutes(5).create();
}

/** Run from the editor. Logs the fixture results. Does not touch Drive. */
function testFolderMatch() {
  var folders = [
    { id: "TEST_FOLDER_ID_0019333", name: "0019333 HYG-ACA Example Primary School" },
    { id: "18vWLmc4YG8u7_oYngUaDtv6ppxpGiLb4", name: "0019032 Applied Safety & Risk Management" },
    { id: "admin", name: "0019032_Admin" },
    { id: "lab", name: "0019032_Lab" },
    { id: "longer", name: "00193330 other job" }
  ];
  Logger.log(JSON.stringify(envssMatchJobFolders_("0019333", folders)));
  Logger.log(JSON.stringify(envssMatchJobFolders_("0019032", folders)));
  Logger.log(envssPhotoFileName_("0019333-001", false, 3, "filter", 1));
  Logger.log(envssUniqueDriveName_(["0019333-001_Laboratory_COC.xlsx"], "0019333-001_Laboratory_COC.xlsx"));
}
