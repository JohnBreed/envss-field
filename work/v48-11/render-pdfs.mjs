/* Preview renderer (Node, same realm as pdf-lib). The live app uses buildReportPdf in fit-test.js. */
import fs from "fs";
import path from "path";
import vm from "vm";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
const require = createRequire(import.meta.url);
const { PDFDocument, StandardFonts, rgb, PageSizes } = require("/tmp/pdflib/node_modules/pdf-lib");
const dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || "/workspace/fit-shots/v4811";
fs.mkdirSync(OUT, { recursive: true });

const code = fs.readFileSync(path.join(dir, "../../fit-test.js"), "utf8");
const ctx = { window: {}, console, document: undefined };
vm.createContext(ctx);
vm.runInContext(code + "\nthis.envssFit = window.envssFit;", ctx);
const F = ctx.envssFit;
const text = fs.readFileSync(path.join(dir, "fixtures/frj2elok0-ocr.txt"), "utf8");
const parsed = F.parseReport(text);
const rep = parsed.fields;
rep.approval = rep.approval || "";
rep.note = rep.note || "";

function wrapPdfText(font, text, size, maxW) {
  const words = String(text == null ? "" : text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(t, size) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
function fieldText(rep, key) {
  if (key === "testDate") {
    const d = (rep.testDate && rep.testDate.display) || "";
    const t = rep.testTime || (rep.testDate && rep.testDate.time) || "";
    return t ? d + " " + t : d;
  }
  if (key === "dueDate") return (rep.dueDate && rep.dueDate.display) || "";
  if (key === "overallFf") return (rep.overallFf && rep.overallFf.raw) || "";
  if (key === "passLevel") return rep.passLevel == null ? "" : String(rep.passLevel);
  const v = rep[key];
  if (v == null) return "";
  if (typeof v === "object") return v.raw || v.display || "";
  return String(v);
}

async function build(rep, signed) {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PageSizes.A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const grey = rgb(0.15, 0.15, 0.15);
  const W = PageSizes.A4[0], H = PageSizes.A4[1], L = 36, R = W - 36;
  let y = H - 40;
  const textAt = (str, x, yy, size, f, color) => page.drawText(String(str == null ? "" : str), { x, y: yy, size: size || 9, font: f || font, color: color || black });
  const center = (str, yy, size, f) => {
    const s = String(str || ""), sz = size || 14;
    textAt(s, Math.max(L, (W - (f || bold).widthOfTextAtSize(s, sz)) / 2), yy, sz, f || bold);
  };
  const hline = (yy) => page.drawLine({ start: { x: L, y: yy }, end: { x: R, y: yy }, thickness: 0.6, color: black });
  const labelVal = (lab, val, x, yy, colW) => {
    textAt(lab, x, yy, 7, bold, grey);
    const lines = wrapPdfText(font, val, 9, colW - 2);
    lines.forEach((ln, i) => textAt(ln, x, yy - 11 - i * 11, 9, font));
    return yy - 11 - Math.max(1, lines.length) * 11 - 6;
  };

  center("FIT TEST REPORT", y, 16, bold); y -= 18;
  const titleDate = (rep.testDate && rep.testDate.display) || "";
  if (titleDate) center(titleDate, y, 11, font);
  y -= 16; hline(y + 6); y -= 10;

  const idCols = [
    ["ID NUMBER", fieldText(rep, "idNumber")],
    ["LAST NAME", fieldText(rep, "lastName")],
    ["FIRST NAME", fieldText(rep, "firstName")],
    ["COMPANY", fieldText(rep, "company")],
    ["LOCATION", fieldText(rep, "location")]
  ];
  const colW = (R - L) / idCols.length;
  idCols.forEach((c, i) => textAt(c[0], L + i * colW, y, 7, bold, grey));
  y -= 12;
  let idBottom = y;
  idCols.forEach((c, i) => {
    const lines = wrapPdfText(font, c[1], 9, colW - 6);
    lines.forEach((ln, k) => textAt(ln, L + i * colW, y - k * 11, 9, font));
    idBottom = Math.min(idBottom, y - Math.max(1, lines.length) * 11);
  });
  y = idBottom - 10;
  const half = (R - L - 16) / 2;
  const midX = L + half + 16;
  textAt("TEST DATE", L, y, 7, bold, grey);
  textAt("DUE DATE", midX, y, 7, bold, grey);
  y -= 12;
  textAt(fieldText(rep, "testDate"), L, y, 9, font);
  textAt(fieldText(rep, "dueDate"), midX, y, 9, font);
  y -= 18;
  const leftFields = [
    ["RESPIRATOR", fieldText(rep, "respirator")],
    ["MANUFACTURER", fieldText(rep, "manufacturer")],
    ["MODEL", fieldText(rep, "model")],
    ["RESPIRATOR STYLE", fieldText(rep, "respiratorStyle")],
    ["RESPIRATOR SIZE", fieldText(rep, "respiratorSize")]
  ];
  const rightFields = [
    ["PORTACOUNT S/N", fieldText(rep, "portaCountSn")],
    ["N95-COMPANION", fieldText(rep, "n95Companion")],
    ["PROTOCOL", fieldText(rep, "protocol")],
    ["PASS LEVEL", fieldText(rep, "passLevel")],
    ["APPROVAL", fieldText(rep, "approval")],
    ["EFFICIENCY<99%", fieldText(rep, "efficiency")]
  ];
  let yL = y, yR = y;
  leftFields.forEach(c => { yL = labelVal(c[0], c[1], L, yL, half); });
  rightFields.forEach(c => { yR = labelVal(c[0], c[1], midX, yR, half); });
  y = Math.min(yL, yR) - 6; hline(y + 8); y -= 4;
  const xEx = L, xDur = L + 230, xFf = L + 340, xPass = L + 450;
  textAt("EXERCISE", xEx, y, 7, bold, grey);
  textAt("DURATION (sec)", xDur, y, 7, bold, grey);
  textAt("FIT FACTOR", xFf, y, 7, bold, grey);
  textAt("PASS", xPass, y, 7, bold, grey);
  y -= 8; hline(y + 4); y -= 12;
  const exRows = (rep.exercises || []).slice();
  exRows.push({
    exercise: "OVERALL FF",
    duration: "",
    fitFactorRaw: fieldText(rep, "overallFf"),
    pass: (rep.overallPass === true || rep.result === "PASS") ? "yes" : (rep.overallPass === false || rep.result === "FAIL") ? "no" : ""
  });
  exRows.forEach(ex => {
    const nameLines = wrapPdfText(font, ex.exercise || "", 9, xDur - xEx - 8);
    nameLines.forEach((ln, i) => textAt(ln, xEx, y - i * 11, 9, /OVERALL/i.test(ex.exercise || "") ? bold : font));
    textAt(ex.duration || "", xDur, y, 9, font);
    textAt(ex.fitFactorRaw || (ex.fitFactor && ex.fitFactor.raw) || "", xFf, y, 9, font);
    const p = ex.pass === "no" || ex.pass === "fail" ? "No" : ex.pass === "yes" || ex.pass === "pass" ? "Yes" : (ex.passRaw || "");
    textAt(p, xPass, y, 9, font);
    y -= Math.max(14, nameLines.length * 11 + 3);
  });
  y -= 8;
  textAt("FITTEST OPERATOR", L, y, 7, bold, grey);
  textAt("NOTE", midX, y, 7, bold, grey);
  y -= 12;
  textAt(fieldText(rep, "operator"), L, y, 9, font);
  wrapPdfText(font, fieldText(rep, "note"), 9, half).forEach((ln, i) => textAt(ln, midX, y - i * 11, 9, font));
  y -= 16;
  textAt("NAME", L, y, 7, bold, grey);
  y -= 12;
  textAt(fieldText(rep, "operatorName"), L, y, 9, font);
  y -= 22;
  hline(y + 10); y -= 4;
  textAt("ENVSS technician", L, y, 8, bold);
  textAt("Client", midX, y, 8, bold);
  y -= 8;
  const boxH = 52, boxW = half - 4;
  page.drawRectangle({ x: L, y: y - boxH, width: boxW, height: boxH, borderWidth: 0.5, borderColor: grey, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: midX, y: y - boxH, width: boxW, height: boxH, borderWidth: 0.5, borderColor: grey, color: rgb(1, 1, 1) });
  if (signed) {
    /* Placeholder strokes so John can see where signatures sit (the live app embeds the pad PNGs). */
    page.drawLine({ start: { x: L + 12, y: y - 30 }, end: { x: L + boxW - 16, y: y - 18 }, thickness: 1.2, color: black });
    page.drawLine({ start: { x: midX + 12, y: y - 22 }, end: { x: midX + boxW - 20, y: y - 34 }, thickness: 1.2, color: black });
  }
  y -= boxH + 12;
  const signedDisp = signed ? F ? formatAwstLocal("2026-11-25T08:43:00.000Z") : "25/11/2026 16:43 AWST" : "";
  textAt("Name: " + (signed ? fieldText(rep, "operatorName") : ""), L, y, 8, font);
  textAt("Name: ", midX, y, 8, font);
  y -= 12;
  textAt("Date: " + signedDisp, L, y, 8, font);
  textAt("Date: " + signedDisp, midX, y, 8, font);
  const bytes = await doc.save();
  const name = F.fileNameFor(Object.assign({}, rep, { testDate: rep.testDate }));
  return { bytes, name: signed ? name : name.replace(/\.pdf$/i, "_unsigned.pdf") };
}
function formatAwstLocal(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = t => (parts.find(x => x.type === t) || {}).value || "";
  return g("day") + "/" + g("month") + "/" + g("year") + " " + g("hour") + ":" + g("minute") + " AWST";
}

for (const signed of [false, true]) {
  const out = await build(rep, signed);
  const kind = signed ? "signed" : "unsigned";
  const pdfPath = path.join(OUT, kind === "signed" ? out.name : out.name);
  fs.writeFileSync(pdfPath, out.bytes);
  const info = execSync("pdfinfo " + JSON.stringify(pdfPath), { encoding: "utf8" });
  console.log(kind, path.basename(pdfPath), info.split("\n").filter(l => /Pages|Page size/.test(l)).join(" | "));
  execSync("pdftoppm -png -r 160 " + JSON.stringify(pdfPath) + " " + JSON.stringify(path.join(OUT, kind)));
  const txt = execSync("pdftotext -layout " + JSON.stringify(pdfPath) + " -", { encoding: "utf8" });
  fs.writeFileSync(path.join(OUT, kind + ".txt"), txt);
  console.log("---", kind, "---\n" + txt);
}
console.log("files:", fs.readdirSync(OUT).join(", "));
