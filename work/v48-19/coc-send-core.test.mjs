/* Node unit tests for coc-send-core.js (pure checks, privacy lint, email, error report, hash, layout). No browser, no network. */
import { createRequire } from "module"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const require = createRequire(import.meta.url); const dir = path.dirname(fileURLToPath(import.meta.url));
const C = require(path.resolve(dir, "../../coc-send-core.js"));
const results = [];
function check(n, ok, d) { results.push({ name: n, ok: !!ok }); console.log((ok ? "PASS" : "FAIL") + "  " + n + (!ok && d ? " — " + String(d).slice(0, 500) : "")); }
const k = C.cfg(), now = new Date("2026-11-28T08:00:00Z");   /* 4 pm Perth, Saturday */
const raw = (o) => Object.assign({ key: "k", label: "Sample 1", no: 1, id: "C-1", blank: false, rejected: false, rejectCode: "", rejectReason: "", status: "ended", startAt: "2026-11-28T06:00:00Z", endAt: "2026-11-28T13:00:00Z", startFlow: "2.0", endFlow: "2.0", dateSampled: "28/11/2026", type: "Personal", codes: ["INH"], location: "Mill", flowOk: true }, o || {});
const mkModel = (rs) => ({ samples: rs.map(r => { const x = C.recompute(r); return { no: r.no, id: r.id, dateSampled: r.dateSampled, type: r.type, codes: r.codes, analytes: r.codes, run: r.blank ? "N/A" : Math.round(x.mins), vol: r.blank ? "N/A" : x.volR, comment: "" }; }), collection: { date: "2026-11-30", from: "09:00", to: "12:00", location: "10 Bermondsey Street, West Leederville WA 6007" }, job: "0019358", eventCode: "0019358-001" });
const xl = (m) => ({ rows: m.samples.map(s => ({ id: s.id, date: s.dateSampled, type: s.type, analytes: s.codes, run: s.run, vol: s.vol, comment: s.comment })), strings: [], analyteHeaders: ["Inhalable dust"], esdatTick: true, resultsTo: "lab@envss.com.au", invoiceTo: "accounts@envss.com.au", phone: "08 9355 4010" });
const base = (rs, mut) => { const m = mkModel(rs); const x = xl(m); if (mut) mut(m, x); return C.runChecks({ cfg: k, now, job: "0019358", raw: rs, model: m, expectedCount: rs.length, xlsx: x, pdf: { texts: ["ESDAT"].concat(rs.map(r => r.id)) }, libs: { excel: true, pdf: true }, unfinished: [], notUsed: [], collection: m.collection, eventDateDmy: "28/11/2026", dayDiff: () => 0, texts: [], forbidden: [] }); };
const ids = (cs, lvl) => cs.filter(c => !lvl || c.level === lvl).map(c => c.id);

check("clean event: no blocks", ids(base([raw(), raw({ no: 2, id: "C-2", label: "Sample 2" }), raw({ no: 0, id: "C-B", label: "Sample 0", blank: true, type: "Blank", startAt: "", endAt: "", startFlow: "", endFlow: "" })]), "block").length === 0);
check("volume = average flow x run time (2.0/1.9 over 420 min = 819.0 L)", C.recompute(raw({ endFlow: "1.9" })).volR === 819);
check("generated volume that is wrong is an APP block", ids(base([raw()], (m, x) => { x.rows[0].vol = 84; m.samples[0].vol = 84; }), "block").includes("vol_mismatch"));
const vm = base([raw()], (m, x) => { x.rows[0].vol = 84; }).find(c => c.id === "vol_mismatch");
check("  ... and it is classed fix=app with the value and expectation", vm && vm.fix === "app" && vm.value === 84 && vm.expected === 840, JSON.stringify(vm));
check("spreadsheet vs page volume disagreement is caught", ids(base([raw()], (m, x) => { m.samples[0].vol = 800; })).includes("vol_mismatch_pdf"));
check("run time that does not match start to stop is an app block", ids(base([raw()], (m, x) => { x.rows[0].run = 300; })).includes("run_mismatch"));
check("blank with a number instead of N/A is an app block", ids(base([raw({ blank: true, no: 0, type: "Blank", startAt: "", endAt: "" })], (m, x) => { x.rows[0].run = 420; })).includes("blank_not_na"));
check("sample count mismatch (xlsx vs event) is an app block", ids(base([raw(), raw({ no: 2, id: "C-2" })], (m, x) => { x.rows.pop(); })).includes("count_xlsx"));
check("sample count mismatch (page vs event) is an app block", ids(base([raw(), raw({ no: 2, id: "C-2" })], (m, x) => { m.samples.pop(); })).includes("count_pdf"));
check("rejected sample without a reason blocks (tech fix)", base([raw({ rejected: true, status: "rejected" })]).some(c => c.id === "reject_reason" && c.level === "block" && c.fix === "tech"));
check("rejected sample whose CoC comment does not say rejected is an app block", ids(base([raw({ rejected: true, status: "rejected", rejectCode: "damaged_filter" })], (m, x) => { x.rows[0].comment = ""; })).includes("reject_note"));
check("duplicate sample IDs block (case-insensitive)", ids(base([raw({ id: "C-1" }), raw({ no: 2, id: "c-1" })]), "block").includes("id_dup"));
check("duplicate sample numbers block", ids(base([raw(), raw({ id: "C-2" })]), "block").includes("no_dup"));
check("no analysis requested blocks", ids(base([raw({ codes: [] })]), "block").includes("no_analysis"));
check("missing stop time blocks; missing start time blocks", ids(base([raw({ endAt: "" }), raw({ no: 2, id: "C-2", startAt: "" })]), "block").filter(i => i === "time_missing").length === 2);
check("no flow blocks; one flow warns", ids(base([raw({ startFlow: "", endFlow: "" })]), "block").includes("flow_missing") && ids(base([raw({ endFlow: "" })], null), "warn").includes("one_flow"));
check("missing cassette ID blocks", ids(base([raw({ id: "" })]), "block").includes("id_missing"));
check("unfinished samples block with their reason", C.runChecks({ cfg: k, now, job: "0019358", raw: [raw()], model: null, expectedCount: 1, unfinished: [{ label: "Sample 3", why: "Never started" }], collection: mkModel([raw()]).collection }).some(c => c.id === "unfinished" && /Never started/.test(c.text)));
check("job number not 7 digits is an app block", C.runChecks({ cfg: k, now, job: "19358", raw: [raw()], expectedCount: 1, collection: mkModel([raw()]).collection }).some(c => c.id === "job_number" && c.fix === "app"));
check("analysis shown by raw code (no catalogue name) is an app block", C.runChecks({ cfg: k, now, job: "0019358", raw: [raw()], model: mkModel([raw()]), expectedCount: 1, xlsx: Object.assign(xl(mkModel([raw()])), { analyteHeaders: ["XYZ"] }), collection: mkModel([raw()]).collection }).some(c => c.id === "analyte_name"));
check("wrong results / invoice email, wrong phone, missing ESDAT tick are app blocks", (() => { const i = ids(base([raw()], (m, x) => { x.resultsTo = "x@y.com"; x.invoiceTo = "lab@envss.com.au"; x.phone = "0419 628 710"; x.esdatTick = false; })); return ["results_email", "invoice_email", "phone_wrong", "esdat_missing"].every(a => i.includes(a)); })());
check("generation error / missing library are app blocks", ids(C.runChecks({ cfg: k, now, job: "0019358", raw: [raw()], expectedCount: 1, genError: "boom", libs: { excel: false, pdf: false }, collection: mkModel([raw()]).collection }), "block").filter(i => ["gen_failed", "lib_excel", "lib_pdf"].includes(i)).length === 3);
check("warnings: no field blank, long run, short run, flow tolerance, date off, not used left off", (() => { const w = ids(C.runChecks({ cfg: k, now, job: "0019358", raw: [raw({ startAt: "2026-11-27T00:00:00Z", endAt: "2026-11-28T00:00:00Z" }), raw({ no: 2, id: "C-2", startAt: "2026-11-28T06:00:00Z", endAt: "2026-11-28T06:10:00Z", flowOk: false, dateSampled: "20/11/2026" })], expectedCount: 2, notUsed: ["Sample 9"], eventDateDmy: "28/11/2026", dayDiff: d => d === "20/11/2026" ? -8 : 0, collection: mkModel([raw()]).collection }), "warn"); return ["no_blank", "run_long", "run_short", "flow_tolerance", "sample_date_off", "not_used_left_off"].every(a => w.includes(a)); })());
/* collection */
const cv = (c) => C.validateCollection(c, now, k);
check("collection: all missing -> 3 errors", cv({}).errs.length === 3);
check("collection: yesterday, end before start, short location", (() => { const e = cv({ date: "2026-11-27", from: "10:00", to: "09:00", location: "x" }).errs.map(a => a.id); return e.includes("collection_date_past") && e.includes("collection_window") && e.includes("collection_location_short"); })());
check("collection: Monday 9-12 at the office is clean", cv({ date: "2026-11-30", from: "09:00", to: "12:00", location: "10 Bermondsey Street, West Leederville WA 6007" }).ok && cv({ date: "2026-11-30", from: "09:00", to: "12:00", location: "10 Bermondsey Street, West Leederville WA 6007" }).warns.length === 0);
check("collection: Sunday and 6 am warn", (() => { const w = cv({ date: "2026-11-29", from: "06:00", location: "10 Bermondsey Street" }).warns.map(a => a.id); return w.includes("collection_weekend") && w.includes("collection_hours"); })());
check("collection: time window optional (from only is valid)", cv({ date: "2026-11-30", from: "09:00", location: "10 Bermondsey Street" }).ok);
/* privacy lint */
const lint = (t, f) => C.privacyLint(t, { forbidden: f || [], cfg: k });
check("lint: allowed emails and phones pass (lab@, accounts@, office, Envirolab 1300)", lint(["lab@envss.com.au accounts@envss.com.au 08 9355 4010 (08) 9355 4010 1300 424 344"]).length === 0);
check("lint: personal email, mobile (spaced and unspaced), +61 mobile, other landline all flagged", lint(["a@b.com"]).length === 1 && lint(["0419 628 710"]).length === 1 && lint(["0419628710"]).length === 1 && lint(["+61 419 628 710"]).length === 1 && lint(["(08) 9000 1234"]).length === 1);
check("lint: forbidden names flagged case-insensitively, short ones ignored", lint(["by taylor TESTER"], [{ kind: "tech name", v: "Taylor Tester" }]).length === 1 && lint(["ab"], [{ kind: "x", v: "ab" }]).length === 0);
check("lint: job numbers, dates and sample IDs are not mistaken for phones", lint(["0019358-001", "28/11/2026 15:30", "C-10234567", "840.0", "Job 0019358"]).length === 0);
/* email */
const model = Object.assign(mkModel([raw(), raw({ no: 0, id: "C-B", blank: true, type: "Blank", startAt: "", endAt: "" })]), { officePhone: k.officePhone, officeAddress: k.officeAddress, resultsTo: k.resultsTo, invoiceTo: k.invoiceTo, turnaround: "standard", attachmentNames: ["a.xlsx", "a.pdf"], analyteNames: ["Inhalable dust"], analyteCodes: ["INH"], preparedAt: "28/11/2026 16:00 AWST" });
const em = C.buildEmail(model, k);
check("email: states ESDAT, results + invoice addresses, collection day/time/where, office phone, no contact other than the office, no red anywhere", /Results required in ESDAT format\./.test(em.text) && !/RESULTS REQUIRED IN ESDAT/.test(em.text) && /lab@envss\.com\.au/.test(em.text) && /accounts@envss\.com\.au/.test(em.text) && /Mon 30 Nov 2026/.test(em.text) && /9:00 am to 12:00 pm/.test(em.text) && /Bermondsey/.test(em.text) && /08 9355 4010/.test(em.text) && lint([em.subject, em.text, em.html]).length === 0);
check("email: amended says AMENDED in subject and body", (m => /AMENDED/.test(m.subject) && /AMENDED chain of custody/.test(m.text))(C.buildEmail(Object.assign({}, model, { resendOf: "cs_x" }), k)));
check("email: HTML escapes the collection address", /&lt;script&gt;/.test(C.buildEmail(Object.assign({}, model, { collection: Object.assign({}, model.collection, { location: "<script>x</script> gate" }) }), k).html));
/* error report */
const al = C.buildAlert({ flag: { raised: true, manual: false, comment: "Volume is 10x" }, techUser: "t@envss.com.au", job: "0019358", eventCode: "0019358-001", model, expectedCount: 2, failed: [{ level: "block", fix: "app", id: "vol_mismatch", text: "bad", value: 84, expected: 840 }], warned: [], raw: [raw()], collection: model.collection, hash: "h", appVersion: "48.19", device: "UA", screen: "1x1", online: true, when: now, attachmentNames: ["a.pdf"] }, k);
check("error report: tech flag + comment first, then job/event, failing check with value, version, device, user, time, attachments", al.text.startsWith("TECH FLAG: SOMETHING LOOKS WRONG") && al.text.indexOf("Volume is 10x") < al.text.indexOf("JOB / EVENT") && /vol_mismatch/.test(al.text) && /value=84/.test(al.text) && /expected=840/.test(al.text) && /App version: 48\.19/.test(al.text) && /Device \/ browser: UA/.test(al.text) && /Raised by: t@envss/.test(al.text) && /Time \(AWST\): 28\/11\/2026 16:00 AWST/.test(al.text) && /ATTACHED: a\.pdf/.test(al.text), al.text.slice(0, 600));
/* hash + duplicate state */
const h1 = await C.contentHash(model), h2 = await C.contentHash(JSON.parse(JSON.stringify(model))), h3 = await C.contentHash(Object.assign({}, model, { collection: Object.assign({}, model.collection, { from: "10:00" }) }));
check("hash: stable for identical content; changes with collection time", h1 === h2 && h1 !== h3 && h1.length === 64);
const hist = [{ id: "a", kind: "send", status: "sent", content_hash: h1, requested_at: "2026-11-28T07:55:00Z" }, { id: "b", kind: "alert", status: "sent", content_hash: null, requested_at: "2026-11-28T07:56:00Z" }, { id: "c", kind: "send", status: "failed", content_hash: h3, requested_at: "2026-11-28T07:57:00Z" }];
const ss = C.sendState(hist, h1, now, k);
check("send state: same hash found, throttle inside 10 min, alerts and failed sends ignored", ss.same && ss.same.id === "a" && ss.throttle === true && C.sendState(hist, h3, now, k).same === null && C.sendState(hist, h1, new Date("2026-11-28T09:00:00Z"), k).throttle === false);
/* the page itself is the generated Form 302 drawn by layoutSheet; it needs ExcelJS, so it is covered with the real workbook in coc-send.test.mjs */
check("core exports layoutSheet (the page) and no custom page design", typeof C.layoutSheet === "function" && !C.layoutCoc);
check("email html and text carry no red (colour or caps banner)", (e => !/#(b7|c0|d0|f0|e0|ff0000)[0-9a-f]{0,4}\b/i.test(e.html) && !/color:\s*(red|#f00)/i.test(e.html) && !/[A-Z]{12,}/.test(e.text.replace(/ENVSS|ESDAT|JOB|DEVICE/g, ""))) (C.buildEmail(model, k)));
check("alert email has no red either", !/#b71f1f|color:\s*red/i.test(al.html));
const rm = base([raw()], null); check("render check: every sample id must be on the rendered page", ids(C.runChecks({ cfg: k, now, job: "0019358", raw: [raw()], model: mkModel([raw()]), expectedCount: 1, xlsx: xl(mkModel([raw()])), pdf: { texts: ["ESDAT"] }, libs: { excel: true, pdf: true }, unfinished: [], notUsed: [], collection: mkModel([raw()]).collection, eventDateDmy: "28/11/2026", dayDiff: () => 0, texts: [], forbidden: [] }), "block").includes("render_missing_sample") && !ids(rm, "block").includes("render_missing_sample"));
/* sampler name (t782u): allowed in the contact / relinquished-by boxes only */
const lintP = (texts, permitIdx) => C.privacyLint(texts, { cfg: k, forbidden: [{ kind: "tech name", v: "Taylor Tester" }, { kind: "worker name", v: "Sam Testone" }, { kind: "worker name", v: "Testone" }], permit: i => permitIdx.includes(i) ? ["Taylor Tester", "Taylor", "Tester", "TT"] : null });
check("lint: sampler name allowed in the permitted fields", lintP(["Taylor Tester", "Taylor Tester", "TT"], [0, 1, 2]).length === 0);
check("lint: sampler name anywhere else is still blocked", lintP(["Taylor Tester", "note: Taylor Tester"], [0]).length === 1);
check("lint: worker name inside a permitted field is still blocked", lintP(["Taylor Tester Testone"], [0]).some(v => v.kind === "worker name"));
check("lint: tech email / mobile inside a permitted field is still blocked", lintP(["Taylor Tester tt@envss.com.au 0419 628 710"], [0]).map(v => v.kind).sort().join() === "email address,phone number");
const smp = (who, samplers) => C.runChecks({ cfg: k, now, job: "0019358", raw: [raw()], model: mkModel([raw()]), expectedCount: 1, xlsx: Object.assign(xl(mkModel([raw()])), { who }), pdf: { texts: ["ESDAT", "C-1"] }, libs: { excel: true, pdf: true }, unfinished: [], notUsed: [], collection: mkModel([raw()]).collection, eventDateDmy: "28/11/2026", dayDiff: () => 0, texts: [], forbidden: [], samplers });
const wOk = { contact: "Taylor Tester", projectMgr: "Taylor Tester", sampler: "Taylor Tester", printName: "Taylor Tester" };
check("sampler check: contact, project mgr, sampler and relinquished-by all match the app's sampler: clean", !smp(wOk, ["Taylor Tester"]).some(c => /^sampler_/.test(c.id)));
check("sampler check: a wrong or missing name on the form is an app block", smp(Object.assign({}, wOk, { printName: "" }), ["Taylor Tester"]).some(c => c.id === "sampler_printName" && c.level === "block" && c.fix === "app"));
check("sampler check: nobody recorded as sampler is a warning for the tech", smp({}, []).some(c => c.id === "sampler_missing" && c.level === "warn"));
const f = results.filter(r => !r.ok); console.log("\n" + (results.length - f.length) + " passed, " + f.length + " failed"); process.exit(f.length ? 1 : 0);
