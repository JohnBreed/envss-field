/* v47 noise module checks. Mock Supabase only. Usage: node test47.mjs <chromebook|pixel7> */
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
import fs from "fs";
const vp = process.argv[2] || "chromebook";
const { server, base } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9,MAP cdn.jsdelivr.net 127.0.0.1:9"]);
const ctx = browser.defaultBrowserContext(); await ctx.overridePermissions(base, ["geolocation"]);
const results = []; let fails = 0;
const ok = (name, cond, extra) => { const l = (cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : ""); console.error(l); results.push(l); if (!cond) fails++; };
const page = await browser.newPage();
await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
await page.setGeolocation({ latitude: -31.9523, longitude: 115.8613, accuracy: 9 });
await page.setRequestInterception(true);
const store = {}; const opts = {}; mockSupabase(page, store, opts);
const errs = []; page.on("pageerror", e => errs.push(String(e)));
let promptAnswer = ""; const dialogs = [];
page.on("dialog", async d => { dialogs.push(d.type() + ": " + d.message()); if (d.type() === "prompt") await d.accept(promptAnswer); else await d.accept(); });
await page.goto(base + "/field.html", { waitUntil: "domcontentloaded" });
await page.evaluate(SESSION); await page.reload({ waitUntil: "networkidle0" }); await sleep(1500);
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const T = id => ev(id => JSON.parse(JSON.stringify(db.trains.find(x => x.id === id))), id);
const type = async (sel, v) => { await page.$eval(sel, (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, v); await sleep(150); };
const clickC = async sel => { await page.$eval(sel, e => e.scrollIntoView({ block: "center" })); await sleep(120); await page.click(sel); };
const shot = n => page.screenshot({ path: `/tmp/v47-${vp}-${n}.png`, fullPage: true });

const boot = await ev(() => ({ app: APP_VERSION, nz: ENVSS_NOISE.version }));
ok("noise module v47.0 on unchanged core v46", boot.app === "46" && boot.nz === "47.0", JSON.stringify(boot));
await ev(() => { db.projects.push({ id: "ptest", number: "9999901", name: "V47 TEST project", source: "field" }); db.events.push({ id: "etest", projectId: "ptest", code: "9999901-001", type: "hygiene", date: "2026-11-11", stage: "planned", audit: [{ at: "2026-11-01T00:00:00Z", who: "old", action: "old entry", detail: "" }] }); db.events.push({ id: "etest2", projectId: "ptest", code: "9999901-002", type: "hygiene", date: "2026-11-11", stage: "planned", audit: [] }); save(); });

/* data safety: opening / listing an existing noise sample must not change it (no silent write that could sync over newer data) */
{
  const old = await ev(() => { const t = { id: "tnzold", eventId: "etest", trainKind: "noise_personal", contaminantId: "NOISE", sampleNo: 9, pouch: "9", status: "ended", startAt: "2026-11-10T00:00:00Z", endAt: "2026-11-10T08:00:00Z", dosimeterSerial: "D-OLD", analyses: [], person: { first: "Old", last: "Record", occupation: "Fitter" }, audit: [] };
    db.trains.push(t); save(); const c = JSON.parse(JSON.stringify(t)); delete c.updatedAt; return JSON.stringify(c); });
  await ev(() => openEvent("etest")); await sleep(200); await ev(() => openTrain("tnzold")); await sleep(400); await ev(() => openEvent("etest")); await sleep(200);
  const now = await ev(() => { const t = db.trains.find(x => x.id === "tnzold"); const c = JSON.parse(JSON.stringify(t)); delete c.updatedAt; return JSON.stringify(c); });
  { const a = JSON.parse(old), b = JSON.parse(now); const dk = [...new Set(Object.keys(a).concat(Object.keys(b)))].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])); ok("v47 opening an existing noise sample does not change the saved record", !dk.length, dk.map(k => k + ": " + JSON.stringify(a[k]) + " -> " + JSON.stringify(b[k])).join("; ").slice(0, 300)); }
}
/* A1 static: choose SLM */
const S = await ev(() => { addTrain("etest", "noise_static"); const t = db.trains.find(x => x.id === view.trainId); t.audit = [{ at: "2026-11-01T00:00:00Z", who: "old", action: "old entry", detail: "x" }]; save(); return t.id; });
await sleep(300);
ok("A1 static asks SLM or dose badge", await ev(() => document.querySelectorAll("[data-nz-method]").length === 2));
ok("A3 follow-up lists method/entry/LAeq as needed", await ev(id => { const it = answerItems(db.trains.find(x => x.id === id)); return ["nzMethod", "nzEntry", "nzLAeq"].every(k => it.some(i => i.key === k && !i.ok)); }, S));
await clickC('[data-nz-method="slm"]'); await sleep(300);
const lab = await ev(() => [...document.querySelectorAll("#app label")].map(l => l.textContent.trim()).filter(x => /serial/i.test(x)));
ok("A1 SLM path: SLM serial + NSEOC fields", lab.some(x => x.startsWith("Sound level meter serial")) && await ev(() => ["nz-slmNo", "nz-envssNo", "nz-source", "nz-conditions", "nz-position", "nz-duration", "nz-micSerial"].every(id => document.getElementById(id))), lab.join(","));
ok("B10 gate unchanged for noise static", JSON.stringify(await ev(id => startGaps(db.trains.find(x => x.id === id)), S)) === JSON.stringify(["Dosimeter serial", "Location"]));
/* manual entry */
await clickC('[data-nz-entry="manual"]'); await sleep(250);
await type("#dosimeter", "2250-TEST"); await type("#location", "TEST bay");
await type("#nz-slmNo", "12"); await type("#nz-source", "Two extraction fans running"); await type("#nz-position", "At extraction face"); await type("#nz-duration", "1:00");
await type("#nzLAeq", "87.19"); await type("#nzLCpeak", "106.07"); await type("#nzLCeq", "92.64");
let t = await T(S);
ok("A5 manual values + NSEOC fields saved", t.noise.values.LAeq.v === "87.19" && t.noise.values.LCeq.src === "manual" && t.noise.slmNo === "12" && t.noise.position === "At extraction face", JSON.stringify(t.noise.values));
ok("A3 LAeq satisfied in follow-up list", await ev(id => answerItems(db.trains.find(x => x.id === id)).find(i => i.key === "nzLAeq").ok, S));
/* A6 extent prompt for area >= 85 */
ok("A6 area LAeq ≥ 85 asks affected-area extent + distance", await ev(() => !!document.getElementById("nzExtent") && !!document.getElementById("nz-extent") && !!document.getElementById("nz-extentDistance")));
ok("A6 checks list asks for extent until filled", await ev(() => !!document.querySelector('[data-flag="a85"]')));
await type("#nz-extent", "Around the extraction face"); await type("#nz-extentDistance", "2");
ok("A6 extent flag clears when filled", await ev(() => !document.querySelector('[data-flag="a85"]')));
/* octave + HPD attenuation */
await page.$eval(".nz-oct", d => d.open = true); await type("#nz-octave_1000", "85.1");
await page.$eval(".nz-hpd", d => d.open = true); await clickC("#nzAddHpd"); await sleep(250);
await type('[data-nz-hpd="0.name"]', "3M E-A-Rsoft SuperFit"); await type('[data-nz-hpd="0.att"]', "24");
const att = await ev(() => document.querySelector('.nz-hpd input[readonly]')?.value);
ok("A5 HPD attenuation: LCeq − attenuation", att === "68.64", att);
/* A6 spectrum prompt */
await type("#nzLCpeak", "141.2");
ok("A6 LCpeak ≥ 140 asks for Spectrum Table photo", await ev(() => !!document.getElementById("nzSpectrum") && !!document.querySelector('[data-nz-take="spectrum"]')));
await type("#nzLCpeak", "106.07"); await type("#nzLAeq", "111.5");
ok("A6 LAeq > 110 asks for Spectrum Table photo", await ev(() => !!document.getElementById("nzSpectrum")));
await type("#nzLAeq", "87.19");
ok("A6 no spectrum prompt at normal levels", await ev(() => !document.getElementById("nzSpectrum")));
/* A8 flags */
await type("#nzLCpeak", "90.1");
ok("A8 LCpeak < LCeq flagged", await ev(() => !!document.querySelector('[data-flag="peak"]')));
await type("#nzLCpeak", "106.07");
ok("A8 missed start calibration flagged", await ev(() => !!document.querySelector('[data-flag="calS"]')));
await type('[data-nz-cal="start.ref"]', "94.0"); await type('[data-nz-cal="start.reading"]', "94.0");
ok("A2 start calibration recorded on the event for the day", await ev(() => { const c = db.events.find(e => e.id === "etest").noiseCal["2026-11-11"]; return c.start.reading === "94.0" && !!c.start.at && !!c.start.device; }));
ok("A8 start-cal flag clears", await ev(() => !document.querySelector('[data-flag="calS"]')));
await type('[data-nz-cal="end.ref"]', "94.0"); await type('[data-nz-cal="end.reading"]', "94.8");
ok("A2/A8 drift over the day flagged (> 0.5 dB)", await ev(() => !!document.querySelector('[data-flag="drift"]') && /Drift over the day: \+0\.8 dB/.test(document.getElementById("nzCal").innerText)));
await type("#nz-duration", "abc");
ok("A8 bad duration flagged", await ev(() => !!document.querySelector('[data-flag="dur"]')));
await type("#nz-duration", "1:00");
await ev(id => { const t = db.trains.find(x => x.id === id); t.startAt = "2026-11-11T03:00:00Z"; t.endAt = "2026-11-11T02:00:00Z"; t.status = "ended"; save(); }, S); await sleep(300);
ok("A8 start after stop flagged", await ev(() => !!document.querySelector('[data-flag="time"]')));
await type("#nz-flagNote", "TEST: times typed wrong, fixed on paper sheet");
ok("A8 field note saved with the sample", (await T(S)).noise.flagNote.startsWith("TEST: times"));
await ev(id => { const t = db.trains.find(x => x.id === id); t.startAt = "2026-11-11T02:00:00Z"; t.endAt = "2026-11-11T02:01:00Z"; save(); }, S); await sleep(200);
/* A2 multi-day */
const S2 = await ev(() => { addTrain("etest", "noise_static"); const t = db.trains.find(x => x.id === view.trainId); t.shiftDate = "2026-11-12"; t.noise = { method: "slm", entry: "manual", values: {} }; save(); render(); return t.id; });
await sleep(300);
ok("A2 multi-day: next day has its own calibration", await ev(() => /2026-11-12/.test(document.querySelector("#nzCal h3").textContent) && !document.querySelector('[data-nz-cal="start.reading"]').value));
await type('[data-nz-cal="start.ref"]', "114.0"); await type('[data-nz-cal="start.reading"]', "114.1");
ok("A2 both days kept on the event", await ev(() => Object.keys(db.events.find(e => e.id === "etest").noiseCal).sort().join(",") === "2026-11-11,2026-11-12"));
/* A15 duplicates within the same event only */
const S3 = await ev(S => { const src = db.trains.find(x => x.id === S); addTrain("etest", "noise_static"); const t = db.trains.find(x => x.id === view.trainId); t.dosimeterSerial = src.dosimeterSerial; t.location = "TEST bay"; t.noise = JSON.parse(JSON.stringify(src.noise)); save(); render(); return t.id; }, S);
await sleep(300);
ok("A15 duplicate flagged within the event", await ev(() => /Possible duplicate of Noise Sample 1/.test(document.getElementById("nzChecks").innerText)));
const S4 = await ev(S => { const src = db.trains.find(x => x.id === S); addTrain("etest2", "noise_static"); const t = db.trains.find(x => x.id === view.trainId); t.dosimeterSerial = src.dosimeterSerial; t.noise = JSON.parse(JSON.stringify(src.noise)); save(); render(); return t.id; }, S);
await sleep(300);
ok("A15 same values in another event not flagged", await ev(() => !document.querySelector('[data-flag="dup"]')));
await ev(id => { db.trains = db.trains.filter(x => x.id !== id); save(); }, S4);
/* A4 photo path with OCR (Tesseract stubbed — the CDN is blocked in this test) */
await ev(id => openTrain(id), S3); await sleep(250);
await clickC('[data-nz-entry="photo"]'); await sleep(300);
const sw = await T(S3);
ok("A4 switching to photo clears typed values (never both), logged", !sw.noise.values.LAeq && sw.audit.some(a => /Values entered from a photo/.test(a.action) && /cleared LAeq/.test(a.detail)), dialogs.slice(-1)[0]);
ok("A4 photo mode: values read-only until read or corrected", await ev(() => document.getElementById("nzLAeq").readOnly));
await ev(() => { window.Tesseract = { recognize: async () => ({ data: { text: "Broadband\nLAeq 84.85 dB\nLCpeak 103.81 dB\nLCeq 90.86 dB\nElapsed time 0:01:00" } }) }; });
const up = await page.$('input[data-nz-take="screen"]'); await up.uploadFile("/tmp/meter.jpg"); await sleep(700);
ok("A12 crop guide shown before saving the photo", await ev(() => !!document.querySelector("#nzCrop .nz-guide")));
await clickC("#nzCropYes"); await sleep(2000);
t = await T(S3);
ok("A4 OCR fills LAeq / LCpeak / LCeq from the photo", t.noise.values.LAeq && t.noise.values.LAeq.v === "84.85" && t.noise.values.LCpeak.v === "103.81" && t.noise.values.LCeq.v === "90.86" && t.noise.values.LAeq.src === "ocr", JSON.stringify(t.noise.values));
ok("A4 OCR reads duration for SLM", t.noise.duration === "1:00", t.noise.duration);
const ref = Object.values(t.photoRefs || {}).find(r => r.field === "noiseScreen");
ok("A11 photo stored + shrunk by envssPhotos", !!ref && t.noise.photo.startsWith("envss-photo:") && ref.bytes < ref.bytesBefore && t.noise.photoCropped === true, ref ? ref.bytes + " < " + ref.bytesBefore : "no ref");
promptAnswer = "91.20";
await clickC('[data-nz-fix="LCeq"]'); await sleep(400);
t = await T(S3);
ok("A4 misread corrected, original photo reading kept beside it", t.noise.values.LCeq.v === "91.20" && t.noise.values.LCeq.ocr === "90.86" && t.noise.values.LCeq.src === "corrected" && await ev(() => /Photo read 90\.86 → corrected to 91\.20/.test(document.querySelector('[data-nz-row="LCeq"]').innerText)));
ok("A4 correction in audit log", t.audit.some(a => /Corrected LCeq/.test(a.action)));
/* A10 save to device */
await sleep(500);
await page.$eval('[data-nz-save="screen"]', e => e.scrollIntoView({ block: "center" })); await sleep(200);
await clickC('[data-nz-save="screen"]'); await sleep(800);
ok("A10 save photo to device", (await T(S3)).audit.some(a => a.action === "Photo saved to device"), await ev(() => { const b = document.querySelector('[data-nz-photo="screen"]'); return b ? b.innerHTML.slice(0, 300) : "no box"; }) + " dialogs:" + dialogs.slice(-2).join("|"));
ok("A10 share button offered", await ev(() => !!document.querySelector('[data-nz-share="screen"]')));
/* OCR not available: CDN blocked → graceful */
await ev(() => { delete window.Tesseract; });
await clickC("#nzReadAgain"); await sleep(2500);
ok("A4 OCR download failure degrades gracefully", await ev(() => /could not be read|needs a connection/.test(document.getElementById("nzOcrState")?.innerText || "")), await ev(() => document.getElementById("nzOcrState")?.innerText || ""));
ok("A4 values kept after failed re-read", (await T(S3)).noise.values.LAeq.v === "84.85");
await page.setOfflineMode(true);
await clickC("#nzReadAgain"); await sleep(600);
ok("A4 offline: photo kept, asks to read later or enter", await ev(() => /needs a connection/.test(document.getElementById("nzOcrState")?.innerText || "")));
await page.setOfflineMode(false);
await shot("slm-photo");
/* A1 personal dose path, hearing protection kept separate */
const P = await ev(() => { addTrain("etest", "noise_personal"); return view.trainId; }); await sleep(300);
ok("A1 personal = dose badge path (no method choice, badge fields)", await ev(() => !document.querySelector("[data-nz-method]") && !!document.getElementById("nz-badgeType") && !!document.querySelector('[data-yn="hpd"]')));
ok("B10 gate unchanged for noise personal", JSON.stringify(await ev(id => startGaps(db.trains.find(x => x.id === id)), P)) === JSON.stringify(["Dosimeter serial", "First name", "Last name", "Occupation"]));
await clickC('[data-nz-entry="manual"]'); await sleep(200); await type("#nzLAeq", "88.0");
ok("A6 no extent prompt on a personal reading", await ev(() => !document.getElementById("nzExtent")));
/* A13 / G25 audit: login, GPS, device on new entries; old history untouched */
await sleep(500);
t = await T(P);
const last = (t.audit || []).filter(a => a.device).slice(-1)[0];
ok("G25 audit entries keep login, time, GPS and device", !!last && last.login === "field.test@envss.com.au" && last.gps && Math.abs(last.gps.lat + 31.9523) < 0.001 && /Android|ChromeOS/.test(last.device) && !!last.at, last ? JSON.stringify({ login: last.login, gps: last.gps, device: last.device }) : "none");
ok("G25 older audit entries not back-stamped", (await T(S)).audit.find(a => a.action === "old entry").device === undefined);
ok("G25 audit log collapsed at the bottom", await ev(() => { const h = document.getElementById("auditToggle"), b = document.getElementById("auditBox"); return !!h && b && b.hidden; }));
await ev(() => document.getElementById("auditToggle").click()); await sleep(200);
ok("G25 audit log shows GPS + device text", await ev(() => /GPS -31\.95/.test(document.getElementById("auditBox").innerText)));
/* A14 sync: noise data reaches Supabase (mock) */
await sleep(3000);
const rowS = (store.envss_trains && store.envss_trains.get(S3)) || {}; const rowE = (store.envss_events && store.envss_events.get("etest")) || {};
ok("A14 noise values sync with the sample", ((rowS.payload || {}).noise || {}).values && rowS.payload.noise.values.LCeq.v === "91.20", JSON.stringify(((rowS.payload || {}).noise || {}).values || {}).slice(0, 120));
ok("A14 calibration syncs with the event", !!(((rowE.payload || {}).noiseCal || {})["2026-11-12"]));
/* layout */
for (const id of [S3, P]) { await ev(id => openTrain(id), id); await sleep(250); const o = await ev(() => document.documentElement.scrollWidth - window.innerWidth); ok("layout noise sample: no sideways scroll", o <= 1, o + "px"); }
await ev(id => openTrain(id), S); await sleep(250); await shot("slm-manual");
ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
console.log(`== v47 ${vp} ==\n` + results.join("\n") + `\n${results.length - fails}/${results.length} passed`);
fs.writeFileSync(`/tmp/v47-${vp}-results.txt`, results.join("\n"));
await browser.close(); server.close(); process.exit(fails ? 1 : 0);
