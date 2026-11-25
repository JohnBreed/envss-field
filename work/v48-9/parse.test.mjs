/* Parser, numbering and file-name tests for v48.9 fit testing. No network, no production writes. */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "../../fit-test.js"), "utf8");
const root = {};
const ctx = { window: root, globalThis: root, console, document: undefined };
vm.runInNewContext(src, ctx);
const F = root.envssFit;
if (!F) { console.error("envssFit not loaded"); process.exit(1); }

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (!ok && detail ? " — " + String(detail).slice(0, 500) : ""));
}

const US = `FIT TEST REPORT 11/25/2026
ID NUMBER ENVSS1
LAST NAME Breed
FIRST NAME John
COMPANY ENVSS
LOCATION Various
TEST DATE 11/25/2026 10:45
DUE DATE 11/25/2027
PORTACOUNT S/N 8048192704
N95-COMPANION Yes
RESPIRATOR 3M Aura 9322A+ Disposable P2 Flat-fold, 3-panel de
[100] N95
MANUFACTURER 3M
MODEL Aura 9322A+
RESPIRATOR STYLE Disposable P2 Flat-fold, 3-panel design with exhalation
valve
RESPIRATOR SIZE One Size
PROTOCOL OSHA FAST-FILTERING FACE
PASS LEVEL 100
APPROVAL
EFFICIENCY<99% Yes
EXERCISE DURATION FIT FACTOR PASS
BENDING OVER 50s 200+ Yes
TALKING 30 200+ Yes
HEAD SIDE TO SIDE 30 200+ Yes
HEAD UP AND DOWN 30 200+ Yes
OVERALL FF 200+ Yes
FITTEST OPERATOR EA
NAME John Breed`;

const DMY = US.replaceAll("11/25/2026", "25/11/2026").replace("11/25/2027", "25/11/2027");

const us = F.parseReport(US);
const f = us.fields;
check("US fixture: names, company, location, ID", f.lastName === "Breed" && f.firstName === "John" && f.company === "ENVSS" && f.location === "Various" && f.idNumber === "ENVSS1", JSON.stringify({ last: f.lastName, first: f.firstName, co: f.company, loc: f.location, id: f.idNumber }));
check("US fixture: dates flagged as US and stored DD/MM/YYYY", f.testDate.flag === "us" && f.testDate.display === "25/11/2026" && f.testDate.iso === "2026-11-25" && f.testTime === "10:45" && f.dueDate.flag === "us" && f.dueDate.display === "25/11/2027", JSON.stringify({ t: f.testDate, due: f.dueDate, time: f.testTime }));
check("US fixture: a US-date flag is raised for the technician", us.flags.some(x => x.field === "testDate" && /US MM\/DD/.test(x.reason)), JSON.stringify(us.flags));
check("US fixture: wrapped respirator and style are joined", /Aura 9322A\+/.test(f.respirator) && /\[100\] N95/.test(f.respirator) && /exhalation valve/.test(f.respiratorStyle), JSON.stringify({ r: f.respirator, s: f.respiratorStyle }));
check("US fixture: manufacturer, model, size, protocol, pass level, PortaCount, N95", f.manufacturer === "3M" && f.model === "Aura 9322A+" && f.respiratorSize === "One Size" && f.protocol === "OSHA FAST-FILTERING FACE" && f.passLevel === 100 && f.portaCountSn === "8048192704" && /^Yes$/i.test(f.n95Companion), JSON.stringify({ mfr: f.manufacturer, model: f.model, size: f.respiratorSize, proto: f.protocol, pl: f.passLevel, sn: f.portaCountSn, n95: f.n95Companion }));
check("US fixture: four exercises all pass, overall 200+ is PASS", f.exercises.length === 4 && f.exercises.every(e => e.pass === "yes") && f.overallFf.value === 200 && f.overallFf.plus === true && f.result === "PASS" && f.exerciseFails.length === 0, JSON.stringify({ n: f.exercises.length, ex: f.exercises, ov: f.overallFf, r: f.result, fails: f.exerciseFails }));
check("US fixture: operator and name", f.operator === "EA" && f.operatorName === "John Breed", JSON.stringify({ op: f.operator, name: f.operatorName }));

const dmy = F.parseReport(DMY);
check("DD/MM fixture: 25/11/2026 is not flagged as US", dmy.fields.testDate.flag === "" && dmy.fields.testDate.display === "25/11/2026" && dmy.fields.testDate.iso === "2026-11-25" && !dmy.flags.some(x => x.field === "testDate"), JSON.stringify({ t: dmy.fields.testDate, flags: dmy.flags }));

const failEx = US.replace("HEAD UP AND DOWN 30 200+ Yes", "HEAD UP AND DOWN 30 63 No").replace("OVERALL FF 200+ Yes", "OVERALL FF 200+ Yes");
const failed = F.parseReport(failEx);
check("Per-exercise fail is shown even when overall FF still passes", failed.fields.result === "PASS" && failed.fields.exerciseFails.some(n => /HEAD UP AND DOWN/i.test(n)) && failed.flags.some(x => /exercise/.test(x.reason)), JSON.stringify({ r: failed.fields.result, fails: failed.fields.exerciseFails, flags: failed.flags }));

const overallFail = US.replace("OVERALL FF 200+ Yes", "OVERALL FF 50 No");
const of = F.parseReport(overallFail);
check("Overall FF below pass level is FAIL", of.fields.result === "FAIL" && of.fields.overallPass === false, JSON.stringify({ r: of.fields.result, ff: of.fields.overallFf, pl: of.fields.passLevel }));

const rec = Object.assign({}, f, { testDate: f.testDate, lastName: f.lastName, firstName: f.firstName, model: f.model });
check("File name is Surname_First_Model_DD-MM-YYYY.pdf", F.fileNameFor(rec) === "Breed_John_Aura-9322A_25-11-2026.pdf", F.fileNameFor(rec));

const events = [
  { projectId: "p1", type: "hygiene", code: "0019185-001" },
  { projectId: "p1", type: "fit", code: "0019185-FIT-001" },
  { projectId: "p1", type: "fibre", code: "ENVSS-HYG-AFM-0019185-001-20261125" }
];
check("isFitEvent only matches fit events", F.isFitEvent(events[1]) && !F.isFitEvent(events[0]) && !F.isFitEvent(events[2]));
check("next fit seq skips hygiene and AFM numbers", F.nextFitSeq("p1", events, []) === "002", F.nextFitSeq("p1", events, []));
check("fit event code is {job}-FIT-{seq}", F.fitEventCode({ number: "0019185" }, "001") === "0019185-FIT-001");
check("deleted fit numbers are not reused", F.nextFitSeq("p1", events.filter(e => e.type !== "fit"), [{ tombstone: "event", projectId: "p1", type: "fit", code: "0019185-FIT-001" }]) === "002");

const ambiguous = F.parseTsiDate("10/11/2026");
check("Ambiguous 10/11/2026 is treated as DD/MM and flagged", ambiguous.flag === "ambiguous" && ambiguous.display === "10/11/2026" && ambiguous.iso === "2026-11-10", JSON.stringify(ambiguous));

process.exit(results.every(r => r.ok) ? 0 : 1);
