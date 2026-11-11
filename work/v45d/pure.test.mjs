import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mapItem } from "../../supabase/functions/pull-hyg-events/map.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const field = fs.readFileSync(path.join(root, "field.html"), "utf8");
const gs = fs.readFileSync(path.join(root, "work/drive-worker/Code.gs"), "utf8");

function extract(src, name) {
  const a = src.indexOf("// === drive-match:start ===");
  const b = src.indexOf("// === drive-match:end ===");
  if (a < 0 || b < 0) throw new Error("markers missing in " + name);
  return src.slice(a, b).replace("// === drive-match:start ===", "").trim();
}

function norm(s) { return s.split("\n").map(l => l.trim()).filter(Boolean).join("\n"); }
const fromHtml = norm(extract(field, "field.html"));
const fromGs = norm(extract(gs, "Code.gs"));
if (fromHtml !== fromGs) {
  console.error("drive-match block differs between field.html and Code.gs");
  process.exit(1);
}
const api = new Function(fromHtml + "\nreturn { envssIsSideFolder_, envssIsProjectRoot_, envssMatchJobFolders_, envssUniqueDriveName_, envssPhotoFileName_, envssVersionedName_ };")();

const folders = [
  { id: "TEST_FOLDER_ID_0019333", name: "0019333 HYG-ACA Example Primary School" },
  { id: "18vWLmc4YG8u7_oYngUaDtv6ppxpGiLb4", name: "0019032 Applied Safety & Risk Management" },
  { id: "admin", name: "0019032_Admin" },
  { id: "lab", name: "0019032_Lab" },
  { id: "longer", name: "00193330 other job" },
  { id: "exact", name: "0019333" }
];
function assert(cond, msg) { if (!cond) { console.error("FAIL", msg); process.exit(1); } }

const a = api.envssMatchJobFolders_("0019333", folders);
assert(a.ok && a.folder.id === "TEST_FOLDER_ID_0019333", "0019333 match");
const b = api.envssMatchJobFolders_("0019032", folders);
assert(b.ok && b.folder.id === "18vWLmc4YG8u7_oYngUaDtv6ppxpGiLb4", "0019032 match, admin/lab excluded, Laboratory kept");
const none = api.envssMatchJobFolders_("0099999", folders);
assert(!none.ok && none.message === "job folder not found", "missing folder");
const many = api.envssMatchJobFolders_("0019333", folders.concat([{ id: "other", name: "0019333-second" }]));
assert(!many.ok && many.message === "job folder not unique", "two roots");
assert(api.envssIsSideFolder_("0019032_Admin", "0019032"), "admin side");
assert(api.envssIsSideFolder_("0019032_Lab", "0019032"), "lab side");
assert(!api.envssIsSideFolder_("0019032_Laboratory", "0019032"), "Laboratory is not the Lab side folder");
const labWord = api.envssMatchJobFolders_("0019032", folders.concat([{ id: "labword", name: "0019032_Laboratory" }]));
assert(!labWord.ok && labWord.message === "job folder not unique", "Laboratory plus the project root is two candidates");
assert(!api.envssIsProjectRoot_("00193330 something", "0019333"), "extra digit");
assert(api.envssPhotoFileName_("0019333-001", false, 3, "filter", 1) === "0019333-001_S03_filter_1.jpg", "photo name");
assert(api.envssPhotoFileName_("0019333-001", true, 12, "log", 2) === "0019333-001_N12_log_2.jpg", "noise log name");
assert(api.envssVersionedName_("0019333-001_Laboratory_COC.xlsx", []) === "0019333-001_Laboratory_COC.xlsx", "first coc name");
assert(api.envssVersionedName_("0019333-001_Laboratory_COC.xlsx", ["0019333-001_Laboratory_COC.xlsx"]) === "0019333-001_Laboratory_COC_2.xlsx", "second coc name");
assert(api.envssUniqueDriveName_(["a.xlsx", "a_2.xlsx"], "a.xlsx") === "a_3.xlsx", "bump past _2");

const fix = JSON.parse(fs.readFileSync(path.join(root, "work/v45d/fixtures/hyg-0019333.json"), "utf8"));
const planned = mapItem(fix.rawPlanned);
assert(planned.jobNumber === "0019333", "job");
assert(planned.fieldCode === "0019333-001", "event code");
assert(planned.planned === true, "planned");
assert(planned.startDate === "2026-11-07", "start");
assert(planned.turnaround === "3_day", "turnaround");
assert(planned.lab === "MPL Laboratories", "lab");
assert(planned.siteContact === "School office 08 0000 0000", "site");
assert(planned.poc.email === "alex@client.example", "poc");
assert(planned.task.indexOf("Lead dust") >= 0 && planned.task.indexOf("<p>") < 0, "task text");
assert(planned.driveLink.indexOf("TEST_FOLDER_ID_0019333") >= 0, "drive link stored, not used to pick a folder");
assert(planned.projectItemId === "3384715481", "project item");

const long = mapItem(fix.decodedLongReference);
assert(long.jobNumber === "0019333" && long.fieldCode === "" && long.planned === true, "long reference stays a reference");
assert(long.driveLink.indexOf("http") === 0, "bom stripped");
assert(long.poc.phone === "08 0000 0000", "decoded phone");

const closed = mapItem(fix.decodedClosed);
assert(closed.planned === false, "closed not planned");

assert(!field.includes("api.podio.com"), "field app does not call Podio");
assert(field.includes('APP_VERSION = "45d"'), "version");
assert(fs.readFileSync(path.join(root, "sw-field.js"), "utf8").includes('const CACHE = "envss-field-v45d"'), "cache");
assert(field.includes("10 Bermondsey Street, West Leederville WA 6007"), "hire address");
assert(field.includes("Most used"), "air-met group");
assert(field.includes("Not in Podio yet - office to create/link"), "unplanned flag");
assert(field.includes("voided needs clean and return"), "rejected coc text kept");
assert(field.includes('MAXPX = 2000, Q = 0.8'), "compression");

console.log("pure tests ok");
