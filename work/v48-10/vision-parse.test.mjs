/* Parser tests against real Google Vision fixtures of synthetic TSI reports. */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "../../fit-test.js"), "utf8");
const root = {};
vm.runInNewContext(src, { window: root, globalThis: root, console, document: undefined });
const F = root.envssFit;
if (!F) { console.error("envssFit not loaded"); process.exit(1); }

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (!ok && detail ? " — " + String(detail).slice(0, 600) : ""));
}

const EXPECT = {
  breed: {
    idNumber: "ENVSS1", lastName: "Breed", firstName: "John", company: "ENVSS", location: "Various",
    testDate: "25/11/2026", testTime: "10:45", dueDate: "25/11/2027",
    portaCountSn: "8048192704", n95Companion: /^Yes$/i, model: "Aura 9322A+", manufacturer: "3M",
    size: /One Size/i, protocol: /OSHA FAST-FILTERING FACE/i, passLevel: 100,
    overall: 200, result: "PASS", operator: "EA", operatorName: "John Breed",
    style: /exhalation\s*\.?\s*valve/i, respirator: /Aura 9322A\+/, exercises: 4
  },
  tester: {
    idNumber: "T-100", lastName: "Tester", firstName: "Sam", company: "Northwind", location: "Site A",
    testDate: "03/03/2026", testTime: "14:10", dueDate: "03/03/2027",
    portaCountSn: "8048201111", n95Companion: /^Yes$/i, model: "1870+", manufacturer: "3M",
    size: /Standard/i, protocol: /OSHA FAST-FILTERING FACE/i, passLevel: 100,
    overall: 200, result: "PASS", operator: "EA", operatorName: "Sam Tester",
    style: /flat-fold/i, respirator: /1870\+/, exercises: 4
  }
};

function who(name) { return name.includes("tester") ? "tester" : "breed"; }

function evalFix(name, f) {
  const exp = EXPECT[who(name)];
  const got = {
    idNumber: f.idNumber, lastName: f.lastName, firstName: f.firstName, company: f.company, location: f.location,
    testDate: f.testDate && f.testDate.display, testTime: f.testTime, dueDate: f.dueDate && f.dueDate.display,
    portaCountSn: f.portaCountSn, n95: f.n95Companion, model: f.model, manufacturer: f.manufacturer,
    size: f.respiratorSize, protocol: f.protocol, passLevel: f.passLevel, overall: f.overallFf && f.overallFf.value,
    result: f.result, operator: f.operator, operatorName: f.operatorName, style: f.respiratorStyle,
    respirator: f.respirator, exercises: (f.exercises || []).length
  };
  const misses = [];
  function eq(k, a, b) {
    if (b instanceof RegExp) { if (!b.test(String(a || ""))) misses.push(k + "=" + JSON.stringify(a)); }
    else if (a !== b) misses.push(k + "=" + JSON.stringify(a));
  }
  eq("idNumber", got.idNumber, exp.idNumber);
  eq("lastName", got.lastName, exp.lastName);
  eq("firstName", got.firstName, exp.firstName);
  eq("company", got.company, exp.company);
  eq("location", got.location, exp.location);
  eq("testDate", got.testDate, exp.testDate);
  eq("testTime", got.testTime, exp.testTime);
  eq("dueDate", got.dueDate, exp.dueDate);
  eq("portaCountSn", got.portaCountSn, exp.portaCountSn);
  eq("n95Companion", got.n95, exp.n95Companion);
  eq("model", got.model, exp.model);
  eq("manufacturer", got.manufacturer, exp.manufacturer);
  eq("size", got.size, exp.size);
  eq("protocol", got.protocol, exp.protocol);
  eq("passLevel", got.passLevel, exp.passLevel);
  eq("overall", got.overall, exp.overall);
  eq("result", got.result, exp.result);
  eq("operator", got.operator, exp.operator);
  eq("operatorName", got.operatorName, exp.operatorName);
  eq("style", got.style, exp.style);
  eq("respirator", got.respirator, exp.respirator);
  eq("exercises", got.exercises, exp.exercises);
  return { misses, got };
}

const fixDir = path.join(dir, "fixtures");
const files = fs.readdirSync(fixDir).filter(f => f.endsWith(".json") && f !== "index.json").sort();
for (const file of files) {
  const j = JSON.parse(fs.readFileSync(path.join(fixDir, file), "utf8"));
  const parsed = F.parseReport(j.text || "", { pages: j.pages, annotations: j.annotations });
  const { misses, got } = evalFix(file, parsed.fields);
  check(file + ": all key fields", misses.length === 0, misses.join("; ") + "  GOT=" + JSON.stringify(got));
}

/* Date normaliser unit cases (the printed-photo merge John saw). */
const merged = F.parseTsiDate("2412NOV2026");
check("merged token 2412NOV2026 becomes 24/11/2026", merged.display === "24/11/2026" && merged.iso === "2026-11-24" && merged.flag !== "unparsed", JSON.stringify(merged));
const compact = F.parseTsiDate("25NOV2027");
check("compact 25NOV2027 becomes 25/11/2027", compact.display === "25/11/2027", JSON.stringify(compact));
const spaced = F.parseTsiDate("25 NOV 2026 10:45");
check("25 NOV 2026 10:45 becomes 25/11/2026 10:45", spaced.display === "25/11/2026" && spaced.time === "10:45", JSON.stringify(spaced));

console.log("\n" + results.filter(r => r.ok).length + " passed, " + results.filter(r => !r.ok).length + " failed");
process.exit(results.every(r => r.ok) ? 0 : 1);
