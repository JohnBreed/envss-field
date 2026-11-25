/* Real laptop-screen TSI report: ocrText saved from envss_fit_reports frj2elok0 (text only, no photo). */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "../../fit-test.js"), "utf8");
const root = {};
vm.runInNewContext(src, { window: root, globalThis: root, console, document: undefined });
const F = root.envssFit;
const text = fs.readFileSync(path.join(dir, "fixtures/frj2elok0-ocr.txt"), "utf8");
const parsed = F.parseReport(text);
const f = parsed.fields;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (!ok && detail ? " — " + String(detail).slice(0, 500) : ""));
}
check("ID ENVSS1", f.idNumber === "ENVSS1", f.idNumber);
check("Breed / John", f.lastName === "Breed" && f.firstName === "John", JSON.stringify({ last: f.lastName, first: f.firstName }));
check("ENVSS / Various", f.company === "ENVSS" && f.location === "Various", JSON.stringify({ c: f.company, l: f.location }));
check("test 25/11/2026 10:45 silently (US 11/25 resolved, no warning)", f.testDate.display === "25/11/2026" && f.testTime === "10:45" && f.testDate.flag === "" && !parsed.flags.some(x => x.field === "testDate"), JSON.stringify({ d: f.testDate, flags: parsed.flags }));
check("due 25/11/2027 silently", f.dueDate.display === "25/11/2027" && f.dueDate.flag === "" && !parsed.flags.some(x => x.field === "dueDate"), JSON.stringify(f.dueDate));
check("3M / Aura 9322A+ / One Size", f.manufacturer === "3M" && f.model === "Aura 9322A+" && f.respiratorSize === "One Size", JSON.stringify({ mfr: f.manufacturer, model: f.model, size: f.respiratorSize }));
check("S/N 8048192704 / N95-Companion Yes", f.portaCountSn === "8048192704" && /^Yes$/i.test(f.n95Companion), JSON.stringify({ sn: f.portaCountSn, n95: f.n95Companion }));
check("OSHA FAST-FILTERING FACE / pass 100 / Efficiency Yes / approval blank", f.protocol === "OSHA FAST-FILTERING FACE" && f.passLevel === 100 && /^Yes$/i.test(f.efficiency) && !f.approval, JSON.stringify({ p: f.protocol, pl: f.passLevel, e: f.efficiency, a: f.approval }));
check("respirator and style are the full joined text", /3M Aura 9322A\+ Disposable P2 Flat-fold/.test(f.respirator || "") && /\[100\]\s*N95/.test(f.respirator || "") && /exhalation\s+valve/i.test(f.respiratorStyle || ""), JSON.stringify({ r: f.respirator, s: f.respiratorStyle }));
const ex = (f.exercises || []).map(e => [e.exercise, String(e.duration || ""), e.fitFactorRaw || (e.fitFactor && e.fitFactor.raw), e.pass].join("/"));
check("four exercises 50/30/30/30 all 200+ Yes", ex.join(" | ") === "BENDING OVER/50/200+/yes | TALKING/30/200+/yes | HEAD SIDE TO SIDE/30/200+/yes | HEAD UP AND DOWN/30/200+/yes", ex.join(" | "));
check("overall 200+ PASS", f.overallFf && f.overallFf.raw === "200+" && f.result === "PASS", JSON.stringify({ ff: f.overallFf, r: f.result }));
check("operator EA / name John Breed / note not Search", f.operator === "EA" && f.operatorName === "John Breed" && !f.note, JSON.stringify({ op: f.operator, n: f.operatorName, note: f.note }));
console.log("\n" + results.filter(r => r.ok).length + " passed, " + results.filter(r => !r.ok).length + " failed");
process.exit(results.every(r => r.ok) ? 0 : 1);
