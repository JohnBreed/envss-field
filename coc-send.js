/* ENVSS Field: send the chain of custody (Form 302) to the lab. v48.19, stage 1 of the lab pipeline.
   Loaded last in field.html. Uses the app's globals (db, view, project, trainsOf, buildCocV45c, sbFetch ...) and coc-send-core.js (window.ENVSS_COC).
   The tech reviews a generated CoC, ticks "I have checked the CoC", taps Send. The app only QUEUES the send (row in envss_coc_sends plus the files in
   field-exports); a worker (work/coc-send-worker) sends the email as lab@. Nothing here edits the CoC: it is generated from the samples. */
(function () {
  "use strict";
  const C = window.ENVSS_COC;
  if (!C) { console.warn("coc-send-core.js did not load"); return; }
  const BUCKET = "field-exports", DBN = "envss-field-coc-send", ST = "items", FLAGKEY = "envss-coc-flags-v1", DRAFTKEY = "envss-coc-draft-v1";
  const PDF_SRC = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
  const e9 = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
  const K = () => C.cfg();
  const tryR = (f, d) => { try { return f(); } catch (e) { return d; } };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const appVer = () => tryR(() => APP_VERSION, "?");
  const who = () => tryR(() => { const s = getSession(); return (s && s.user && s.user.email) || whoText(); }, "") || "";

  /* ---------- IndexedDB queue ---------- */
  let idbP = null, items = [], running = false;
  const remote = {};   /* eventCode -> rows */
  function idb() {
    if (idbP) return idbP;
    idbP = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("IndexedDB not available"));
      const r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST, { keyPath: "id" }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    idbP.catch(() => { idbP = null; });
    return idbP;
  }
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = (mode, fn) => idb().then(d => new Promise((res, rej) => { const t = d.transaction(ST, mode), s = t.objectStore(ST); let o; Promise.resolve(fn(s)).then(v => { o = v; }); t.oncomplete = () => res(o); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("aborted")); }));
  const putItem = it => tx("readwrite", s => rq(s.put(it)));
  const delItem = id => tx("readwrite", s => rq(s.delete(id)));
  const load = () => tx("readonly", s => rq(s.getAll())).then(a => { items = a || []; }).catch(() => {});
  const loaded = load();

  /* ---------- flags ("Something looks wrong") and collection drafts, per device ---------- */
  const lsGet = (k, d) => tryR(() => JSON.parse(localStorage.getItem(k) || "null"), null) || d;
  const lsSet = (k, v) => tryR(() => localStorage.setItem(k, JSON.stringify(v)));
  const flagKey = (evId, hash) => evId + "|" + hash + "|" + appVer();
  function reportedFor(evId, hash) { const f = lsGet(FLAGKEY, {}); return f[flagKey(evId, hash)] || null; }
  function markReported(evId, hash, rec) { const f = lsGet(FLAGKEY, {}); f[flagKey(evId, hash)] = rec; lsSet(FLAGKEY, f); }

  /* ---------- libraries ---------- */
  let pdfP = null;
  function ensurePdf() {
    if (window.PDFLib) return Promise.resolve(true);
    if (pdfP) return pdfP;
    pdfP = new Promise(res => {
      const s = document.createElement("script"); s.src = PDF_SRC; s.async = true;
      const t = setTimeout(() => { pdfP = null; res(!!window.PDFLib); }, 12000);
      s.onload = () => { clearTimeout(t); res(!!window.PDFLib); }; s.onerror = () => { clearTimeout(t); pdfP = null; res(false); };
      document.head.appendChild(s);
    });
    return pdfP;
  }

  /* ---------- gather the event's samples (independent of the spreadsheet builder) ---------- */
  function codesOf(s) {
    let codes = (s.analyses || []).map(a => String(a.code || "").toUpperCase()).filter(Boolean);
    if (!codes.length) { const c = tryR(() => contam(s.contaminantId)); if (c) codes = [String(c.code).toUpperCase()]; }
    return Array.from(new Set(codes));
  }
  function gather(ev) {
    const p = project(ev.projectId) || {};
    const all = (db.trains || []).filter(t => t.eventId === ev.id && !isNoise(t));
    const used = all.filter(t => t.status !== "not_used");
    let rows;
    window._v483CocScope = true;
    try { rows = trainsOf(ev.id).filter(t => !isNoise(t)).sort((a, b) => sampleNoOf(a) - sampleNoOf(b)); } finally { window._v483CocScope = false; }
    const raw = rows.map(s => {
      const blank = isBlank(s);
      return { key: s.id, label: displayNo(s), no: sampleNoOf(s), id: String(s.mediaId || ""), blank, rejected: !!cocRejected(s), rejectCode: s.rejectCode || "", rejectReason: s.rejectReason || "", status: s.status || "",
        startAt: s.startAt || "", endAt: s.endAt || "", startFlow: s.startFlow == null ? "" : String(s.startFlow), endFlow: s.endFlow == null ? "" : String(s.endFlow),
        dateSampled: blank ? (cocDate(s.shiftDate) || cocDate(ev.date)) : (cocDate(s.startAt) || cocDate(s.shiftDate) || cocDate(ev.date)),
        type: typeOfSample(s), codes: codesOf(s), location: String(s.location || "").trim(), flowOk: blank ? true : tryR(() => flowCheck(s).ok, true), _s: s };
    });
    const unfinished = tryR(() => v483.blockers(ev, "coc").map(t => ({ label: displayNo(t), why: v483.blockReason(t), id: t.id })), []);
    return { p, raw, expectedCount: used.length, notUsed: all.filter(t => t.status === "not_used").map(t => displayNo(t)), unfinished, job: tryR(() => { const m = String(p.number || "").trim().match(/^(\d{7})(?!\d)/); return m ? m[1] : String(p.number || "").trim(); }, "") };
  }
  const colL = n => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const cellText = v => v == null ? "" : typeof v === "object" ? (v.richText ? v.richText.map(r => r.text).join("") : v.text != null ? String(v.text) : v.result != null ? String(v.result) : "") : String(v);
  async function readBack(buf, out) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Client") || wb.worksheets[0];
    const strings = [], stringAddr = []; ws.eachRow({ includeEmpty: false }, row => row.eachCell({ includeEmpty: false }, cell => { if (cell.isMerged && cell.master !== cell) return; const t = cellText(cell.value).trim(); if (t) { strings.push(t); stringAddr.push(cell.address); } }));
    const FIRST = 6, kA = out.analytes.length, cRun = FIRST + kA, cVol = cRun + 1, cCom = cRun + 2;
    let foot = 18; while (foot < 200 && !/^Please tick/i.test(cellText(ws.getCell(foot, 2).value))) foot++;
    const rows = [];
    for (let r = 18; r < foot; r++) {
      const an = []; for (let i = 0; i < kA; i++) if (/^x$/i.test(cellText(ws.getCell(r, FIRST + i).value).trim())) an.push(out.analyteNames[i]);
      const val = c => { const v = ws.getCell(r, c).value; return typeof v === "number" ? v : cellText(v).trim(); };
      rows.push({ id: cellText(ws.getCell(r, 2).value).trim(), date: cellText(ws.getCell(r, 4).value).trim(), type: cellText(ws.getCell(r, 5).value).trim(), analytes: an, run: val(cRun), vol: val(cVol), comment: cellText(ws.getCell(r, cCom).value).trim() });
    }
    const headers = []; for (let i = 0; i < kA; i++) headers.push(cellText(ws.getCell(17, FIRST + i).value).trim());
    const txtAt = a => cellText(ws.getCell(a).value).trim();
    const who = { contact: txtAt("B5"), projectMgr: txtAt("B6"), sampler: txtAt("B7"), printName: txtAt("B" + (foot + 2)), signature: txtAt("B" + (foot + 4)) };
    const res = { rows, strings, stringAddr, who, namedCells: ["B5", "B6", "B7", "B" + (foot + 2), "B" + (foot + 4)], analyteHeaders: headers, esdatTick: /^x$/i.test(cellText(ws.getCell("K12").value).trim()), resultsTo: cellText(ws.getCell("B12").value).trim(), invoiceTo: cellText(ws.getCell("B14").value).trim(), phone: cellText(ws.getCell("B11").value).trim() };
    Object.defineProperty(res, "wb", { value: wb }); Object.defineProperty(res, "ws", { value: ws });   /* not enumerable: the state is serialised in tests */
    return res;
  }

  /* step 1: the spreadsheet (generated by the app's own Form 302 builder) */
  async function gen1(ev, tat) {
    const g = gather(ev); g.xlsx = null; g.out = null; g.xl = null; g.genError = "";
    g.libs = { excel: typeof ExcelJS !== "undefined", pdf: await ensurePdf() };
    if (isFibreEvent(ev)) { g.genError = "AFM events go to Lifetree, not Envirolab."; return g; }
    if (!g.libs.excel || !g.raw.length || g.raw.length > K().maxRows) return g;
    try {
      window._v483CocScope = true;
      let out; try { out = await buildCocV45c(ev, { turnaround: tat || ev.turnaround || "standard" }); } finally { window._v483CocScope = false; }
      g.out = out; g.xlsx = new Blob([out.buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      g.xl = await readBack(out.buf, out); g.samplers = (out.samplers || []).slice();
      /* the CoC page = this spreadsheet drawn as a page (same layout as the old-format Form 302); PDF + on-screen image come from one drawing list */
      g.layout = C.layoutSheet(g.xl.wb, g.xl.ws);
      const bm = {};
      for (const o of g.layout.pages.reduce((a, p) => a.concat(p.ops.filter(x => x.k === "i")), [])) if (!bm[o.key]) { try { bm[o.key] = await createImageBitmap(new Blob([o.bytes], { type: "image/" + (/jp/i.test(o.ext) ? "jpeg" : "png") })); } catch (e) {} }
      if (g.libs.pdf && window.PDFLib) { try { g.pdf = await C.drawPdf(window.PDFLib, g.layout, { title: "Chain of custody " + ev.code, date: new Date() }); } catch (e) { g.pdfError = String(e && e.message || e); } }
      g.canvases = g.layout.pages.map(pg => { const cv = document.createElement("canvas"), sc = 2; cv.width = Math.round(pg.w * sc); cv.height = Math.round(pg.h * sc); C.drawCanvas(cv.getContext("2d"), pg, sc, bm); return cv; });
      g.imgs = g.canvases.map(cv => cv.toDataURL("image/png"));
    } catch (e) { g.genError = String(e && e.message || e).slice(0, 300); }
    return g;
  }

  /* step 2: model, CoC page, PDF, image, hash, checks (re-run when the collection details change) */
  const ymdToDate = d => { const m = String(d || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : NaN; };
  async function gen2(ev, g, collection, extra) {
    const k = K(), now = new Date(), r = { g };
    const codesAll = [], namesBy = {};
    if (g.out) g.out.analytes.forEach((c, i) => { codesAll.push(c); namesBy[c] = g.out.analyteNames[i]; });
    else g.raw.forEach(s => s.codes.forEach(c => { if (codesAll.indexOf(c) < 0) { codesAll.push(c); namesBy[c] = tryR(() => (contam(c) || {}).name, "") || c; } }));
    const xName = ev.code + "_Laboratory_COC.xlsx", pName = ev.code + "_Laboratory_COC.pdf", cName = ev.code + "_Laboratory_COC.csv";
    const model = {
      job: g.job, eventCode: ev.code, turnaround: (g.out && g.out.turnaround) || ev.turnaround || "standard", officePhone: k.officePhone, officeAddress: k.officeAddress,
      resultsTo: k.resultsTo, invoiceTo: k.invoiceTo, preparedAt: C.perthStamp(now), collection: Object.assign({}, collection), analyteCodes: codesAll, analyteNames: codesAll.map(c => namesBy[c]),
      resendOf: extra && extra.resendOf || "", attachmentNames: [xName, pName].concat(k.attachCsv ? [cName] : []),
      samples: g.raw.map(s => {
        const rm = s.blank ? null : tryR(() => runtimeMinutes(s._s)), vol = s.blank ? null : tryR(() => volumeLitres(s._s));
        const parts = []; if (s.blank) parts.push("Field blank"); if (s.rejected) parts.push("voided needs clean and return");
        return { no: s.no, id: s.id, dateSampled: s.dateSampled, type: s.type, codes: s.codes, analytes: s.codes.map(c => namesBy[c] || c),
          run: s.blank ? "N/A" : (rm != null && isFinite(rm) && rm > 0 ? Math.round(rm) : null), vol: s.blank ? "N/A" : (vol != null && isFinite(vol) && vol > 0 ? round1(vol) : null), comment: parts.join("; ") };
      })
    };
    r.model = model; r.email = C.buildEmail(model, k);
    r.layout = g.layout || { pages: [], texts: [] }; r.pdf = g.pdf || null; r.pdfError = g.pdfError || ""; r.canvases = g.canvases || []; r.imgs = g.imgs || [];
    r.hash = await C.contentHash(model);
    r.csv = C.csvOf(model);
    /* lint inputs: who and what must never appear on the CoC */
    const forb = [], sess = tryR(() => getSession(), null);
    forb.push({ kind: "tech name or email", v: who() }, { kind: "tech name or email", v: tryR(() => whoText(), "") });
    if (sess && sess.user) { forb.push({ kind: "tech name or email", v: (sess.user.email || "").split("@")[0] }); const nm = sess.user.user_metadata || {}; forb.push({ kind: "tech name", v: nm.full_name || nm.name || "" }); }
    (g.raw || []).forEach(s => { const sm = s._s; (sm.audit || []).forEach(a => { const n = tryR(() => operatorName(a.who), ""); if (n && /\s/.test(n)) forb.push({ kind: "tech name", v: n }); }); const pe = sm.person || {}; if (pe.first && pe.last) forb.push({ kind: "worker name", v: pe.first + " " + pe.last }); if (pe.last && String(pe.last).length >= 4) forb.push({ kind: "worker name", v: pe.last }); });
    ["name", "client", "site"].forEach(f => { const v = g.p && g.p[f]; if (v && String(v).trim().length >= 4) forb.push({ kind: "project " + f, v }); });
    const texts = [], where = [];
    const named = new Set(g.xl ? g.xl.namedCells : []), permitAt = [], nameBits = [];
    (g.samplers || []).forEach(n => { nameBits.push(n); String(n).split(/\s+/).forEach(w => { if (w.length >= 2) nameBits.push(w); }); nameBits.push(String(n).split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join("")); });
    nameBits.sort((a, b) => b.length - a.length);   /* longest first, so a full name is removed before its parts */
    (g.xl ? g.xl.strings : []).forEach((t, i) => { texts.push(t); where.push("spreadsheet"); permitAt.push(named.has(g.xl.stringAddr[i]) ? nameBits : null); });
    r.layout.texts.forEach((t, i) => { texts.push(t); where.push("CoC page"); permitAt.push(named.has((r.layout.textAddr || [])[i]) ? nameBits : null); });
    [r.email.subject, r.email.text].forEach(t => { texts.push(t); where.push("email to the lab"); permitAt.push(null); }); model.attachmentNames.forEach(t => { texts.push(t); where.push("file name"); permitAt.push(null); });
    const hist = historyFor(ev.code), ss = C.sendState(hist, r.hash, now, k);
    r.hist = hist; r.state = ss;
    const rep = reportedFor(ev.id, r.hash);
    r.reported = rep;
    r.checks = C.runChecks({ cfg: k, now, job: g.job, raw: g.raw, model, expectedCount: g.expectedCount, xlsx: g.xl, pdf: g.layout ? { texts: r.layout.texts } : null, genError: g.genError || r.pdfError || "", libs: g.libs, unfinished: g.unfinished, notUsed: g.notUsed, collection,
      eventDateDmy: cocDate(ev.date), dayDiff: d => (ymdToDate(d) - ymdToDate(cocDate(ev.date))) / 86400000, texts, textWhere: i => where[i], permit: i => permitAt[i], forbidden: forb, samplers: g.out ? g.samplers : null,
      sendCheck: rep && rep.status !== "failed" ? { previouslyFlagged: true, appVersion: rep.appVersion || appVer() } : null });
    r.blocks = r.checks.filter(c => c.level === "block"); r.warns = r.checks.filter(c => c.level === "warn");
    r.appBlocks = r.blocks.filter(c => c.fix === "app");
    return r;
  }

  /* ---------- history (server rows + local queue) ---------- */
  function historyFor(code) {
    const rows = (remote[code] || []).slice(), ids = new Set(rows.map(r => r.id));
    items.filter(it => it.row && it.row.event_code === code && !ids.has(it.id)).forEach(it => rows.push(Object.assign({}, it.row, { status: it.state === "dupe" ? "cancelled" : "queued", local: true })));
    return rows;
  }
  async function refresh(code) {
    const c = sbCfg(); if (!c || !navigator.onLine || !(typeof hasSession === "function" && hasSession())) return;
    try {
      const res = await sbFetch(c.supabaseUrl + "/rest/v1/envss_coc_sends?select=id,kind,status,resend_of,content_hash,requested_by,requested_at,sent_at,to_addr,message,collection,sample_count,event_code&event_code=eq." + encodeURIComponent(code) + "&order=requested_at.asc", { headers: sbHeaders() });
      if (!res.ok) return; remote[code] = await res.json();
    } catch (e) {}
  }

  /* ---------- queue: upload files, insert the row, then the Drive copies ---------- */
  async function upload(f) {
    const c = sbCfg(), h = sbHeaders(); delete h["Content-Type"]; delete h.Prefer;
    const path = f.path.split("/").map(encodeURIComponent).join("/");
    const res = await sbFetch(c.supabaseUrl + "/storage/v1/object/" + BUCKET + "/" + path, { method: "POST", headers: Object.assign(h, { "Content-Type": f.mime, "x-upsert": "false" }), body: f.blob });
    if (res.ok || res.status === 409) return;
    const t = await res.text().catch(() => ""); if (/already exists|Duplicate/i.test(t)) return;
    throw new Error("upload " + res.status);
  }
  async function insertRow(it) {
    const c = sbCfg();
    const res = await sbFetch(c.supabaseUrl + "/rest/v1/envss_coc_sends", { method: "POST", headers: sbHeaders("return=minimal"), body: JSON.stringify(it.row) });
    if (res.ok) return "ok";
    const t = await res.text().catch(() => "");
    if (res.status === 409 || /duplicate|23505/i.test(t)) return /envss_coc_sends_pkey|\(id\)/i.test(t) ? "ok" : "dupe";
    throw new Error("row " + res.status + " " + t.slice(0, 120));
  }
  async function run() {
    if (running) return; running = true;
    try {
      await loaded;
      if (navigator.onLine && sbCfg() && typeof hasSession === "function" && hasSession()) {
        for (const it of items.slice()) {
          if (it.state === "done" || it.state === "dupe") continue;
          if ((it.nextAt || 0) > Date.now()) continue;
          try {
            for (const f of it.files) if (!f.uploaded && f.blob) { await upload(f); f.uploaded = true; }
            if (!it.inserted) { const r = await insertRow(it); if (r === "dupe") { it.state = "dupe"; it.inserted = false; } else { it.inserted = true; it.state = "done"; } }
            if (it.inserted && it.drive && !it.driveQueued) { it.drive.forEach(d => { try { window.envssDrive && envssDrive.enqueueExport(d.blob, d.name); } catch (e) { console.warn("coc drive", e); } }); it.driveQueued = true; }
            it.lastErr = "";
            if (it.state === "done") { it.files.forEach(f => { f.blob = undefined; }); it.drive = undefined; }
          } catch (e) { it.tries = (it.tries || 0) + 1; it.nextAt = Date.now() + Math.min(10 * 60e3, 10e3 * Math.pow(2, it.tries - 1)); it.lastErr = String(e && e.message || e).slice(0, 160); }
          await putItem(Object.assign({}, it)).catch(() => {});
        }
        const codes = new Set(items.map(i => i.row && i.row.event_code).filter(Boolean));
        for (const code of codes) await refresh(code);
      }
    } catch (e) { console.warn("[ENVSS] coc queue", e); }
    finally { running = false; try { paintCard(); } catch (e) {} try { if (S && S.open) paintSend(); } catch (e) {} }
  }
  const pending = () => items.filter(it => it.state !== "done" && it.state !== "dupe").length;
  function enqueue(it) { it.state = "waiting"; items.push(it); putItem(Object.assign({}, it)).catch(e => console.warn("coc store", e)); setTimeout(run, 30); }
  window.addEventListener("online", () => setTimeout(run, 500));
  setInterval(() => { if (pending() || (S && S.open)) run(); }, 20000);

  /* ---------- row builders ---------- */
  const deviceText = () => (navigator.userAgent || "") + " | " + (navigator.platform || "");
  const screenText = () => innerWidth + "x" + innerHeight + " @" + (devicePixelRatio || 1) + (navigator.onLine ? "" : " (offline)");
  function sendRow(S0, r, o) {
    const k = K(), g = r.g, ev = S0.ev, id = "cs_" + uuid();
    const files = [{ name: r.model.attachmentNames[0], mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", blob: g.xlsx }, { name: r.model.attachmentNames[1], mime: "application/pdf", blob: new Blob([r.pdf], { type: "application/pdf" }) }];
    if (k.attachCsv) files.push({ name: r.model.attachmentNames[2], mime: "text/csv", blob: new Blob([r.csv], { type: "text/csv" }) });
    const base = "g/" + g.job + "/" + String(ev.code).replace(/[^\w.-]+/g, "_") + "/coc-send/" + id + "/";
    files.forEach(f => { f.path = base + f.name; f.bytes = f.blob.size; });
    const row = { id, kind: "send", status: "queued", resend_of: o.resendOf || null, job_number: g.job, event_code: ev.code, event_id: ev.id, project_id: ev.projectId || null,
      from_addr: k.fromAddress, to_addr: k.labTo, cc_addr: (k.labCc || []).join(",") || null, reply_to: k.replyTo, subject: r.email.subject, body_text: r.email.text, body_html: r.email.html,
      attachments: files.map(f => ({ name: f.name, mime: f.mime, bucket: BUCKET, path: f.path, bytes: f.bytes })), content_hash: r.hash, collection: r.model.collection, sample_count: r.model.samples.length,
      sample_ids: r.model.samples.map(s => s.id), checks: { passed: true, warnings: r.warns.map(w => ({ id: w.id, text: w.text })) }, tech_flag: null, note: o.reason || null,
      requested_by: who(), requested_at: new Date().toISOString(), app_version: appVer(), device: deviceText() };
    const drive = [{ name: r.model.attachmentNames[0], blob: g.xlsx }, { name: r.model.attachmentNames[1], blob: files[1].blob }, { name: r.model.attachmentNames[2] || (ev.code + "_Laboratory_COC.csv"), blob: new Blob([r.csv], { type: "text/csv" }) }];
    return { id, kind: "send", row, files: files.map(f => ({ name: f.name, mime: f.mime, path: f.path, blob: f.blob })), drive, inserted: false, driveQueued: false };
  }
  async function alertRow(S0, r, comment, manual) {
    const k = K(), g = r.g, ev = S0.ev, id = "al_" + uuid(), when = new Date();
    const files = [];
    const base = "g/" + (g.job || "nojob") + "/" + String(ev.code).replace(/[^\w.-]+/g, "_") + "/coc-send/" + id + "/";
    const add = (name, mime, blob) => files.push({ name, mime, blob, path: base + name, bytes: blob.size });
    if (g.xlsx) add(ev.code + "_Laboratory_COC.xlsx", g.xlsx.type, g.xlsx);
    if (r.pdf) add(ev.code + "_Laboratory_COC.pdf", "application/pdf", new Blob([r.pdf], { type: "application/pdf" }));
    for (let i = 0; i < r.canvases.length; i++) { const b = await new Promise(res => r.canvases[i].toBlob(res, "image/png")); if (b) add(ev.code + "_CoC_page" + (i + 1) + ".png", "image/png", b); }
    const flag = { raised: true, manual: !!manual, comment: String(comment).trim(), at: when.toISOString() };
    const a = C.buildAlert({ flag, techUser: who(), job: g.job, eventCode: ev.code, eventId: ev.id, projectId: ev.projectId, turnaround: r.model.turnaround, model: r.model, expectedCount: g.expectedCount, failed: r.blocks, warned: r.warns,
      raw: g.raw, xlsxRows: g.xl && g.xl.rows, collection: r.model.collection, hash: r.hash, appVersion: appVer(), device: deviceText(), screen: screenText(), online: navigator.onLine, when, attachmentNames: files.map(f => f.name) }, k);
    const row = { id, kind: "alert", status: "queued", resend_of: null, job_number: g.job && /^\d{7}$/.test(g.job) ? g.job : "0000000", event_code: ev.code, event_id: ev.id, project_id: ev.projectId || null, from_addr: k.fromAddress, to_addr: k.alertTo, cc_addr: null, reply_to: k.replyTo,
      subject: a.subject, body_text: a.text, body_html: a.html, attachments: files.map(f => ({ name: f.name, mime: f.mime, bucket: BUCKET, path: f.path, bytes: f.bytes })), content_hash: null, collection: r.model.collection, sample_count: r.model.samples.length, sample_ids: r.model.samples.map(s => s.id),
      checks: { failed: r.blocks.map(c => ({ id: c.id, fix: c.fix, text: c.text, value: c.value === undefined ? null : c.value, expected: c.expected === undefined ? null : c.expected })), warnings: r.warns.map(w => ({ id: w.id, text: w.text })), model_hash: r.hash }, tech_flag: flag, note: null,
      requested_by: who(), requested_at: when.toISOString(), app_version: appVer(), device: deviceText() };
    return { id, kind: "alert", row, files: files.map(f => ({ name: f.name, mime: f.mime, path: f.path, blob: f.blob })), inserted: false };
  }

  /* ---------- the review / send screen ---------- */
  let S = null;
  const CSS = ".cs-screen{position:fixed;inset:0;z-index:10000;background:var(--bg,#0F1530);color:var(--text,#fff);overflow:auto;-webkit-overflow-scrolling:touch}"
    + ".cs-wrap{max-width:980px;margin:0 auto;padding:12px 12px 120px}.cs-top{display:flex;gap:10px;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--bg,#0F1530);padding:8px 0;z-index:2;border-bottom:1px solid #3A4258}"
    + ".cs-top h2{margin:0;font-size:19px}.cs-step{margin:14px 0 6px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9FB0D8}"
    + ".cs-card{background:var(--panel,#1B2340);border:1px solid #3A4258;border-radius:12px;padding:12px;margin:8px 0}.cs-help{font-size:14px;line-height:1.45;color:#C9D2EA;margin:4px 0 8px}"
    + ".cs-to{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:14px}.cs-to b{color:#9FB0D8}"
    + ".cs-chk{list-style:none;margin:6px 0;padding:0;display:flex;flex-direction:column;gap:6px}.cs-chk li{border-radius:10px;padding:8px 10px;font-size:14px;line-height:1.4}"
    + ".cs-b{background:#4A1D1D;border:1px solid #B34747}.cs-w{background:#4A3A12;border:1px solid #C98A2E}.cs-ok{background:#143A2A;border:1px solid #2E8B62}"
    + ".cs-tag{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:1px 8px;margin-right:6px;vertical-align:middle}.cs-tag.app{background:#7A1F1F;color:#FFD0D0}.cs-tag.tech{background:#6B4A1A;color:#FFE1B0}.cs-tag.warn{background:#6B5A2E;color:#FFE7A8}"
    + ".cs-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}@media(max-width:620px){.cs-grid{grid-template-columns:1fr 1fr}.cs-grid .full{grid-column:1/-1}}"
    + ".cs-card label{display:block;font-weight:700;margin:6px 0 2px;font-size:14px}.cs-card input[type=date],.cs-card input[type=time],.cs-card textarea,.cs-card input[type=text]{width:100%;box-sizing:border-box;font-size:16px}"
    + ".cs-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.cs-chips button{padding:6px 10px;font-size:13px}"
    + ".cs-zoom{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0 8px}.cs-zoom button{min-width:44px;min-height:40px}"
    + ".cs-img{background:#fff;border-radius:8px;overflow:auto;max-height:70vh;touch-action:pan-x pan-y pinch-zoom;border:1px solid #3A4258}.cs-img img{display:block;margin:0 0 8px;max-width:none}"
    + ".cs-tbl{width:100%;border-collapse:collapse;font-size:13px}.cs-tbl th,.cs-tbl td{border-bottom:1px solid #3A4258;padding:4px 6px;text-align:left;vertical-align:top}.cs-tbl th{color:#9FB0D8;font-size:12px}"
    + ".cs-send{position:fixed;left:0;right:0;bottom:0;background:var(--panel,#1B2340);border-top:2px solid #3A4258;padding:10px 12px;z-index:3}.cs-send .in{max-width:980px;margin:0 auto;display:flex;gap:12px;align-items:center;flex-wrap:wrap}"
    + ".cs-send .tick{display:flex;gap:10px;align-items:center;font-size:16px;font-weight:700;flex:1 1 260px}.cs-send .tick input{width:26px;height:26px}.cs-send .btn{min-height:48px;font-size:17px;flex:0 0 auto}.cs-send .note{flex:1 1 100%;font-size:13px;color:#FFC46B;margin:0}"
    + ".cs-flag{border:2px solid #B34747}.cs-flag textarea{min-height:96px}.cs-count{font-size:12px;color:#9FB0D8}.cs-count.bad{color:#FFC46B}.cs-banner{border-radius:10px;padding:10px 12px;margin:8px 0;font-size:14px;line-height:1.45}"
    + ".cs-card-ev .st{margin:6px 0;font-size:14px}.cs-spin{opacity:.7}";
  const stl = document.createElement("style"); stl.textContent = CSS; document.head.appendChild(stl);

  function openScreen(evId) {
    const ev = eventById(evId || view.eventId);
    if (!ev) return;
    const old = document.getElementById("csScreen"); if (old) old.remove();
    const draft = lsGet(DRAFTKEY, {})[ev.id] || {};
    S = { open: true, ev, collection: { date: draft.date || "", from: draft.from || "", to: draft.to || "", location: draft.location || K().defaultCollectionLocation }, checked: false, flag: false, flagComment: "", zoom: 1, sending: false, r: null, seq: 0, resendMode: false, reason: "", busy: true };
    const k = K();
    const w = document.createElement("div"); w.id = "csScreen"; w.className = "cs-screen"; w.setAttribute("role", "dialog"); w.setAttribute("aria-modal", "true"); w.setAttribute("aria-label", "Send chain of custody to the lab");
    w.innerHTML = `<div class="cs-wrap">
      <div class="cs-top"><h2>Send CoC to the lab</h2><button type="button" class="btn ghost" id="csClose">Close</button></div>
      <div class="cs-card"><b>How this works</b>
        <ol class="cs-help" style="margin:6px 0 0 18px;padding:0">
          <li>Read the checks below. Anything red has to be fixed before you can send.</li>
          <li>Tell the lab when and where to collect the samples.</li>
          <li>Look at the CoC page. Zoom in and check every line against your samples.</li>
          <li>Tick <b>I have checked the CoC</b>, then tap <b>Send</b>. Nothing is sent until you tap Send.</li>
        </ol>
        <p class="cs-help" style="margin:6px 0 0">The CoC is made from your samples. You can't type on it. If it is wrong, fix the sample in the app, or use <b>Something looks wrong</b> at the bottom to tell John.</p></div>
      <div class="cs-card"><div class="cs-to"><b>From</b><span>${e9(k.fromAddress)}</span><b>To</b><span id="csTo">${e9(k.labTo)} <span class="muted">(Envirolab / MPL Perth)</span></span><b>Results</b><span>ESDAT format, to ${e9(k.resultsTo)}</span><b>Invoice</b><span>${e9(k.invoiceTo)}</span><b>Event</b><span>${e9(ev.code)}</span></div></div>
      <div class="cs-step">Step 1 · Checks</div><div id="csChecks" class="cs-card"><span class="cs-spin">Checking the samples and building the CoC…</span></div>
      <div class="cs-step">Step 2 · When and where should the lab collect?</div>
      <div class="cs-card" id="csCollect"><label for="csTat" style="margin-top:0">Date results required (lab turnaround)</label><select id="csTat" style="width:100%;font-size:16px">${(window.COC_TAT_OPTS || [["standard", "Standard"]]).map(o => `<option value="${e9(o[0])}" ${o[0] === (ev.turnaround || "standard") ? "selected" : ""}>${e9(o[1])}</option>`).join("")}</select>
        <p class="cs-help" style="margin-bottom:0">Ticked on Form 302 ("Date results required").</p>
        <hr style="border:0;border-top:1px solid #3A4258;margin:10px 0"><p class="cs-help" style="margin-top:0">The lab uses this to book the pickup. It goes in the email to the lab and the send log. The CoC form itself stays exactly as the lab knows it.</p>
        <div class="cs-grid"><div><label for="csDate">Collection day</label><input type="date" id="csDate" value="${e9(S.collection.date)}" min="${e9(C.perthDay())}"></div>
        <div><label for="csFrom">Time from</label><input type="time" id="csFrom" value="${e9(S.collection.from)}"></div>
        <div><label for="csTo2">Time to (optional)</label><input type="time" id="csTo2" value="${e9(S.collection.to)}"></div>
        <div class="full" style="grid-column:1/-1"><label for="csLoc">Where (address)</label><textarea id="csLoc" rows="2">${e9(S.collection.location)}</textarea>
        <div class="cs-chips"><button type="button" class="btn ghost" id="csToday">Today</button><button type="button" class="btn ghost" id="csTomorrow">Tomorrow</button><button type="button" class="btn ghost" id="csOffice">Use the ENVSS office</button></div></div></div>
        <div id="csColErr" class="cs-help" style="color:#FFC46B;margin-bottom:0"></div></div>
      <div class="cs-step">Step 3 · Check the CoC page</div>
      <div class="cs-card"><div class="cs-zoom"><button type="button" class="btn ghost" id="csZm" aria-label="Zoom out">−</button><button type="button" class="btn ghost" id="csZp" aria-label="Zoom in">+</button><button type="button" class="btn ghost" id="csZfit">Fit page</button><button type="button" class="btn ghost" id="csZ100">Full size</button><a id="csOpenImg" target="_blank" rel="noopener" class="muted" style="margin-left:6px">Open image in a new tab</a></div>
        <div class="cs-img" id="csImg" tabindex="0" aria-label="The CoC page that will be attached"></div>
        <p class="cs-help" id="csImgNote" style="margin-bottom:0"></p></div>
      <div class="cs-card"><b>Samples on this CoC</b><div id="csSamples" style="overflow:auto;margin-top:6px"></div></div>
      <div class="cs-step">Something looks wrong?</div>
      <div class="cs-card cs-flag" id="csFlagBox"></div>
      <div id="csSendInfo"></div>
    </div>
    <div class="cs-send"><div class="in" id="csSendBar"></div></div>`;
    document.body.appendChild(w);
    S.w = w;
    const $ = id => w.querySelector("#" + id);
    $("csClose").onclick = closeScreen;
    const onCol = () => { S.collection = { date: $("csDate").value, from: $("csFrom").value, to: $("csTo2").value, location: $("csLoc").value }; S.checked = false; saveDraft(); scheduleGen2(); paintSend(); };
    ["csDate", "csFrom", "csTo2", "csLoc"].forEach(id => { $(id).addEventListener("input", onCol); $(id).addEventListener("change", onCol); });
    $("csTat").onchange = async () => { S.ev.turnaround = $("csTat").value; tryR(() => saveQuiet()); S.checked = false; S.busy = true; S.r = null; paintChecks(); S.g = await gen1(S.ev, S.ev.turnaround); await regen(); };
    $("csToday").onclick = () => { $("csDate").value = C.perthDay(); onCol(); };
    $("csTomorrow").onclick = () => { const p = C.perthParts(new Date(Date.now() + 86400000)); $("csDate").value = p.y + "-" + C.pad2(p.m) + "-" + C.pad2(p.d); onCol(); };
    $("csOffice").onclick = () => { $("csLoc").value = K().defaultCollectionLocation; onCol(); };
    const zoomTo = z => { S.zoom = Math.max(0.4, Math.min(4, z)); applyZoom(); };
    $("csZm").onclick = () => zoomTo(S.zoom / 1.3); $("csZp").onclick = () => zoomTo(S.zoom * 1.3); $("csZfit").onclick = () => zoomTo(1); $("csZ100").onclick = () => zoomTo(2);
    drawFlag();
    start();
  }
  function saveDraft() { const d = lsGet(DRAFTKEY, {}); d[S.ev.id] = S.collection; lsSet(DRAFTKEY, d); }
  function closeScreen() { const w = document.getElementById("csScreen"); if (w) w.remove(); if (S) S.open = false; paintCard(); }
  function applyZoom() { const im = S.w.querySelectorAll("#csImg img"); im.forEach(i => { i.style.width = (S.zoom * 100) + "%"; }); }
  let genTimer = null;
  function scheduleGen2() { clearTimeout(genTimer); genTimer = setTimeout(regen, 350); }
  async function start() {
    S.busy = true; paintChecks();
    await loaded; await refresh(S.ev.code);
    S.g = await gen1(S.ev); await regen();
    if (S.r && S.r.appBlocks.length && !S.flag) { /* prompt the tech to tell John */ drawFlag(); }
  }
  async function regen() {
    if (!S || !S.open) return;
    const seq = ++S.seq; S.busy = true;
    const r = await gen2(S.ev, S.g, S.collection, { resendOf: S.r && S.r.state && S.r.state.last && S.r.state.any && !(S.r.state.same) ? S.r.state.last.id : "" });
    if (seq !== S.seq || !S.open) return;
    S.r = r; S.busy = false;
    if (S.r.state.any && !S.r.state.same) { r.model.resendOf = r.state.last.id; r.email = C.buildEmail(r.model, K()); }
    paintAll();
  }
  function paintAll() { paintChecks(); paintImg(); paintSamples(); drawFlag(); paintSend(); }
  function paintChecks() {
    const el = S.w.querySelector("#csChecks"), r = S.r;
    if (!r) { el.innerHTML = '<span class="cs-spin">Checking the samples and building the CoC…</span>'; return; }
    const li = (c, cls) => `<li class="${cls}"><span class="cs-tag ${c.fix === "app" ? "app" : cls === "cs-w" ? "warn" : "tech"}">${c.fix === "app" ? "APP PROBLEM" : cls === "cs-w" ? "CHECK" : "FIX"}</span>${e9(c.text)}${c.sampleId ? ` <button type="button" class="linkish" data-open="${e9(c.sampleId)}">Open sample</button>` : ""}</li>`;
    let h = "";
    if (r.blocks.length) h += `<b style="color:#FFB4B4">Can't send yet: ${r.blocks.length} problem${r.blocks.length === 1 ? "" : "s"} to fix</b><ul class="cs-chk">${r.blocks.map(c => li(c, "cs-b")).join("")}</ul>`;
    if (r.appBlocks.length) h += `<div class="cs-banner cs-b"><b>This one isn't something you can fix in the app.</b> The CoC the app made does not match your samples (or the app is set up wrongly). Send stays blocked. Tick <b>Something looks wrong</b> at the bottom of this page, say what you can see, and send the error report to John.</div>`;
    if (r.warns.length) h += `<b style="color:#FFD58A">Please look at ${r.warns.length} thing${r.warns.length === 1 ? "" : "s"}</b> <span class="cs-count">(these don't stop the send)</span><ul class="cs-chk">${r.warns.map(c => li(c, "cs-w")).join("")}</ul>`;
    if (!r.blocks.length) h = `<ul class="cs-chk"><li class="cs-ok"><span class="cs-tag" style="background:#1E6B4A;color:#D5FFE9">ALL CLEAR</span>Volumes match average flow × run time, blanks are N/A, every sample has an ID, times and analysis, and the sample count matches the event.</li></ul>` + h;
    el.innerHTML = h;
    el.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { closeScreen(); openTrain(b.dataset.open); });
  }
  function paintImg() {
    const r = S.r, box = S.w.querySelector("#csImg"); if (!r) return;
    box.innerHTML = r.imgs.map((u, i) => `<img src="${u}" alt="CoC page ${i + 1} of ${r.imgs.length}" data-page="${i + 1}">`).join("");
    applyZoom();
    S.w.querySelector("#csImgNote").textContent = r.imgs.length + " page" + (r.imgs.length === 1 ? "" : "s") + ". This is the Form 302 CoC exactly as it will be attached (the spreadsheet and a PDF of it). Zoom in and check every line.";
    const a = S.w.querySelector("#csOpenImg"); if (S.url) URL.revokeObjectURL(S.url);
    r.canvases[0].toBlob(b => { if (b) { S.url = URL.createObjectURL(b); a.href = S.url; } }, "image/png");
  }
  function paintSamples() {
    const r = S.r; if (!r) return;
    S.w.querySelector("#csSamples").innerHTML = `<table class="cs-tbl"><thead><tr><th>No.</th><th>Sample ID</th><th>Type</th><th>Analyses</th><th>Run (min)</th><th>Volume (L)</th><th>Note</th></tr></thead><tbody>${r.model.samples.map(s => `<tr><td>${e9(s.no)}</td><td><b>${e9(s.id)}</b></td><td>${e9(s.type)}</td><td>${e9(s.analytes.join(", "))}</td><td>${e9(s.run == null ? "—" : s.run)}</td><td>${e9(s.vol == null ? "—" : s.vol)}</td><td>${e9(s.comment)}</td></tr>`).join("")}</tbody></table>`
      + (S.g.notUsed.length ? `<p class="cs-help" style="margin-bottom:0">Left off (not used / void): ${e9(S.g.notUsed.join(", "))}.</p>` : "");
  }
  function drawFlag() {
    const box = S.w.querySelector("#csFlagBox"), k = K(), r = S.r;
    const rep = r && r.reported, min = k.commentMin;
    if (rep) { box.innerHTML = `<b>Error report ${rep.status === "queued" ? "queued" : "sent"}</b><p class="cs-help" style="margin:6px 0 0">Your report went to ${e9(k.alertTo)} (${e9(C.perthStamp(new Date(rep.at)))}). Sending to the lab stays blocked for this CoC until the app is updated or the samples change. Your comment: “${e9(rep.comment)}”</p>`; return; }
    const prompt = r && r.appBlocks.length ? `<div class="cs-banner cs-b" style="margin-top:0"><b>Please tell us what you can see.</b> Tick the box, then write what is wrong in as much detail as you can (which sample, which number, what you expected).</div>` : `<p class="cs-help" style="margin-top:0">Spotted something the checks missed? Tick the box and tell John exactly what is wrong. Sending to the lab is blocked while this is ticked.</p>`;
    box.innerHTML = prompt + `<label style="display:flex;gap:10px;align-items:center;font-size:16px"><input type="checkbox" id="csFlagTick" style="width:24px;height:24px" ${S.flag ? "checked" : ""}> Something looks wrong</label>
      <div id="csFlagBody" ${S.flag ? "" : "hidden"}><label for="csFlagText">What is wrong? (required, at least ${min} characters)</label><textarea id="csFlagText" rows="4" placeholder="e.g. Sample 3 shows 840 L but it ran 420 min at 2.0 L/min, so it should be 840. The CoC says 84.">${e9(S.flagComment)}</textarea><div class="cs-count" id="csFlagCount"></div>
      <button type="button" class="btn danger" id="csFlagSend" style="margin-top:8px;min-height:46px">Send error report to John</button><div class="cs-help" id="csFlagMsg" style="margin:6px 0 0"></div></div>`;
    const tick = box.querySelector("#csFlagTick"), ta = box.querySelector("#csFlagText"), cnt = box.querySelector("#csFlagCount"), btn = box.querySelector("#csFlagSend"), body = box.querySelector("#csFlagBody");
    const upd = () => { const n = ta.value.trim().length; cnt.textContent = n + " / " + min + " characters"; cnt.className = "cs-count" + (n < min ? " bad" : ""); btn.disabled = n < min || S.sending || !S.r; };
    tick.onchange = () => { S.flag = tick.checked; body.hidden = !S.flag; S.checked = false; upd(); paintSend(); if (S.flag) setTimeout(() => ta.focus(), 50); };
    ta.oninput = () => { S.flagComment = ta.value; upd(); };
    btn.onclick = sendAlert; upd();
  }
  function describe() {
    const r = S.r; if (!r) return { can: false, why: "Building the CoC…" };
    const k = K(), st = r.state;
    if (S.sending) return { can: false, why: "Sending…" };
    if (r.blocks.length) return { can: false, why: "Fix the red problems above first." };
    if (S.flag) return { can: false, why: "Blocked while “Something looks wrong” is ticked. Send the error report, or untick it if you were mistaken." };
    if (!r.pdf) return { can: false, why: "The PDF could not be built. Go online once, then reopen this screen." };
    const mode = st.same ? "same" : st.any ? "amend" : "new";
    if (mode === "same") {
      const t = st.same.sent_at || st.same.requested_at;
      if (!S.resendMode) return { can: false, mode, why: "This exact CoC was already " + (st.same.status === "sent" ? "sent" : "queued") + " on " + C.perthStamp(new Date(t)) + ". Nothing has changed since." };
      if (st.throttle) return { can: false, mode, why: "A CoC for this event was sent less than " + k.resendThrottleMin + " minutes ago. Wait, then try again." };
    }
    if ((mode === "amend" || (mode === "same" && S.resendMode)) && S.reason.trim().length < 10) return { can: false, mode, why: "Say why you are sending it again (at least 10 characters)." };
    if (!S.checked) return { can: false, mode, why: "Tick “I have checked the CoC” to enable Send." };
    return { can: true, mode };
  }
  function paintSend() {
    if (!S || !S.w) return;
    const bar = S.w.querySelector("#csSendBar"), info = S.w.querySelector("#csSendInfo"), r = S.r;
    const d = describe(), cv = C.validateCollection(S.collection, new Date(), K());
    S.w.querySelector("#csColErr").textContent = S.collection.date || S.collection.from ? cv.errs.map(e => e.text).join(" ") : "";
    const mine = items.filter(it => it.kind === "send" && it.row.event_code === S.ev.code && it.state !== "done" && it.state !== "dupe");
    let top = "";
    if (r && r.state.any) {
      const L = r.state.last, t = L.sent_at || L.requested_at, st = L.status === "sent" ? "sent" : L.status === "failed" ? "failed" : "queued";
      top += `<div class="cs-banner ${r.state.same ? "cs-w" : "cs-ok"}" style="${r.state.same ? "" : "background:#1c2a4a;border:1px solid #4F6BB3"}"><b>${r.state.same ? "This CoC was already " + st : "A CoC for this event was " + st} on ${e9(C.perthStamp(new Date(t)))}</b> by ${e9(L.requested_by || "someone")}.${r.state.same ? " This one is identical, so it won't be sent again by accident." : " This one is different (" + e9(changed(r, L)) + "). It will go as <b>AMENDED</b> and the lab is told it replaces the earlier one."}</div>`;
      if (d.mode === "same" && !S.resendMode) top += `<button type="button" class="btn ghost" id="csResendBtn">The lab didn't get it: send it again…</button>`;
      if (d.mode === "amend" || S.resendMode) top += `<div class="cs-card"><label for="csReason">Why are you sending it again? (required, goes in the log)</label><input type="text" id="csReason" value="${e9(S.reason)}" placeholder="e.g. added the missing field blank"></div>`;
    }
    if (mine.length) top += `<div class="cs-banner cs-ok" style="background:#1c2a4a;border:1px solid #4F6BB3"><b>Waiting for signal.</b> You have already tapped Send. It will go to the lab by itself when this device is back online. ${e9(mine[0].lastErr ? "(" + mine[0].lastErr + ")" : "")}<br><button type="button" class="btn ghost" id="csCancelQ" style="margin-top:6px">Cancel the queued send</button></div>`;
    info.innerHTML = top;
    const rb = info.querySelector("#csResendBtn"); if (rb) rb.onclick = () => { S.resendMode = true; S.checked = false; paintSend(); };
    const rs = info.querySelector("#csReason"); if (rs) rs.oninput = () => { S.reason = rs.value; const dd = describe(); const b = bar.querySelector("#csGo"), c = bar.querySelector("#csTick"); if (b) b.disabled = !dd.can; };
    const cq = info.querySelector("#csCancelQ"); if (cq) cq.onclick = async () => { for (const it of mine) { it.state = "dupe"; await putItem(Object.assign({}, it)).catch(() => {}); } paintSend(); paintCard(); };
    const offline = !navigator.onLine;
    const blocked = !!(r && r.blocks.length) || S.flag || (d.mode === "same" && !S.resendMode);
    bar.innerHTML = `<label class="tick"><input type="checkbox" id="csTick" ${S.checked ? "checked" : ""} ${(!r || r.blocks.length || S.flag || blocked) ? "disabled" : ""}> I have checked the CoC</label>
      <button type="button" class="btn green" id="csGo" ${d.can ? "" : "disabled"}>${S.sending ? "Sending…" : offline ? "Send when online" : (d.mode === "amend" || S.resendMode ? "Send amended CoC" : "Send CoC to the lab")}</button>
      <p class="note">${e9(d.can ? (offline ? "You're offline. Tapping Send saves it on this device and it goes when you're back online." : "Tapping Send queues the email to " + K().labTo + ". The send can't be edited once queued.") : d.why)}</p>`;
    bar.querySelector("#csTick").onchange = ev => { S.checked = ev.target.checked; paintSend(); };
    bar.querySelector("#csGo").onclick = doSend;
  }
  function changed(r, L) {
    const bits = [];
    if (L.sample_count != null && L.sample_count !== r.model.samples.length) bits.push(L.sample_count + " → " + r.model.samples.length + " samples");
    const a = L.collection || {}, b = r.model.collection;
    if (a.date !== b.date || a.from !== b.from || (a.to || "") !== (b.to || "") || a.location !== b.location) bits.push("collection details");
    return bits.join(", ") || "sample details";
  }

  async function doSend() {
    if (!S || S.sending) return;
    await regen();                                   /* fresh hash, fresh checks, at the moment of the tap */
    const d = describe(); if (!d.can) { paintSend(); return; }
    S.sending = true; paintSend();
    const r = S.r, resendOf = (r.state.any && (!r.state.same || S.resendMode)) ? r.state.last.id : "";
    const reason = (resendOf ? S.reason.trim() : "");
    const it = sendRow(S, r, { resendOf, reason });
    enqueue(it);
    tryR(() => { v42EvLog(S.ev, navigator.onLine ? "COC queued to lab" : "COC saved to send when online", r.model.samples.length + " samples; collect " + r.model.collection.date + " " + r.model.collection.from + (resendOf ? "; AMENDED: " + reason : "")); saveQuiet(); });
    S.sending = false; S.checked = false; S.resendMode = false; S.reason = "";
    await run(); await refresh(S.ev.code); await regen(); paintCard();
    S.w.querySelector("#csSendInfo").insertAdjacentHTML("afterbegin", `<div class="cs-banner cs-ok"><b>${navigator.onLine ? "Queued." : "Saved on this device."}</b> ${navigator.onLine ? "The email goes to the lab within a minute or two. This page updates when it has gone." : "It will send itself when you're back online."}</div>`);
    pollSoon();
  }
  let polls = 0;
  function pollSoon() { polls = 0; const t = setInterval(async () => { polls++; if (!S || !S.open || polls > 24) { clearInterval(t); return; } await refresh(S.ev.code); if (S && S.r) { S.r.hist = historyFor(S.ev.code); S.r.state = C.sendState(S.r.hist, S.r.hash, new Date(), K()); paintSend(); } paintCard(); }, 10000); }

  async function sendAlert() {
    if (!S || !S.r || S.sending) return;
    const min = K().commentMin, c = S.flagComment.trim();
    if (c.length < min) { S.w.querySelector("#csFlagMsg").textContent = "Please write at least " + min + " characters so John can see what is wrong."; return; }
    S.sending = true; drawFlag();
    try {
      const r = S.r, manual = !r.blocks.length;
      const it = await alertRow(S, r, c, manual);
      enqueue(it);
      markReported(S.ev.id, r.hash, { at: new Date().toISOString(), comment: c, appVersion: appVer(), status: "queued", id: it.id, manual });
      tryR(() => { v42EvLog(S.ev, "COC error report raised", (manual ? "manual flag: " : "checks failed: ") + c.slice(0, 80)); saveQuiet(); });
    } catch (e) { S.w.querySelector("#csFlagMsg").textContent = "Couldn't prepare the report: " + (e && e.message || e); }
    S.sending = false; S.flag = false;
    await run(); await regen();
  }

  /* ---------- the card on the event screen ---------- */
  let lastRefresh = 0;
  function paintCard() {
    if (typeof view === "undefined" || view.page !== "event") return;
    const ev = tryR(() => eventById(view.eventId)); if (!ev || tryR(() => isFibreEvent(ev))) return;
    if (!(db.trains || []).some(t => t.eventId === ev.id && !isNoise(t))) return;
    const wrap = document.querySelector("#app .wrap"); if (!wrap) return;
    const hist = historyFor(ev.code).filter(r => r.kind === "send"), last = hist[hist.length - 1];
    const queued = items.some(it => it.kind === "send" && it.row.event_code === ev.code && it.state !== "done" && it.state !== "dupe");
    let st = '<span class="muted">Not sent yet.</span>';
    if (last) { const t = last.sent_at || last.requested_at; st = last.status === "sent" ? `Sent ${e9(C.perthStamp(new Date(t)))} to ${e9(last.to_addr || K().labTo)}.` : last.status === "failed" ? `<span style="color:#FFC46B">The last send failed: ${e9(last.message || "see the log")}. Review and send again.</span>` : last.status === "cancelled" ? "The last send was cancelled." : queued ? "Waiting for signal. It will go when you're back online." : `Queued ${e9(C.perthStamp(new Date(t)))}. Going to the lab.`; }
    if (last && last.collection && last.collection.date) st += `<br><span class="muted">Collection: ${e9(C.dayLabel(last.collection.date))}, ${e9(C.timeLabel(last.collection))}.</span>`;
    const html = `<div class="card cs-card-ev" id="cocSendCard"><h3 class="brand-type" style="margin:0 0 6px">Chain of custody to the lab</h3><div class="st">${st}</div><p class="help" style="margin:4px 0 8px">Checks the samples, shows the CoC page for you to check, then sends it to the lab when you tap Send.</p><button type="button" class="btn mid" id="cocSendOpen">Review and send CoC</button></div>`;
    const old = document.getElementById("cocSendCard");
    if (old) { if (old.dataset.h === html) return; const open = document.activeElement && document.activeElement.id === "cocSendOpen"; old.outerHTML = html; } else {
      const anchor = document.getElementById("driveCopies") || document.getElementById("sampleFilters");
      if (anchor) anchor.insertAdjacentHTML("beforebegin", html); else wrap.insertAdjacentHTML("beforeend", html);
    }
    const c = document.getElementById("cocSendCard"); c.dataset.h = html; c.querySelector("#cocSendOpen").onclick = () => openScreen(ev.id);
    if (Date.now() - lastRefresh > 30000 && navigator.onLine) { lastRefresh = Date.now(); refresh(ev.code).then(() => { const x = document.getElementById("cocSendCard"); if (x) { x.removeAttribute("data-h"); paintCard(); } }); }
  }
  const _render = window.render;
  window.render = render = function () { const r = _render.apply(this, arguments); try { paintCard(); } catch (e) { console.warn("coc-send card", e); } return r; };
  setTimeout(() => { run(); try { paintCard(); } catch (e) {} }, 800);

  window.cocSend = { version: C.VERSION, open: openScreen, pending, items: () => items.slice(), run, gather, gen1, gen2, history: historyFor, refresh, state: () => S, readBack };
})();
