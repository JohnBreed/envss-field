/**
 * ENVSS CoC send worker (Apps Script, runs as developer@envss.com.au).
 * Sends the queued emails in public.envss_coc_sends: the chain of custody to the lab, and CoC error reports to John.
 * Always From lab@envss.com.au (a Gmail "Send as" alias on this account). Runs every minute.
 *
 * Safety rules:
 *  - AT MOST ONCE. A row is claimed (queued -> sending) with a conditional update before anything is sent. If a send succeeds but the
 *    "sent" update fails, the row stays "sending" and is never retried by itself (it goes "failed: check Sent mail" after 15 min).
 *  - Recipients are re-checked here as well as in the table: kind=send -> the lab only, kind=alert -> John only, From lab@ only.
 *  - If lab@ is not a verified Send-as alias on this account Gmail would silently send From developer@. This worker checks the alias
 *    first and refuses to send otherwise.
 *  - The Supabase key is the Script Property coc-worker (a dedicated secret API key). Never in the app or git. Not the service-role key.
 */
var SUPABASE_URL = "https://luyprcmjyruznluboyms.supabase.co";
var FROM_ADDR = "lab@envss.com.au";
var FROM_NAME = "ENVSS Lab";
var ALLOWED_TO = { send: "ohlwa@mpl.com.au", alert: "john@envss.com.au" };
var MAX_TRIES = 5;
var STUCK_MIN = 15;
var MAX_BYTES = 20 * 1024 * 1024;

function key_() {
  var k = PropertiesService.getScriptProperties().getProperty("coc-worker");
  if (!k) throw new Error("Script property coc-worker is not set. Create a Supabase secret API key named coc-worker and paste it there.");
  return k;
}

function sb_(method, path, body, prefer) {
  var k = key_();
  var headers = { apikey: k, Authorization: "Bearer " + k };
  if (prefer) headers.Prefer = prefer;
  var opts = { method: method, headers: headers, muteHttpExceptions: true };
  if (body != null) { opts.contentType = "application/json"; opts.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch(SUPABASE_URL + path, opts);
  var text = res.getContentText() || "", json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  return { code: res.getResponseCode(), text: text, json: json, res: res };
}

function patch_(id, fields, extraFilter) {
  fields.updated_at = new Date().toISOString();
  return sb_("patch", "/rest/v1/envss_coc_sends?id=eq." + encodeURIComponent(id) + (extraFilter || ""), fields, "return=representation");
}

/** True when lab@ is a verified Send-as alias for the account this script runs as. */
function aliasOk_() {
  var list = Gmail.Users.Settings.SendAs.list("me");
  var found = (list.sendAs || []).filter(function (s) { return String(s.sendAsEmail).toLowerCase() === FROM_ADDR; })[0];
  return !!found && (!found.verificationStatus || found.verificationStatus === "accepted");
}

function b64lines_(bytes) {
  var s = Utilities.base64Encode(bytes), out = [];
  for (var i = 0; i < s.length; i += 76) out.push(s.substr(i, 76));
  return out.join("\r\n");
}
function encWord_(s) { return /^[\x20-\x7e]*$/.test(s) ? s : "=?UTF-8?B?" + Utilities.base64Encode(Utilities.newBlob(s).getBytes()) + "?="; }
function safeName_(s) { return String(s || "file").replace(/[^\w.\- ]+/g, "_"); }

function buildMime_(row, files) {
  var b1 = "=_mixed_" + row.id, b2 = "=_alt_" + row.id, L = [];
  L.push("From: " + encWord_(FROM_NAME) + " <" + FROM_ADDR + ">");
  L.push("To: " + row.to_addr);
  if (row.cc_addr) L.push("Cc: " + row.cc_addr);
  L.push("Reply-To: " + (row.reply_to || FROM_ADDR));
  L.push("Subject: " + encWord_(row.subject));
  L.push("X-ENVSS-Row: " + row.id);
  L.push("MIME-Version: 1.0");
  L.push("Content-Type: multipart/mixed; boundary=\"" + b1 + "\"", "");
  L.push("--" + b1, "Content-Type: multipart/alternative; boundary=\"" + b2 + "\"", "");
  L.push("--" + b2, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64lines_(Utilities.newBlob(row.body_text, "text/plain").getBytes()));
  if (row.body_html) L.push("--" + b2, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64lines_(Utilities.newBlob(row.body_html, "text/html").getBytes()));
  L.push("--" + b2 + "--", "");
  files.forEach(function (f) {
    L.push("--" + b1, "Content-Type: " + f.mime + "; name=\"" + safeName_(f.name) + "\"", "Content-Disposition: attachment; filename=\"" + safeName_(f.name) + "\"", "Content-Transfer-Encoding: base64", "", b64lines_(f.bytes));
  });
  L.push("--" + b1 + "--", "");
  return L.join("\r\n");
}

function fetchFile_(a) {
  var path = String(a.path).split("/").map(encodeURIComponent).join("/");
  var res = UrlFetchApp.fetch(SUPABASE_URL + "/storage/v1/object/" + encodeURIComponent(a.bucket) + "/" + path, { method: "get", headers: { apikey: key_(), Authorization: "Bearer " + key_() }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error("attachment " + a.name + " not found (HTTP " + res.getResponseCode() + ")");
  var bytes = res.getBlob().getBytes();
  return { name: a.name, mime: a.mime || "application/octet-stream", bytes: bytes };
}

function failRow_(row, msg) { patch_(row.id, { status: "failed", message: String(msg).slice(0, 300) }); }

function sendOne_(row) {
  /* claim: only one runner can move queued -> sending */
  var c = patch_(row.id, { status: "sending", claimed_at: new Date().toISOString(), tries: (row.tries || 0) + 1 }, "&status=eq.queued");
  if (c.code >= 300 || !c.json || !c.json.length) return "not claimed";
  /* checks that cannot be fixed by retrying */
  if (String(row.from_addr).toLowerCase() !== FROM_ADDR) { failRow_(row, "from address is not " + FROM_ADDR); return "failed"; }
  if (String(row.to_addr).toLowerCase() !== ALLOWED_TO[row.kind]) { failRow_(row, "recipient not allowed for kind " + row.kind); return "failed"; }
  if (row.cc_addr) { failRow_(row, "cc is not allowed"); return "failed"; }
  var files, total = 0;
  try {
    files = (row.attachments || []).map(fetchFile_);
    files.forEach(function (f) { total += f.bytes.length; });
    if (total > MAX_BYTES) throw new Error("attachments are over 20 MB");
  } catch (e) {
    /* nothing has been sent yet: safe to retry later */
    var tries = row.tries || 0;
    if (tries + 1 >= MAX_TRIES) patch_(row.id, { status: "failed", message: String(e.message || e).slice(0, 300) });
    else patch_(row.id, { status: "queued", message: String(e.message || e).slice(0, 300), next_at: new Date(Date.now() + 2 * 60000 * (tries + 1)).toISOString() });
    return "retry";
  }
  var sent;
  try {
    if (!aliasOk_()) throw new Error("lab@envss.com.au is not a verified Send-as alias on this account");
    sent = Gmail.Users.Messages.send({ raw: Utilities.base64EncodeWebSafe(buildMime_(row, files)) }, "me");
  } catch (e) {
    var t = row.tries || 0, m = String(e.message || e).slice(0, 300);
    /* the Gmail call itself failed, so nothing went out */
    if (t + 1 >= MAX_TRIES) patch_(row.id, { status: "failed", message: m });
    else patch_(row.id, { status: "queued", message: m, next_at: new Date(Date.now() + 5 * 60000 * (t + 1)).toISOString() });
    return "retry";
  }
  var u = patch_(row.id, { status: "sent", sent_at: new Date().toISOString(), gmail_message_id: sent && sent.id || null, gmail_thread_id: sent && sent.threadId || null, message: "" });
  if (u.code >= 300) Logger.log("SENT but could not mark row " + row.id + ": " + u.code + " " + u.text);
  return "sent";
}

function failStuck_() {
  var cutoff = new Date(Date.now() - STUCK_MIN * 60000).toISOString();
  var r = sb_("get", "/rest/v1/envss_coc_sends?status=eq.sending&claimed_at=lte." + encodeURIComponent(cutoff) + "&select=id");
  (r.json || []).forEach(function (x) { patch_(x.id, { status: "failed", message: "stuck while sending: check the Sent folder of developer@ before sending again" }, "&status=eq.sending"); });
}

function processCocQueue() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    failStuck_();
    var now = new Date().toISOString();
    var res = sb_("get", "/rest/v1/envss_coc_sends?status=eq.queued&next_at=lte." + encodeURIComponent(now) + "&order=requested_at.asc&limit=5");
    if (res.code >= 300) throw new Error("queue read " + res.code + " " + res.text.slice(0, 160));
    (res.json || []).forEach(function (row) {
      try { sendOne_(row); } catch (e) { Logger.log("row " + row.id + ": " + (e && e.message || e)); }
    });
  } finally { lock.releaseLock(); }
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "processCocQueue") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("processCocQueue").timeBased().everyMinutes(1).create();
}

/** Run from the editor after setup. Sends nothing. Logs whether lab@ can be used and whether the queue can be read. */
function checkSetup() {
  Logger.log("coc-worker key set: " + !!PropertiesService.getScriptProperties().getProperty("coc-worker"));
  Logger.log("lab@ is a verified Send-as alias: " + aliasOk_());
  var r = sb_("get", "/rest/v1/envss_coc_sends?select=id&limit=1");
  Logger.log("queue readable: " + (r.code < 300) + " (HTTP " + r.code + ")");
}
