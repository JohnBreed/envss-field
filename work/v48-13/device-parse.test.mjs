/* v48.13 on-device (Tesseract) parse tests: recorded Tesseract.js words from the real TSI photo, plus word clean-up cases.
   No network. Vision parsing is covered unchanged by work/v48-10 and work/v48-11. */
import fs from "fs"; import path from "path"; import vm from "vm"; import { fileURLToPath } from "url";
import { fieldChecks } from "./expect.mjs";
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "../../fit-test.js"), "utf8");
const root = {}; vm.runInNewContext(src, { window: root, globalThis: root, console, document: undefined });
const F = root.envssFit;
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (!ok && detail ? " — " + String(detail).slice(0, 500) : "")); }

const fx = JSON.parse(fs.readFileSync(path.join(dir, "fixtures/tesseract-tsi-reference-2000-psm11.json"), "utf8"));
const p = F.parseReport(fx.text, { ocrWords: fx.words, pageW: fx.pageW, pageH: fx.pageH, source: "device" });
const checks = fieldChecks(p.fields);
checks.forEach(c => check("device read: " + c.field, c.ok, c.got));
check("device read: no missing required fields", !p.missing.length, JSON.stringify(p.missing));
check("device read: no flags", !p.flags.length, JSON.stringify(p.flags));

/* Without source:"device" the same words go through the Vision path unchanged (device clean-up is opt-in). */
const visionPath = F.parseReport(fx.text, { ocrWords: fx.words, pageW: fx.pageW, pageH: fx.pageH });
check("device clean-up only runs for source=device", fieldChecks(visionPath.fields).filter(c => c.ok).length < checks.filter(c => c.ok).length);

const W = (t, x0, y0, x1, y1, c) => ({ t, x0, y0, x1, y1, c: c == null ? 95 : c });
const n = F.normalizeDeviceWords([W("IDNUMBER", 100, 10, 200, 25), W("PORTACOUNT", 300, 50, 400, 65), W("SIN", 405, 50, 430, 65, 75), W("N95.COMPANION™", 300, 80, 440, 95), W("EFFICIENCY<09%", 300, 110, 440, 125), W("fi", 5, 5, 12, 12, 19), W("—", 50, 50, 60, 52, 90), W("3M", 100, 140, 120, 155, 40)], 1000, 600);
const texts = n.map(w => w.text);
check("glued labels are split (IDNUMBER → ID NUMBER)", texts.includes("ID") && texts.includes("NUMBER"), texts.join("|"));
check("SIN after PORTACOUNT reads as S/N", texts.includes("S/N"), texts.join("|"));
check("N95.COMPANION™ → N95- COMPANION and EFFICIENCY<09% → EFFICIENCY <99%", texts.includes("N95-") && texts.includes("COMPANION") && texts.includes("EFFICIENCY") && texts.includes("<99%"), texts.join("|"));
check("edge noise dropped, short low-confidence digits kept", !texts.includes("fi") && !texts.includes("—") && texts.includes("3M"), texts.join("|"));
console.log("\nDevice field accuracy on the recorded real photo: " + checks.filter(c => c.ok).length + "/" + checks.length);
console.log(results.filter(r => r.ok).length + " passed, " + results.filter(r => !r.ok).length + " failed");
process.exit(results.every(r => r.ok) ? 0 : 1);
