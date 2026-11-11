import fs from "fs";
const [,, src, dst] = process.argv;
const o = JSON.parse(fs.readFileSync(src, "utf8"));
const s = o.result; const a = s.indexOf("["), b = s.lastIndexOf("]");
const rows = JSON.parse(s.slice(a, b + 1));
fs.writeFileSync(dst, JSON.stringify(rows));
console.log(dst, rows.length);
