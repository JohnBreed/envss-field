/* ENVSS Field v48.11: Respirator fit testing (TSI-layout Vision OCR, TSI-style PDF, no photo page).
   Event type "fit", codes {job}-FIT-{seq}. Photo + optional Google Vision OCR, confirm,
   two signatures, A4 PDF (form + signatures + original photo), Drive copy into
   {job}_Field-App/Fit Test, zip download. No Podio writes. */
(function (root) {
  "use strict";
  const VERSION = "48.11";
  const PDF_SRC = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
  const ZIP_SRC = "https://cdn.jsdelivr.net/npm/jszip@3.10.2/dist/jszip.min.js";
  const OCR_FN = "ocr-fit-report";
  const LABEL_ROWS = [
    ["ID NUMBER", "idNumber"],
    ["LAST NAME", "lastName"],
    ["FIRST NAME", "firstName"],
    ["COMPANY", "company"],
    ["LOCATION", "location"],
    ["TEST DATE", "testDateRaw"],
    ["DUE DATE", "dueDateRaw"],
    ["PORTACOUNT S/N", "portaCountSn"],
    ["PORTACOUNT SN", "portaCountSn"],
    ["N95-COMPANION", "n95Companion"],
    ["N95 COMPANION", "n95Companion"],
    ["RESPIRATOR STYLE", "respiratorStyle"],
    ["RESPIRATOR SIZE", "respiratorSize"],
    ["SIZE", "respiratorSize"],
    ["MANUFACTURER", "manufacturer"],
    ["MODEL", "model"],
    ["PROTOCOL", "protocol"],
    ["PASS LEVEL", "passLevelRaw"],
    ["APPROVAL", "approval"],
    ["EFFICIENCY<99%", "efficiency"],
    ["EFFICIENCY <99%", "efficiency"],
    ["OVERALL FF", "overallFfRaw"],
    ["FITTEST OPERATOR", "operator"],
    ["FIT TEST OPERATOR", "operator"],
    ["NAME", "operatorName"],
    ["RESPIRATOR", "respirator"],
    ["NOTE", "note"]
  ];

  function pad(n) { return String(n).padStart(2, "0"); }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function esc(s) { return typeof root.esc === "function" ? root.esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function isFitEvent(ev) {
    return !!(ev && (ev.type === "fit" || /-FIT-\d+/i.test(String(ev.code || ""))));
  }
  function fitSeqOf(code) {
    const m = String(code || "").match(/-FIT-(\d+)/i);
    return m ? m[1] : "";
  }
  function nextFitSeq(projectId, events, deletions) {
    const evs = events || (typeof db !== "undefined" && db && db.events) || [];
    const dels = deletions || (typeof db !== "undefined" && db && db.deletions) || [];
    const codes = evs.filter(e => e.projectId === projectId && isFitEvent(e)).map(e => e.code)
      .concat(dels.filter(d => d && d.tombstone === "event" && d.projectId === projectId && (d.type === "fit" || /-FIT-\d+/i.test(String(d.code || "")))).map(d => d.code));
    const max = codes.map(c => parseInt(fitSeqOf(c), 10) || 0).reduce((a, b) => Math.max(a, b), 0);
    return String(max + 1).padStart(3, "0");
  }
  function fitEventCode(project, seq) {
    const num = (project && project.number) || "";
    return num + "-FIT-" + seq;
  }

  function safeToken(s, fallback) {
    const t = trim(s).replace(/[^\w]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return t || fallback || "Unknown";
  }
  function fileNameFor(rep) {
    const d = (rep && rep.testDate) || parseTsiDate(rep && rep.testDateRaw);
    const datePart = (d && d.displayDashed) || "undated";
    const sur = safeToken(rep && (rep.lastName || (rep.person && rep.person.last)), "Surname");
    const first = safeToken(rep && (rep.firstName || (rep.person && rep.person.first)), "First");
    const model = safeToken(rep && (rep.model || rep.respirator), "Respirator");
    return sur + "_" + first + "_" + model + "_" + datePart + ".pdf";
  }

  function monthNum(s) {
    const m = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 };
    return m[String(s || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)] || m[String(s || "").toUpperCase().slice(0, 3)] || 0;
  }
  function expandMergedDate(raw) {
    /* "2412NOV2026", "25NOV2026", "25 NOV2026", "25 NOV 2026 10:45" */
    const t = String(raw || "").toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
    if (!t) return "";
    const compact = t.replace(/\s+/g, "");
    const m = compact.match(/^(\d{1,2})(\d{2})?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*(\d{4}|\d{2})(?:[ T]?(\d{1,2})[:.]?(\d{2})?)?$/);
    if (m) {
      const day = +m[1], mon = monthNum(m[3]), y = +(m[4].length === 2 ? 2000 + +m[4] : m[4]);
      if (day && mon && y) {
        let out = pad(day) + "/" + pad(mon) + "/" + y;
        if (m[5] != null) out += " " + pad(m[5]) + ":" + pad(m[6]);
        return out;
      }
    }
    const spaced = t.match(/\b(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*\s+(\d{4}|\d{2})(?:\s+(\d{1,2})[:.](\d{2}))?\b/);
    if (spaced) {
      const day = +spaced[1], mon = monthNum(spaced[2]), y = +(spaced[3].length === 2 ? 2000 + +spaced[3] : spaced[3]);
      if (day && mon && y) {
        let out = pad(day) + "/" + pad(mon) + "/" + y;
        if (spaced[4] != null) out += " " + pad(spaced[4]) + ":" + spaced[5];
        return out;
      }
    }
    return "";
  }
  function parseTsiDate(raw) {
    const out = { raw: trim(raw), iso: "", display: "", displayDashed: "", time: "", flag: "", year: 0, month: 0, day: 0 };
    if (!out.raw) { out.flag = "missing"; return out; }
    const expanded = expandMergedDate(out.raw);
    const src = expanded || out.raw;
    const m = String(src).match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m) { out.flag = "unparsed"; return out; }
    let a = +m[1], b = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    let day, month, flag = "";
    if (a > 12 && b >= 1 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a >= 1 && a <= 12) { day = b; month = a; } /* US order, resolved silently */
    else if (a >= 1 && a <= 12 && b >= 1 && b <= 12) {
      day = a; month = b;
      if (a !== b) flag = "ambiguous";
    }
    else { out.flag = "unparsed"; return out; }
    out.year = y; out.month = month; out.day = day; out.flag = flag;
    out.iso = y + "-" + pad(month) + "-" + pad(day);
    out.display = pad(day) + "/" + pad(month) + "/" + y;
    out.displayDashed = pad(day) + "-" + pad(month) + "-" + y;
    if (m[4] != null) out.time = pad(m[4]) + ":" + m[5];
    else {
      const tm = String(out.raw).match(/\b(\d{1,2})[:.](\d{2})\b/);
      if (tm) out.time = pad(tm[1]) + ":" + tm[2];
    }
    return out;
  }

  function parseFf(s) {
    const raw = trim(s);
    if (!raw) return { raw: "", value: null, plus: false };
    const plus = /\+$/.test(raw);
    const n = parseFloat(raw.replace(/,/g, "").replace(/\+$/, ""));
    return { raw, value: Number.isFinite(n) ? n : null, plus };
  }
  function ffMeets(ff, level) {
    if (!ff || ff.value == null || level == null || !Number.isFinite(level)) return null;
    return ff.value >= level;
  }
  function parseYesNo(s) {
    const t = trim(s).toLowerCase();
    if (/^(yes|y|pass|true)$/.test(t)) return "yes";
    if (/^(no|n|fail|false)$/.test(t)) return "no";
    return "";
  }
  function labelKey(line) {
    const u = normTok(line).replace(/:$/, "");
    let best = null, bestLen = 0;
    LABEL_ROWS.forEach(function (pair) {
      const lab = pair[0];
      if (u === lab || u.indexOf(lab + " ") === 0 || u.indexOf(lab + ":") === 0) {
        if (lab.length > bestLen) { best = pair; bestLen = lab.length; }
      }
    });
    return best;
  }
  function valueAfter(line, lab) {
    const re = new RegExp("^" + lab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:#]?", "i");
    return trim(line.replace(re, ""));
  }

  function parseExercises(lines, startAt) {
    const rows = [];
    let i = startAt;
    for (; i < lines.length; i++) {
      const u = lines[i].toUpperCase().replace(/\s+/g, " ");
      if (/^OVERALL\s*FF/.test(u) || /^FITTEST\s*OPERATOR/.test(u) || /^FIT TEST OPERATOR/.test(u)) break;
      if (/^EXERCISE\b/.test(u) && /FIT FACTOR/.test(u)) continue;
      const m = lines[i].match(/^(.+?)\s+(\d+\s*s?)\s+(\d[\d.+]*)\s+(Yes|No|PASS|FAIL|Y|N)\s*$/i);
      if (m) {
        rows.push({ exercise: trim(m[1]), duration: trim(m[2]), fitFactorRaw: trim(m[3]), passRaw: trim(m[4]), fitFactor: parseFf(m[3]), pass: parseYesNo(m[4]) });
        continue;
      }
      const m2 = lines[i].match(/^(.+?)\s+(\d[\d.+]*)\s+(Yes|No|PASS|FAIL|Y|N)\s*$/i);
      if (m2 && !labelKey(lines[i])) {
        rows.push({ exercise: trim(m2[1]), duration: "", fitFactorRaw: trim(m2[2]), passRaw: trim(m2[3]), fitFactor: parseFf(m2[2]), pass: parseYesNo(m2[3]) });
      }
    }
    return { rows, next: i };
  }

  function normTok(s) {
    return String(s || "").toUpperCase().replace(/[™®©]/g, "").replace(/[_.,]/g, "").replace(/\s+/g, " ").trim();
  }
  function boxOf(bb, pw, ph) {
    const verts = (bb && (bb.vertices || bb.normalizedVertices)) || [];
    const norm = !!(bb && bb.normalizedVertices && !bb.vertices);
    const pts = verts.map(function (v) {
      const x = v && v.x != null ? v.x : 0, y = v && v.y != null ? v.y : 0;
      return { x: norm ? x * pw : x, y: norm ? y * ph : y };
    });
    if (!pts.length) return null;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
  }
  function withCenter(b) {
    if (!b) return null;
    b.w = b.x1 - b.x0; b.h = b.y1 - b.y0;
    b.xc = (b.x0 + b.x1) / 2; b.yc = (b.y0 + b.y1) / 2;
    return b;
  }
  function unionBox(a, b) {
    return withCenter({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) });
  }
  function yOverlap(a, b) {
    const top = Math.max(a.y0, b.y0), bot = Math.min(a.y1, b.y1);
    return Math.max(0, bot - top);
  }
  function sameRow(a, b) {
    const ov = yOverlap(a, b);
    const lim = Math.max(8, 0.35 * Math.min(a.h || (a.y1 - a.y0), b.h || (b.y1 - b.y0), 40));
    if (ov >= lim) return true;
    return Math.abs(a.yc - b.yc) <= Math.max(a.h, b.h, 14) * 0.7;
  }

  function wordsFromPages(pages) {
    const words = [];
    (pages || []).forEach(function (page) {
      const pw = page.width || 1, ph = page.height || 1;
      (page.blocks || []).forEach(function (block) {
        (block.paragraphs || []).forEach(function (para) {
          (para.words || []).forEach(function (word) {
            const text = (word.symbols || []).map(s => s.text || "").join("");
            const b = withCenter(boxOf(word.boundingBox, pw, ph));
            if (text && b) words.push({ text: text, n: normTok(text), used: false, pageW: pw, pageH: ph, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, xc: b.xc, yc: b.yc, w: b.w, h: b.h });
          });
        });
      });
    });
    return words;
  }
  function wordsFromAnnotations(annotations) {
    const words = [];
    (annotations || []).forEach(function (a, i) {
      if (i === 0) return; /* first item is the full text */
      const text = a.description || a.text || "";
      const b = withCenter(boxOf(a.boundingPoly || a.boundingBox, 1, 1));
      if (text && b && !/\n/.test(text)) words.push({ text: text, n: normTok(text), used: false, pageW: 0, pageH: 0, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, xc: b.xc, yc: b.yc, w: b.w, h: b.h });
    });
    return words;
  }
  function wordsFromVision(extras) {
    extras = extras || {};
    let words = wordsFromPages(extras.pages);
    if (!words.length) words = wordsFromAnnotations(extras.annotations);
    words.sort(function (a, b) { return a.yc - b.yc || a.x0 - b.x0; });
    return words;
  }

  function labelTokens(lab) {
    const u = normTok(lab).replace(/<99%/g, " <99%").replace(/N95-COMPANION/g, "N95 COMPANION").replace(/S\/N/g, "S/N");
    const parts = u.split(" ").filter(Boolean);
    const out = [];
    parts.forEach(function (p) {
      if (p === "S/N" || p === "SN") out.push(["S/N", "SN", "S"]);
      else if (p === "N95") out.push(["N95-COMPANION", "N95COMPANION", "N95"]);
      else if (p === "COMPANION") out.push(["COMPANION", "-COMPANION"]);
      else if (p.indexOf("EFFICIENCY") === 0) out.push(["EFFICIENCY<99%", "EFFICIENCY"]);
      else out.push([p]);
    });
    return out;
  }
  function tokMatch(wordN, options) {
    return options.some(function (opt) {
      if (wordN === opt) return true;
      if (opt === "S" && (wordN === "S" || wordN === "S/" || wordN === "S/N")) return true;
      if (opt === "N95" && (wordN === "N95" || wordN.indexOf("N95-") === 0)) return true;
      if (opt === "EFFICIENCY" && wordN.indexOf("EFFICIENCY") === 0) return true;
      return false;
    });
  }
  function findLabelHits(words) {
    const specs = LABEL_ROWS.map(function (pair, idx) { return { lab: pair[0], field: pair[1], toks: labelTokens(pair[0]), idx: idx, len: pair[0].length }; });
    specs.sort(function (a, b) { return b.len - a.len; });
    const hits = [];
    const taken = new Set();
    function closeOnRow(a, b) {
      if (!sameRow(a, b)) return false;
      const gap = b.x0 - a.x1;
      return gap >= -4 && gap < Math.max(28, a.h * 2.2);
    }
    specs.forEach(function (spec) {
      for (let i = 0; i < words.length; i++) {
        if (taken.has(i) || !tokMatch(words[i].n, spec.toks[0])) continue;
        const idxs = [i];
        let ok = true;
        let last = words[i];
        for (let t = 1; t < spec.toks.length; t++) {
          let found = -1;
          for (let j = 0; j < words.length; j++) {
            if (taken.has(j) || idxs.indexOf(j) >= 0) continue;
            if (tokMatch(words[j].n, spec.toks[t]) && closeOnRow(last, words[j])) { found = j; break; }
          }
          /* S/N may arrive as S / N */
          if (found < 0 && spec.toks[t][0] === "S/N") {
            for (let j = 0; j < words.length; j++) {
              if (taken.has(j)) continue;
              if ((words[j].n === "N" || words[j].n === "/N") && closeOnRow(last, words[j])) { found = j; break; }
            }
          }
          if (found < 0) { ok = false; break; }
          idxs.push(found); last = words[found];
        }
        if (!ok) continue;
        /* "NAME" must not be the NAME in FIRST/LAST NAME */
        if (spec.lab === "NAME") {
          const box0 = words[idxs[0]];
          const stolen = words.some(function (w, wi) {
            return !idxs.includes(wi) && (w.n === "FIRST" || w.n === "LAST") && sameRow(w, box0) && box0.x0 - w.x1 < 40;
          });
          if (stolen) continue;
        }
        if (spec.lab === "SIZE") {
          const box0 = words[idxs[0]];
          const stolen = words.some(function (w, wi) {
            return !idxs.includes(wi) && (w.n === "ONE" || w.n === "RESPIRATOR") && sameRow(w, box0) && Math.abs(w.x0 - box0.x0) < 200;
          });
          if (stolen) continue;
        }
        let box = { x0: words[idxs[0]].x0, x1: words[idxs[0]].x1, y0: words[idxs[0]].y0, y1: words[idxs[0]].y1 };
        idxs.forEach(function (k) { box = unionBox(box, words[k]); });
        idxs.forEach(function (k) { taken.add(k); words[k].used = true; });
        /* Swallow leftover hyphen / S/N fragments on the same row (Vision often splits N95-COMPANION and S/N). */
        words.forEach(function (w, wi) {
          if (taken.has(wi) || !sameRow(w, box)) return;
          if (w.x0 < box.x1 - 2 || w.x0 - box.x1 > 22) return;
          const trail = /^(COMPANION|-COMPANION|\/N|\/|N|S\/N|SN|<99%|99%)$/;
          if (trail.test(w.n) || (spec.field === "n95Companion" && /COMPANION/.test(w.n)) || (spec.field === "portaCountSn" && /^(S\/N|SN|\/N|\/|N)$/.test(w.n)) || (spec.field === "efficiency" && /99/.test(w.n))) {
            taken.add(wi); w.used = true; idxs.push(wi); box = unionBox(box, w);
          }
        });
        hits.push({ field: spec.field, lab: spec.lab, box: box, idxs: idxs, xc: box.xc, yc: box.yc });
        break;
      }
    });
    return hits;
  }

  function joinWords(ws) {
    if (!ws.length) return "";
    const rows = [];
    ws.slice().sort(function (a, b) { return a.yc - b.yc || a.x0 - b.x0; }).forEach(function (w) {
      const last = rows[rows.length - 1];
      if (!last || !sameRow(last[0], w)) rows.push([w]);
      else last.push(w);
    });
    return rows.map(function (row) {
      row.sort(function (a, b) { return a.x0 - b.x0; });
      let out = "";
      row.forEach(function (w, i) {
        const prev = row[i - 1];
        const glued = prev && (w.x0 - prev.x1 < 2);
        out += (i && !glued ? " " : "") + w.text;
      });
      return out;
    }).join(" ").replace(/\s+/g, " ").trim();
  }
  function isSectionHeader(w) {
    const n = w.n;
    return n === "EXERCISE" || n === "DURATION" || n === "OVERALL" || n === "FITTEST" || n === "PROTOCOL" || n === "APPROVAL" || n === "EFFICIENCY" || n.indexOf("EFFICIENCY") === 0;
  }

  function isValidFfToken(s) {
    return /^\d+\+?$/.test(trim(s));
  }
  function isClockToken(s) {
    const t = trim(s).toUpperCase().replace(/\s+/g, "");
    return /^\d{1,2}:\d{2}(AM|PM)$/.test(t) || t === "AM" || t === "PM";
  }
  function isTaskbarToken(s) {
    const n = normTok(s);
    if (n === "SEARCH" || n === "ENG" || n === "CORTANA" || n === "TASKVIEW") return true;
    if (isClockToken(s)) return true;
    return false;
  }
  function clipWordsToReport(words) {
    if (!words.length) return words;
    const pageH = (words[0].pageH) || Math.max.apply(null, words.map(w => w.y1));
    const pageW = (words[0].pageW) || Math.max.apply(null, words.map(w => w.x1));
    const title = words.filter(function (w) { return w.n === "FIT" || w.n === "TEST" || w.n === "REPORT"; });
    let top = 0;
    if (title.length) top = Math.min.apply(null, title.map(w => w.y0)) - 30;
    const foot = words.filter(function (w) {
      return w.n === "NAME" || w.n === "FITTEST" || w.n === "OPERATOR" || (w.n === "DATE" && w.yc > pageH * 0.4);
    });
    let bottom = pageH;
    if (foot.length) {
      const fy = Math.max.apply(null, foot.map(w => w.y1));
      bottom = Math.max(fy + 80, pageH * 0.55);
    }
    /* Taskbar lives at the bottom of a laptop screenshot. */
    const barY = pageH * 0.9;
    return words.filter(function (w) {
      if (w.yc < top - 8) return false;
      if (isTaskbarToken(w.text) || isTaskbarToken(w.n)) return false;
      /* "US" keyboard tile next to ENG / the clock, near the bottom */
      if (w.n === "US" && w.yc > barY) return false;
      if (w.yc > bottom && w.yc > barY) return false;
      if (w.yc > barY && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(w.text)) return false;
      return true;
    });
  }
  function clusterLabelRows(hits) {
    const sorted = hits.slice().sort(function (a, b) { return a.box.yc - b.box.yc || a.box.x0 - b.box.x0; });
    const rows = [];
    sorted.forEach(function (h) {
      const row = rows.find(function (r) { return sameRow(r[0].box, h.box); });
      if (row) row.push(h);
      else rows.push([h]);
    });
    rows.forEach(function (r) { r.sort(function (a, b) { return a.box.x0 - b.box.x0; }); });
    return rows;
  }
  function columnSpanFor(hit, row, pageW) {
    const i = row.indexOf(hit);
    const prev = i > 0 ? row[i - 1] : null;
    const next = row[i + 1] || null;
    const left = prev ? (prev.box.x1 + hit.box.x0) / 2 : Math.max(-10, hit.box.x0 - 30);
    const right = next ? (hit.box.x1 + next.box.x0) / 2 : pageW + 20;
    return { left: left, right: right };
  }
  function nextRowY(hit, rows) {
    const yi = rows.findIndex(function (r) { return r.indexOf(hit) >= 0; });
    if (yi < 0 || yi === rows.length - 1) return 1e9;
    return Math.min.apply(null, rows[yi + 1].map(function (h) { return h.box.y0; }));
  }
  function valueWordsForSpan(hit, row, rows, words, pageW, limitY) {
    const span = columnSpanFor(hit, row, pageW);
    const unused = words.filter(function (w) { return !w.used; });
    unused.forEach(function (w) {
      if (isSectionHeader(w) && w.y0 > hit.box.y1 && w.xc >= span.left && w.x0 < span.right) limitY = Math.min(limitY, w.y0);
    });
    const same = unused.filter(function (w) {
      return w.x0 >= hit.box.x1 - 4 && w.x0 < span.right && w.x1 > hit.box.x1 && sameRow(w, hit.box) && !isSectionHeader(w) && !isTaskbarToken(w.text);
    });
    let chosen = same.slice();
    const lineH = Math.max(14, hit.box.h * 1.8);
    if (!chosen.length) {
      const cap = Math.min(limitY, hit.box.y1 + lineH * 8);
      chosen = unused.filter(function (w) {
        return w.yc > hit.box.y1 - 2 && w.y0 < cap - 2 && w.xc >= span.left && w.xc < span.right && !isSectionHeader(w) && !isTaskbarToken(w.text);
      });
    } else {
      const maxY = chosen.reduce(function (m, w) { return Math.max(m, w.y1); }, hit.box.y1);
      unused.forEach(function (w) {
        if (chosen.indexOf(w) >= 0 || isSectionHeader(w) || isTaskbarToken(w.text)) return;
        if (w.y0 >= maxY - 2 && w.y0 < limitY - 2 && w.xc >= span.left && w.xc < span.right) {
          if (w.y0 - maxY < Math.max(36, lineH * 2.4)) chosen.push(w);
        }
      });
    }
    const nextInCol = (function () {
      const yi = rows.findIndex(function (r) { return r.indexOf(hit) >= 0; });
      for (let r = yi + 1; r < rows.length; r++) {
        const h = rows[r].find(function (x) {
          const s = columnSpanFor(x, rows[r], pageW);
          return x.box.xc >= span.left && x.box.xc < span.right;
        });
        if (h) return h;
      }
      return null;
    })();
    chosen = chosen.filter(function (w) {
      if (nextInCol && (sameRow(w, nextInCol.box) || w.yc >= nextInCol.box.y0 - 2)) return false;
      return !row.some(function (h) {
        if (h === hit) return false;
        return w.x0 < h.box.x1 && w.x1 > h.box.x0 && w.y0 < h.box.y1 && w.y1 > h.box.y0;
      });
    });
    return chosen;
  }
  function parseExercisesFromWords(words, hits) {
    const headers = {};
    words.forEach(function (w) {
      const n = w.n;
      if (n === "EXERCISE" && !headers.exercise) headers.exercise = w;
      else if (n === "DURATION" && !headers.duration) headers.duration = w;
      else if ((n === "FIT" || n === "FACTOR") && !headers.factor) {
        const other = words.find(function (x) { return (n === "FIT" ? x.n === "FACTOR" : x.n === "FIT") && sameRow(x, w) && Math.abs(x.x0 - w.x0) < 90; });
        if (other) headers.factor = n === "FIT" ? w : other;
      } else if (n === "PASS" && !headers.pass) {
        if ((headers.factor && sameRow(w, headers.factor) && w.x0 > headers.factor.x0) ||
            (headers.duration && sameRow(w, headers.duration) && w.x0 > headers.duration.x0)) headers.pass = w;
      }
    });
    if (!headers.exercise) return { rows: [], overall: null };
    const top = headers.exercise.y1;
    const op = words.find(function (w) { return w.n === "FITTEST" || w.n === "OPERATOR"; });
    const bottom = op ? op.y0 : 1e9;
    const xEx = headers.exercise.x0 - 16;
    const xDur = headers.duration ? headers.duration.x0 - 16 : xEx + 120;
    const xFf = headers.factor ? headers.factor.x0 - 16 : xDur + 80;
    const xPass = headers.pass ? headers.pass.x0 - 16 : xFf + 80;
    const body = words.filter(function (w) { return w.yc > top + 1 && w.y0 < bottom - 1 && !isTaskbarToken(w.text); });
    const ys = body.slice().sort(function (a, b) { return a.yc - b.yc; });
    const rows = [];
    ys.forEach(function (w) {
      const last = rows[rows.length - 1];
      if (!last || w.yc - last[0].yc > Math.max(14, (w.h || 12) * 0.9)) rows.push([w]);
      else last.push(w);
    });
    function col(texts, from, to) {
      return joinWords(texts.filter(function (w) { return w.xc >= from && w.xc < to; }));
    }
    const raw = [];
    rows.forEach(function (row) {
      const texts = row.slice().sort(function (a, b) { return a.x0 - b.x0; });
      const name = col(texts, -10, xDur);
      const dur = col(texts, xDur, xFf);
      const ff = col(texts, xFf, xPass);
      const p = col(texts, xPass, 1e9);
      raw.push({ exercise: name, duration: dur, fitFactorRaw: ff, passRaw: p, words: texts });
    });
    /* Merge a tilted split ("HEAD UP" / "AND DOWN") into one row. */
    const merged = [];
    raw.forEach(function (r) {
      const prev = merged[merged.length - 1];
      const name = trim(r.exercise);
      const ffOk = isValidFfToken(r.fitFactorRaw);
      const passOk = !!parseYesNo(r.passRaw);
      if (prev && name && !ffOk && !passOk && !isValidFfToken(prev.fitFactorRaw)) {
        prev.exercise = trim(prev.exercise + " " + name);
        if (r.duration) prev.duration = trim((prev.duration || "") + " " + r.duration);
        return;
      }
      if (prev && name && !/^OVERALL/i.test(name) && !ffOk && !passOk && (isValidFfToken(prev.fitFactorRaw) || parseYesNo(prev.passRaw)) && !trim(r.duration)) {
        /* orphan name fragment under a complete row: only merge if it continues the name */
        if (/^(AND|DOWN|SIDE|TO|OVER|UP)$/i.test(name) || /^(AND|UP|DOWN|SIDE)/i.test(name)) {
          prev.exercise = trim(prev.exercise + " " + name);
          return;
        }
      }
      merged.push(r);
    });
    const out = [];
    let overall = null;
    merged.forEach(function (r) {
      const name = trim(r.exercise).replace(/\s+/g, " ");
      if (!name || /^EXERCISE$/i.test(name)) return;
      /* Keep only a duration that looks like seconds, a validated FF, and Yes/No. */
      let dur = trim(r.duration);
      const durM = dur.match(/\b(\d{1,3})\s*s?\b/i);
      dur = durM ? durM[1] : "";
      let ffRaw = trim(r.fitFactorRaw);
      if (!isValidFfToken(ffRaw)) {
        const m = ffRaw.match(/\b(\d+\+)\b/) || ffRaw.match(/\b(\d{2,4})\b/);
        ffRaw = m && isValidFfToken(m[1]) ? m[1] : "";
      }
      const pass = parseYesNo(r.passRaw);
      if (/^OVERALL\s*FF?$/i.test(name)) {
        overall = { fitFactorRaw: ffRaw, passRaw: pass ? (pass === "yes" ? "Yes" : "No") : "", fitFactor: parseFf(ffRaw), pass: pass };
        return;
      }
      if (!ffRaw && !pass && !dur) return;
      if (ffRaw && !isValidFfToken(ffRaw)) return;
      out.push({ exercise: name, duration: dur, fitFactorRaw: ffRaw, passRaw: r.passRaw, fitFactor: parseFf(ffRaw), pass: pass });
    });
    return { rows: out, overall: overall };
  }

  function estimateAngle(words) {
    const angs = [];
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const a = words[i], b = words[j];
        const dx = b.xc - a.xc, dy = b.yc - a.yc;
        if (Math.abs(dx) > 80 && Math.abs(dy) < 22) angs.push(Math.atan2(dy, dx));
      }
    }
    if (angs.length < 6) return 0;
    angs.sort(function (a, b) { return a - b; });
    return angs[Math.floor(angs.length / 2)];
  }
  function applyDeskew(words, angle) {
    if (!angle || Math.abs(angle) < (0.4 * Math.PI / 180)) return words;
    const c = Math.cos(-angle), s = Math.sin(-angle);
    const cx = words.reduce((m, w) => m + w.xc, 0) / words.length;
    const cy = words.reduce((m, w) => m + w.yc, 0) / words.length;
    function rot(x, y) { return { x: c * (x - cx) - s * (y - cy) + cx, y: s * (x - cx) + c * (y - cy) + cy }; }
    words.forEach(function (w) {
      const a = rot(w.x0, w.y0), b = rot(w.x1, w.y0), d = rot(w.x0, w.y1), e = rot(w.x1, w.y1);
      const xs = [a.x, b.x, d.x, e.x], ys = [a.y, b.y, d.y, e.y];
      w.x0 = Math.min.apply(null, xs); w.x1 = Math.max.apply(null, xs);
      w.y0 = Math.min.apply(null, ys); w.y1 = Math.max.apply(null, ys);
      w.xc = (w.x0 + w.x1) / 2; w.yc = (w.y0 + w.y1) / 2; w.w = w.x1 - w.x0; w.h = w.y1 - w.y0;
    });
    words.sort(function (a, b) { return a.yc - b.yc || a.x0 - b.x0; });
    return words;
  }
  function parseReportFromBoxes(words, extras) {
    const fields = {};
    const ang = estimateAngle(words), deg = ang * 180 / Math.PI;
    if (deg && Math.abs(deg) >= 0.8 && Math.abs(deg) <= 12) applyDeskew(words, ang);
    const clipped = clipWordsToReport(words);
    const hits = findLabelHits(clipped);
    const pageW = (clipped[0] && clipped[0].pageW) || Math.max.apply(null, clipped.map(function (w) { return w.x1; }).concat([1]));
    const rows = clusterLabelRows(hits.filter(function (h) { return h.field !== "overallFfRaw"; }));
    const ex = parseExercisesFromWords(clipped, hits);
    if (ex.rows.length) fields.exercises = ex.rows;
    if (ex.overall && ex.overall.fitFactorRaw) fields.overallFfRaw = ex.overall.fitFactorRaw;
    if (ex.overall && ex.overall.pass) fields.overallPassRaw = ex.overall.pass;
    /* Mark exercise-table body used so field values do not swallow it. */
    const exHead = clipped.find(function (w) { return w.n === "EXERCISE"; });
    const opHead = clipped.find(function (w) { return w.n === "FITTEST"; });
    if (exHead) {
      clipped.forEach(function (w) {
        if (w.yc > exHead.y1 && (!opHead || w.y0 < opHead.y0)) {
          if (isValidFfToken(w.text) || parseYesNo(w.text) || /^(EXERCISE|DURATION|SEC|FACTOR|PASS|OVERALL|FF)$/i.test(w.n) || /\b(BENDING|TALKING|HEAD|SIDE|DOWN|GRIMACE)\b/i.test(w.n)) w.used = true;
        }
      });
    }
    hits.forEach(function (hit) {
      if (hit.field === "overallFfRaw") return;
      const row = rows.find(function (r) { return r.indexOf(hit) >= 0; }) || [hit];
      const limitY = nextRowY(hit, rows);
      const vals = valueWordsForSpan(hit, row, rows, clipped, pageW, limitY);
      const text = joinWords(vals);
      if (text) {
        fields[hit.field] = (fields[hit.field] ? fields[hit.field] + " " : "") + text;
        vals.forEach(function (w) { w.used = true; });
      } else if (fields[hit.field] == null) {
        fields[hit.field] = "";
      }
    });
    const title = clipped.find(function (w) { return w.n === "REPORT" || w.n === "FIT"; });
    if (title && !fields.headerDateRaw) {
      const head = clipped.filter(function (w) { return sameRow(w, title) && w.x0 > title.x1 && !w.used && !isTaskbarToken(w.text); });
      const ht = joinWords(head);
      if (ht) fields.headerDateRaw = ht;
    }
    return fields;
  }

  const TABLE_HEADS = /^(EXERCISE|DURATION|DURATION \(SEC\)|DURATION\(SEC\)|FIT FACTOR|PASS)$/i;
  const KNOWN_EXERCISES = [
    "BENDING OVER", "TALKING", "HEAD SIDE TO SIDE", "HEAD UP AND DOWN",
    "DEEP BREATHING", "GRIMACE", "NORMAL BREATHING", "JOGGING IN PLACE"
  ];
  function exactLabelLine(line) {
    const raw = trim(line).replace(/:$/, "");
    const u = normTok(raw);
    if (TABLE_HEADS.test(u) || u === "FIT TEST REPORT" || u === "DATE" || u === "SEC") return null;
    if (u === "OVERALL FF" || u === "OVERALL") return ["OVERALL FF", "overallFfRaw"];
    const pair = labelKey(u) || labelKey(raw);
    if (!pair) return null;
    /* A stacked label is the label alone. "ID NUMBER ENVSS1" is same-line, not a row header. */
    if (trim(valueAfter(raw, pair[0]))) return null;
    return pair;
  }
  function clipTextLines(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const n = normTok(raw);
      if (isTaskbarToken(raw) || n === "SEARCH" || n === "ENG") continue;
      if (n === "US" && i >= lines.length - 6) continue;
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(n) && i >= lines.length - 3) continue;
      out.push(raw);
    }
    return out;
  }
  function looksLikeField(field, val) {
    const v = trim(val);
    if (!v) return false;
    if (field === "portaCountSn") return /^\d{6,14}$/.test(v);
    if (field === "n95Companion" || field === "efficiency") return !!parseYesNo(v);
    if (field === "passLevelRaw") return /^\d{2,4}$/.test(v);
    if (field === "testDateRaw" || field === "dueDateRaw") return /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(v) || /NOV|DEC|JAN/i.test(v);
    if (field === "protocol") return /OSHA|FAST/i.test(v);
    if (field === "respiratorSize") return /^(One Size|Standard|Small|Medium|Large|OS)$/i.test(v);
    if (field === "manufacturer") return /^(3M|Honeywell|MSA|Moldex|Avon|Drager|Dräger|GVS|CleanSpace)$/i.test(v);
    if (field === "model") return /Aura|1870|\+/i.test(v) && v.length < 40;
    if (field === "operator") return /^[A-Z]{1,4}$/.test(v);
    if (field === "idNumber") return /^[A-Z0-9][A-Z0-9\-]{1,20}$/i.test(v) && !/^\d{1,2}\//.test(v);
    if (field === "approval") return !parseYesNo(v);
    return true;
  }
  function shouldWrapField(field, nextVal, nextLab) {
    if (!trim(nextVal)) return false;
    if (nextLab && looksLikeField(nextLab[1], nextVal)) return false;
    if (field === "respirator" || field === "respiratorStyle") {
      if (/^(\[100\]|N95|valve|design|with|exhalation|flat-?fold|3-?panel|de)\b/i.test(nextVal)) return true;
      if (nextVal.length > 18 && !(nextLab && looksLikeField(nextLab[1], nextVal))) return true;
    }
    return false;
  }
  function setIfEmpty(fields, key, val) {
    if (!key || !trim(val)) return;
    if (!trim(fields[key])) fields[key] = trim(val);
  }
  function assignLabelRow(labs, vals, fields) {
    if (!labs.length) return;
    if (labs.length === 1) {
      setIfEmpty(fields, labs[0][1], vals.join(" "));
      return;
    }
    if (vals.length === labs.length) {
      const wrapped = vals.slice();
      let merged = false;
      for (let i = 0; i < labs.length - 1; i++) {
        if (shouldWrapField(labs[i][1], wrapped[i + 1], labs[i + 1])) {
          wrapped[i] = trim(wrapped[i] + " " + wrapped[i + 1]);
          wrapped[i + 1] = "";
          merged = true;
        }
      }
      if (!merged) {
        labs.forEach(function (l, i) { setIfEmpty(fields, l[1], vals[i]); });
        return;
      }
      /* Reassign remaining non-empty values by type after a wrap merge. */
      assignLabelRow(labs, wrapped.filter(Boolean), fields);
      return;
    }
    if (vals.length < labs.length) {
      /* Typical: APPROVAL is blank and EFFICIENCY is Yes. Assign from the right when types match. */
      const used = new Set();
      for (let li = labs.length - 1; li >= 0; li--) {
        let pick = -1;
        for (let vi = vals.length - 1; vi >= 0; vi--) {
          if (used.has(vi)) continue;
          if (looksLikeField(labs[li][1], vals[vi])) { pick = vi; break; }
        }
        if (pick >= 0) { setIfEmpty(fields, labs[li][1], vals[pick]); used.add(pick); }
      }
      return;
    }
    let vi = 0;
    labs.forEach(function (l, li) {
      if (vi >= vals.length) return;
      let v = vals[vi++];
      const nextLab = labs[li + 1];
      while (vi < vals.length && shouldWrapField(l[1], vals[vi], nextLab)) v += " " + vals[vi++];
      setIfEmpty(fields, l[1], v);
    });
  }
  function parseExercisesFromText(lines, fields) {
    const names = [];
    const durs = [];
    const ffs = [];
    const passes = [];
    let iEx = lines.findIndex(function (l) { return /^EXERCISE\b/i.test(l) && !/FIT FACTOR/.test(l.toUpperCase()) || /^EXERCISE\b.*DURATION/i.test(l); });
    if (iEx < 0) iEx = lines.findIndex(function (l) { return /^EXERCISE\b/i.test(l); });
    let iOv = lines.findIndex(function (l, i) { return i > 0 && /^OVERALL\s*FF/i.test(l); });
    let iFf = lines.findIndex(function (l) { return /^FIT FACTOR$/i.test(trim(l)) || /^EXERCISE\b/i.test(l) && /FIT FACTOR/i.test(l); });
    const headOneLine = lines.find(function (l) { return /^EXERCISE\b/i.test(l) && /FIT FACTOR/i.test(l); });
    if (headOneLine) {
      /* already handled by parseExercises on one-line rows; still harvest if needed */
    }
    const start = iEx >= 0 ? iEx + 1 : 0;
    const mid = iOv >= 0 ? iOv : (iFf >= 0 && iFf > start ? iFf : lines.length);
    for (let i = start; i < mid; i++) {
      const u = normTok(lines[i]);
      if (TABLE_HEADS.test(u) || u === "SEC" || u === "DURATION SEC") continue;
      if (exactLabelLine(lines[i]) && !/^OVERALL/.test(u)) break;
      const known = KNOWN_EXERCISES.find(function (n) { return u === n || u.indexOf(n) === 0 || n.indexOf(u) === 0; });
      if (known) { names.push(known); continue; }
      /* fragments */
      if (/^(BENDING|TALKING|HEAD|SIDE|UP|DOWN|AND|OVER)$/.test(u)) {
        const prev = names[names.length - 1];
        if (prev && !KNOWN_EXERCISES.includes(prev) || (prev && /HEAD|BENDING/.test(prev))) {
          const joined = trim((prev || "") + " " + u);
          const match = KNOWN_EXERCISES.find(function (n) { return n.indexOf(normTok(joined)) === 0 || normTok(joined).indexOf(n) === 0 || n === normTok(joined); });
          names[names.length - 1] = match || joined;
        } else {
          names.push(u);
        }
        continue;
      }
      const dm = trim(lines[i]).match(/^(\d{1,3})\s*s?$/i);
      if (dm && +dm[1] >= 5 && +dm[1] <= 180) durs.push(dm[1]);
    }
    const ffStart = iFf >= 0 ? iFf + 1 : mid;
    for (let i = ffStart; i < lines.length; i++) {
      const t = trim(lines[i]);
      if (/^FITTEST|^NAME$|^DATE$|^NOTE/i.test(t)) {
        /* keep scanning Yes/200+ a little; stop on obvious footer if we already have enough */
        if (ffs.length >= Math.max(4, names.length) && passes.length >= names.length) break;
      }
      if (isTaskbarToken(t)) break;
      if (isValidFfToken(t)) ffs.push(t);
      else if (parseYesNo(t)) passes.push(parseYesNo(t) === "yes" ? "Yes" : "No");
    }
    /* Also harvest one-line "NAME DUR FF Yes" rows already parsed elsewhere. */
    if (names.length && (ffs.length || durs.length)) {
      const rows = [];
      let overall = null;
      const nEx = names.length;
      for (let i = 0; i < nEx; i++) {
        const ff = ffs[i] || "";
        const p = passes[i] || "";
        const dur = durs[i] || "";
        rows.push({ exercise: names[i], duration: dur, fitFactorRaw: ff, passRaw: p, fitFactor: parseFf(ff), pass: parseYesNo(p) });
      }
      if (ffs.length > nEx) {
        const ff = ffs[nEx];
        const p = passes[nEx] || passes[passes.length - 1] || "";
        overall = { fitFactorRaw: ff, pass: parseYesNo(p), fitFactor: parseFf(ff) };
      }
      const validNew = rows.filter(function (r) { return r.exercise && isValidFfToken(r.fitFactorRaw); }).length;
      const validOld = (fields.exercises || []).filter(function (r) { return r.exercise && isValidFfToken((r.fitFactor && r.fitFactor.raw) || r.fitFactorRaw || ""); }).length;
      if (rows.length && validNew > validOld) fields.exercises = rows;
      if (overall && overall.fitFactorRaw && !isValidFfToken(fields.overallFfRaw || "")) fields.overallFfRaw = overall.fitFactorRaw;
    }
    return fields;
  }
  function parseReportFromLines(lines, fields) {
    const clipped = clipTextLines(lines);
    /* One-line "EXERCISE DURATION FIT FACTOR PASS" tables (unit fixtures). */
    for (let i = 0; i < clipped.length; i++) {
      const u = clipped[i].toUpperCase();
      if (/^EXERCISE\b/.test(u) && /FIT FACTOR/.test(u)) {
        const ex = parseExercises(clipped, i + 1);
        if (!fields.exercises || !fields.exercises.length) fields.exercises = ex.rows;
        /* overall may sit on the next line, parseExercises stops at OVERALL */
        break;
      }
    }
    let i = 0;
    while (i < clipped.length) {
      const u = clipped[i].toUpperCase();
      /* Same-line "LABEL value" (printed dumps and the v48.9 unit fixture). */
      const same = labelKey(clipped[i]);
      if (same && trim(valueAfter(clipped[i], same[0]))) {
        if (same[1] === "overallFfRaw") {
          const rest = valueAfter(clipped[i], same[0]);
          const fm = rest.match(/(\d+\+?)/);
          if (fm && !isValidFfToken(fields.overallFfRaw || "")) fields.overallFfRaw = fm[1];
          const py = parseYesNo(rest);
          if (py) fields.overallPassRaw = py;
          i++; continue;
        }
        let val = valueAfter(clipped[i], same[0]);
        if (same[1] === "respirator" || same[1] === "respiratorStyle") {
          let j = i + 1;
          while (j < clipped.length && !labelKey(clipped[j]) && !/^EXERCISE\b/i.test(clipped[j]) && !/^OVERALL\b/i.test(clipped[j])) {
            val = (val ? val + " " : "") + clipped[j];
            j++;
          }
          i = j - 1;
        }
        setIfEmpty(fields, same[1], val);
        i++; continue;
      }
      if (/^FIT\s*TEST\s*REPORT$/i.test(trim(clipped[i])) || /^FIT\s*TEST\s*REPORT\b/i.test(u)) {
        const rest = clipped[i].replace(/.*FIT\s*TEST\s*REPORT/i, "").trim();
        if (rest) setIfEmpty(fields, "headerDateRaw", rest);
        else if (clipped[i + 1] && /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(clipped[i + 1])) {
          setIfEmpty(fields, "headerDateRaw", clipped[i + 1]);
          i += 2; continue;
        }
        i++; continue;
      }
      if (TABLE_HEADS.test(normTok(clipped[i]).replace(/:$/, "")) || /^DURATION\b/i.test(clipped[i])) {
        i++; continue;
      }
      if (/^DATE$/i.test(trim(clipped[i]))) {
        i++; continue;
      }
      const rowLabs = [];
      let j = i;
      function sectionOf(field) {
        if (/^(idNumber|lastName|firstName|company|location|testDateRaw|dueDateRaw)$/.test(field)) return "id";
        if (/^(operator|operatorName|note|overallFfRaw)$/.test(field)) return "foot";
        return "equip";
      }
      while (j < clipped.length) {
        const lk = exactLabelLine(clipped[j]);
        if (!lk) break;
        if (rowLabs.length && sectionOf(rowLabs[rowLabs.length - 1][1]) !== sectionOf(lk[1])) break;
        rowLabs.push(lk);
        j++;
      }
      if (rowLabs.length) {
        const vals = [];
        let k = j;
        while (k < clipped.length && !exactLabelLine(clipped[k]) && !TABLE_HEADS.test(normTok(clipped[k]).replace(/:$/, "")) && !/^DATE$/i.test(trim(clipped[k])) && !/^FIT\s*TEST\s*REPORT/i.test(clipped[k]) && !/^DURATION\b/i.test(clipped[k])) {
          vals.push(clipped[k]);
          k++;
        }
        /* Don't treat exercise names as values of OVERALL FF / OPERATOR / NOTE. */
        const filtered = vals.filter(function (v) {
          const n = normTok(v);
          if (KNOWN_EXERCISES.indexOf(n) >= 0) return false;
          if (isTaskbarToken(v)) return false;
          return true;
        });
        const labs = rowLabs.filter(function (l) {
          /* OVERALL FF values come from the table, not the next label block. */
          return l[1] !== "overallFfRaw";
        });
        if (labs.length) assignLabelRow(labs, filtered, fields);
        i = k;
        continue;
      }
      i++;
    }
    parseExercisesFromText(clipped, fields);
    /* Footer: DATE / EA / DATE / NAME / John Breed */
    for (let i2 = 0; i2 < clipped.length - 1; i2++) {
      if (/^DATE$/i.test(trim(clipped[i2])) && /^[A-Z]{1,4}$/.test(trim(clipped[i2 + 1]))) {
        setIfEmpty(fields, "operator", trim(clipped[i2 + 1]));
      }
      if (/^NAME$/i.test(trim(clipped[i2])) && clipped[i2 + 1] && !exactLabelLine(clipped[i2 + 1])) {
        setIfEmpty(fields, "operatorName", trim(clipped[i2 + 1]));
      }
    }
    return fields;
  }

  function tidyFields(fields) {
    const sn = String(fields.portaCountSn || "");
    const snm = sn.match(/^(\d{6,14})(?:\s+[\s\S]*)?$/);
    if (snm) {
      const rest = trim(sn.slice(snm[1].length));
      fields.portaCountSn = snm[1];
      if (rest && /Aura|1870|Disposable|3M/i.test(rest) && rest.length > String(fields.respirator || "").length) fields.respirator = rest;
      else if (rest && !trim(fields.respirator) && !parseYesNo(rest) && !/OSHA|FAST/i.test(rest)) fields.respirator = rest;
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(fields.idNumber || "")) {
      if (!fields.testDateRaw) fields.testDateRaw = fields.idNumber;
      fields.idNumber = "";
    }
    if (isTaskbarToken(fields.note || "") || /^:\s*Search/i.test(fields.note || "") || /^Search$/i.test(trim(fields.note || "")) || /^\d{6,14}$/.test(trim(fields.note || "")) || /COMPANION|PORTACOUNT/i.test(fields.note || "")) fields.note = "";
    if (isClockToken(fields.overallFfRaw || "") || !isValidFfToken(String(fields.overallFfRaw || "").split(/\s+/)[0] || "") && fields.overallFfRaw) {
      if (!isValidFfToken(trim(fields.overallFfRaw || ""))) {
        const m = String(fields.overallFfRaw).match(/\b(\d+\+)\b/);
        fields.overallFfRaw = m ? m[1] : "";
      }
    }
    const plParts = String(fields.passLevelRaw || "").match(/\d+(?:\.\d+)?/g) || [];
    const pl = plParts.map(Number).find(function (n) { return n >= 5 && n <= 1000; });
    if (pl != null) fields.passLevelRaw = String(pl);
    if (/^[\d.+]+$/.test(trim(fields.operator || ""))) fields.operator = "";
    if (isTaskbarToken(fields.operator || "") || isClockToken(fields.operator || "")) fields.operator = "";
    if (trim(fields.operator) && /\s/.test(trim(fields.operator))) {
      const toks = trim(fields.operator).match(/\b([A-Z]{1,4})\b/g) || [];
      const pick = toks.find(function (t) { return !/^(YES|NO|PASS|FAIL|FF|N95|AND|UP|TO|THE|SEC)$/.test(t); });
      if (pick) fields.operator = pick;
    }
    if (trim(fields.operator) && !trim(fields.operatorName)) {
      const parts = trim(fields.operator).split(/\s+/);
      if (parts.length > 1 && /^[A-Z]{1,4}$/.test(parts[0])) {
        fields.operator = parts[0];
        fields.operatorName = parts.slice(1).join(" ");
      }
    }
    if (!trim(fields.operator) && trim(fields.operatorName)) {
      const parts = trim(fields.operatorName).split(/\s+/);
      if (/^[A-Z]{1,4}$/.test(parts[0]) && parts.length > 1) {
        fields.operator = parts[0];
        fields.operatorName = parts.slice(1).join(" ");
      }
    }
    if ((!fields.model || /^\+$/.test(trim(fields.model))) && fields.respirator) {
      const mm = String(fields.respirator).match(/\b(Aura\s+\S+|1870\+?|[A-Za-z0-9.-]+\+)/);
      if (mm) fields.model = mm[1].replace(/,$/, "");
    }
    return fields;
  }
  function recoverFromText(fields, raw) {
    const u = String(raw || "").replace(/\s+/g, " ");
    const dateLike = /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s*NOV[A-Z]*\s*\d{4})\b/i;
    const parsedTest = parseTsiDate(fields.testDateRaw || "");
    if (!trim(fields.testDateRaw) || parsedTest.flag === "unparsed" || parsedTest.flag === "missing") {
      const dates = []; let m; const re = new RegExp(dateLike.source, "gi");
      while ((m = re.exec(u))) dates.push(m[1]);
      const due = (fields.dueDateRaw || "").replace(/\s+/g, "");
      const pick = dates.find(function (d) { return d.replace(/\s+/g, "") !== due; }) || dates[0];
      if (pick) fields.headerDateRaw = pick;
      if (/^\d{1,2}:\d{2}$/.test(trim(fields.testDateRaw || ""))) fields.testTime = fields.testTime || trim(fields.testDateRaw);
      if (parsedTest.flag === "unparsed") fields.testDateRaw = pick || fields.testDateRaw;
    }
    if (!trim(fields.idNumber) || /^\d{1,2}\/\d{1,2}\//.test(fields.idNumber)) {
      const id = u.match(/\b(ENVSS\d+|T-\d+|[A-Z]{2,6}-\d{2,5})\b/);
      if (id) fields.idNumber = id[1];
    }
    if (!/OSHA\s+FAST[- ]?FILTERING\s+FACE/i.test(fields.protocol || "")) {
      const pr = u.match(/OSHA\s+FAST[- ]?FILTERING\s+FACE/i);
      if (pr) fields.protocol = pr[0].replace(/\s+/g, " ").replace(/FAST-/i, "FAST-");
    }
    if (!trim(fields.portaCountSn) || !/^\d{6,14}$/.test(trim(fields.portaCountSn))) {
      const sn = u.match(/PORTACOUNT\s*S\/N\s*™?\s*(\d{6,14})/i) || u.match(/\b(8048\d{6,8})\b/) || u.match(/\b(\d{10,12})\b/);
      if (sn) fields.portaCountSn = sn[1];
    }
    if (!parseYesNo(fields.n95Companion || "")) {
      const n95 = u.match(/N95-?COMPANION\S*(?:\s+\d{6,14})?\s+(Yes|No)/i) || u.match(/N95-?COMPANION[™®©\s]*\s*(Yes|No)/i);
      if (n95) fields.n95Companion = n95[1];
    }
    if (!trim(fields.respiratorSize)) {
      const sz = u.match(/RESPIRATOR\s+SIZE\s+(One Size|Standard|Small|Medium|Large)/i) || u.match(/\b(One Size)\b/i);
      if (sz) fields.respiratorSize = sz[1];
    }
    if (!trim(fields.manufacturer) || trim(fields.manufacturer).length > 24 || /N95|\[100\]|Disposable|Aura|valve/i.test(fields.manufacturer || "")) {
      const mf = u.match(/\bMANUFACTURER\s+(3M|Honeywell|MSA|Moldex)\b/i) || u.match(/\b(3M)\b/);
      if (mf) fields.manufacturer = (mf[1] || "").replace(/^MANUFACTURER\s+/i, "") || "3M";
    }
    if (!/^\d{2,4}$/.test(String(fields.passLevelRaw || fields.passLevel || ""))) {
      const pl = u.match(/PASS\s*LEVEL\s+(\d{2,4})/i);
      if (pl) fields.passLevelRaw = pl[1];
    }
    if (!parseYesNo(fields.efficiency || "")) {
      const ef = u.match(/EFFICIENCY\s*<\s*99%\s*(Yes|No)/i);
      if (ef) fields.efficiency = ef[1];
    }
    const opBad = !trim(fields.operator) || isValidFfToken(fields.operator) || isClockToken(fields.operator) || parseYesNo(fields.operator) || /COMPANION|PORTACOUNT|NOTE|SEARCH|PROTOCOL|N95/i.test(fields.operator || "");
    if (opBad) {
      const op = u.match(/FITTEST\s+OPERATOR\s+([A-Z]{1,4})\b/) || u.match(/\bDATE\s+([A-Z]{1,4})\s+DATE\b/);
      if (op) fields.operator = op[1];
    }
    const nameHit = u.match(/(?<!LAST )(?<!FIRST )NAME\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/);
    if (nameHit && !/^FIRST|^LAST/.test(nameHit[1].toUpperCase())) {
      const cleaned = nameHit[1].replace(/\s+(Search|Eng|Us|Cortana)$/i, "").trim();
      if (cleaned && (!trim(fields.operatorName) || fields.operatorName === fields.lastName || /Search|Eng/i.test(fields.operatorName) || fields.operatorName.split(/\s+/).length < cleaned.split(/\s+/).length)) {
        fields.operatorName = cleaned;
      }
    }
    if (!isValidFfToken(trim(fields.overallFfRaw || ""))) {
      const o = u.match(/OVERALL\s*FF?\s+(\d+\+?)/i) || u.match(/\b(200\+)\b/);
      if (o && isValidFfToken(o[1])) fields.overallFfRaw = o[1];
    }
    if (!trim(fields.model) || trim(fields.model).length < 3 || /^(\+|disposable\b)/i.test(trim(fields.model))) {
      const m = u.match(/\b(Aura\s+9322A\+?|Aura\s+[A-Z0-9+]+|1870\+?)/i);
      if (m) fields.model = m[1];
    }
    if (!/exhalation/i.test(fields.respiratorStyle || "")) {
      const st = u.match(/Disposable[^\n]{0,90}exhalation\s*\.?\s*valve/i);
      if (st) fields.respiratorStyle = st[0].replace(/\s+/g, " ").trim();
    }
    if (!/Aura|1870/i.test(fields.respirator || "") || (!/\[100\]/i.test(fields.respirator || "") && /\[100\]\s*N95/i.test(u))) {
      const r = u.match(/3M\s+Aura\s+\S+(?:\s+Disposable[^\[]{0,80})?(?:\[100\]\s*N95)?/i) || u.match(/3M\s+1870\+[^\n]{0,60}/i);
      if (r) fields.respirator = r[0].replace(/\s+/g, " ").trim();
    }
    return fields;
  }
  function finalizeFields(fields, extras) {
    extras = extras || {};
    tidyFields(fields);
    if (extras.rawText) recoverFromText(fields, extras.rawText);
    const missing = [];
    const flags = [];
    const testDate = parseTsiDate(fields.testDateRaw || fields.headerDateRaw || "");
    const dueDate = parseTsiDate(fields.dueDateRaw || "");
    fields.testDate = testDate;
    fields.dueDate = dueDate;
    if (testDate.time) fields.testTime = testDate.time;
    else {
      const tm = String(fields.testDateRaw || "").match(/\b(\d{1,2}:\d{2})\b/);
      if (tm) fields.testTime = tm[1].length === 4 ? "0" + tm[1] : tm[1];
    }
    /* Only warn when both parts are ≤12 and they differ. A part over 12 was resolved silently. */
    if (testDate.flag === "ambiguous") flags.push({ field: "testDate", reason: "Date could be DD/MM or MM/DD. Treated as DD/MM/YYYY (" + testDate.display + "). Check this." });
    if (testDate.flag === "unparsed" && fields.testDateRaw) flags.push({ field: "testDate", reason: "Could not read the test date." });
    if (dueDate.flag === "ambiguous") flags.push({ field: "dueDate", reason: "Due date could be DD/MM or MM/DD. Treated as DD/MM/YYYY (" + dueDate.display + ")." });

    const passLevel = parseFloat(String(fields.passLevelRaw || "").replace(/[^\d.]/g, ""));
    fields.passLevel = Number.isFinite(passLevel) ? passLevel : null;
    if (!isValidFfToken(trim(fields.overallFfRaw || ""))) {
      const trail = String(fields.overallFfRaw || "").match(/\b(\d+\+)\b/);
      fields.overallFfRaw = trail ? trail[1] : "";
    }
    const overallFf = parseFf(fields.overallFfRaw);
    fields.overallFf = overallFf;
    const overallByLevel = ffMeets(overallFf, fields.passLevel);
    const overallYn = parseYesNo(fields.overallPassRaw || "");
    fields.exercises = (fields.exercises || []).filter(function (ex) {
      const n = trim(ex.exercise || "");
      if (n.length < 4 || /^OVERALL/i.test(n) || /^DATE$/i.test(n) || /^HEAD UP$/i.test(n) && !/DOWN/i.test(n) && !isValidFfToken((ex.fitFactor && ex.fitFactor.raw) || ex.fitFactorRaw || "")) return false;
      const ffRaw = (ex.fitFactor && ex.fitFactor.raw) || ex.fitFactorRaw || "";
      if (ffRaw && !isValidFfToken(ffRaw) && !isValidFfToken(String(ex.fitFactor && ex.fitFactor.value || ""))) return false;
      return isValidFfToken(ffRaw) || ex.pass || trim(ex.duration || "");
    });
    fields.exercises.forEach(function (ex) {
      if (ex.fitFactorRaw && isValidFfToken(ex.fitFactorRaw) && !(ex.fitFactor && ex.fitFactor.value != null)) ex.fitFactor = parseFf(ex.fitFactorRaw);
      const byLevel = ffMeets(ex.fitFactor, fields.passLevel);
      if (!ex.pass && byLevel === false) ex.pass = "no";
      if (!ex.pass && byLevel === true) ex.pass = "yes";
      ex.fail = ex.pass === "no" || byLevel === false;
    });
    const exerciseFails = fields.exercises.filter(function (ex) { return ex.fail; });
    fields.exerciseFails = exerciseFails.map(function (ex) { return ex.exercise; });
    let overallPass = overallByLevel;
    if (overallPass == null && overallYn) overallPass = overallYn === "yes";
    fields.overallPass = overallPass;
    fields.result = overallPass === true ? "PASS" : overallPass === false ? "FAIL" : "";
    if (exerciseFails.length && fields.result === "PASS") {
      flags.push({ field: "result", reason: "Overall is a pass, but " + exerciseFails.length + " exercise" + (exerciseFails.length === 1 ? "" : "s") + " failed: " + fields.exerciseFails.join(", ") + "." });
    }
    if (exerciseFails.length && fields.result === "FAIL") {
      flags.push({ field: "result", reason: "Overall is a fail. Failed exercise" + (exerciseFails.length === 1 ? "" : "s") + ": " + fields.exerciseFails.join(", ") + "." });
    }

    const required = [
      ["lastName", "Last name"],
      ["firstName", "First name"],
      ["testDateRaw", "Test date"],
      ["model", "Respirator model"]
    ];
    required.forEach(function (r) {
      if (!trim(fields[r[0]]) && !(r[0] === "model" && trim(fields.respirator))) missing.push(r[1]);
    });
    if (!fields.result) missing.push("Pass/fail");

    const low = (extras.lowFields || []).slice();
    flags.forEach(function (f) { if (low.indexOf(f.field) < 0) low.push(f.field); });
    missing.forEach(function (label) {
      const map = { "Last name": "lastName", "First name": "firstName", "Test date": "testDate", "Respirator model": "model", "Pass/fail": "result" };
      if (map[label] && low.indexOf(map[label]) < 0) low.push(map[label]);
    });

    return { fields: fields, missing: missing, flags: flags, low: low, confidence: extras.confidence == null ? null : extras.confidence };
  }

  function slimOcrWords(words) {
    return (words || []).slice(0, 800).map(function (w) {
      return { t: w.text, x0: Math.round(w.x0), y0: Math.round(w.y0), x1: Math.round(w.x1), y1: Math.round(w.y1) };
    });
  }
  function wordsFromSlim(list, pageW, pageH) {
    return (list || []).map(function (w) {
      const x0 = +w.x0 || 0, y0 = +w.y0 || 0, x1 = +w.x1 || 0, y1 = +w.y1 || 0;
      const text = w.t || w.text || "";
      return { text: text, n: normTok(text), used: false, pageW: pageW || 0, pageH: pageH || 0, x0: x0, x1: x1, y0: y0, y1: y1, xc: (x0 + x1) / 2, yc: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    });
  }

  function parseReport(text, extras) {
    extras = extras || {};
    const raw = String(text || "").replace(/\r/g, "");
    const lines = raw.split(/\n+/).map(function (l) { return l.replace(/[ \t]+/g, " ").trim(); }).filter(Boolean);
    let fields = {};
    const header = lines.find(function (l) { return /FIT\s*TEST\s*REPORT/i.test(l); }) || "";
    const headerDate = header.replace(/.*FIT\s*TEST\s*REPORT/i, "").trim();
    if (headerDate) fields.headerDateRaw = headerDate;

    let words = wordsFromVision(extras);
    if (!words.length && extras.ocrWords) words = wordsFromSlim(extras.ocrWords);
    if (words.length) {
      fields = Object.assign(fields, parseReportFromBoxes(words, extras));
    }
    parseReportFromLines(lines, fields);
    recoverFromText(fields, raw);

    extras.rawText = extras.rawText || raw;
    const done = finalizeFields(fields, extras);
    done.rawText = raw;
    done.ocrWords = words.length ? slimOcrWords(words) : (extras.ocrWords || []);
    return done;
  }

  const api = {
    version: VERSION, isFitEvent, fitSeqOf, nextFitSeq, fitEventCode, fileNameFor,
    parseReport, parseTsiDate, parseFf, ffMeets, safeToken, parseYesNo, wordsFromVision, findLabelHits, parseExercisesFromWords, parseReportFromBoxes, joinWords, clipWordsToReport, slimOcrWords
  };
  root.envssFit = api;

  if (typeof document === "undefined") return;

  /* ---------- live app wiring ---------- */
  const PDF_LIB = PDF_SRC, ZIP_LIB = ZIP_SRC;

  function gdb() { return db; }
  function reportsOf(eventId) {
    return ((typeof db !== "undefined" && db && db.fitReports) || []).filter(r => r && r.eventId === eventId);
  }
  function reportById(id) { return ((typeof db !== "undefined" && db && db.fitReports) || []).find(r => r && r.id === id) || null; }
  function evLog(ev, action, detail) {
    if (!ev) return;
    ev.audit = ev.audit || [];
    ev.audit.push({ at: (root.nowIso && root.nowIso()) || new Date().toISOString(), who: (root.whoText && root.whoText()) || "", action, detail: detail || "" });
  }
  function uid(p) { return (root.uid && root.uid(p)) || (p || "fr") + "_" + Math.random().toString(36).slice(2, 10); }
  function save() { if (typeof root.save === "function") root.save(); else if (typeof root.saveQuiet === "function") root.saveQuiet(); }
  function saveQuiet() { if (typeof root.saveQuiet === "function") root.saveQuiet(); else save(); }

  function installSync() {
    try {
      if (typeof COLLS !== "undefined" && COLLS.indexOf("fitReports") < 0) COLLS.push("fitReports");
      if (typeof TABLE !== "undefined") TABLE.fitReports = "envss_fit_reports";
      if (typeof DEFAULT !== "undefined" && !Array.isArray(DEFAULT.fitReports)) DEFAULT.fitReports = [];
      if (typeof db !== "undefined" && db && !Array.isArray(db.fitReports)) db.fitReports = [];
      if (typeof syncState !== "undefined" && syncState.hash && !syncState.hash.fitReports) syncState.hash.fitReports = {};
    } catch (e) { console.warn("[ENVSS] fit sync init", e); }
    if (typeof root.baseLoad === "function") {
      const _bl = root.baseLoad;
      root.baseLoad = function (d) {
        const out = _bl.apply(this, arguments);
        if (out && !Array.isArray(out.fitReports)) out.fitReports = [];
        return out;
      };
      root.baseLoad = root.baseLoad;
    }
    if (typeof root.pullActivity === "function") {
      const _pa = root.pullActivity;
      root.pullActivity = async function () {
        const r = await _pa.apply(this, arguments);
        try {
          if (root.sbGet && root.mergeRemote && root.sbCfg && root.sbCfg()) {
            try {
              const rows = await root.sbGet("envss_fit_reports");
              const h = root.mergeRemote("fitReports", rows);
              if (root.syncState) root.syncState.fitReportsAt = new Date().toISOString();
              if (h && h.changed && typeof root.render === "function" && !(root.userIsTyping && root.userIsTyping())) root.render();
            } catch (he) {
              if (root.syncState) root.syncState.fitReportsError = String(he && he.message || he);
            }
          }
        } catch (e) { console.warn("[ENVSS] fit pull", e); }
        return r;
      };
      root.pullActivity = root.pullActivity;
    }
    if (typeof root.sendOne === "function") {
      const _so = root.sendOne;
      root.sendOne = async function (p) {
        if (p && p.coll === "fitReports") {
          /* fall through to original after ensuring denormalised columns via a lightweight wrap */
        }
        const orig = root.sbUpsert;
        if (p && p.coll === "fitReports" && typeof orig === "function") {
          root.sbUpsert = async function (table, row) {
            if (table === "envss_fit_reports") {
              const rec = (root.findRec && root.findRec("fitReports", p.id)) || reportById(p.id) || {};
              row.event_id = rec.eventId || rec.event_id || "";
              row.project_id = rec.projectId || rec.project_id || "";
            }
            return orig.apply(this, arguments);
          };
          try { return await _so.apply(this, arguments); }
          finally { root.sbUpsert = orig; }
        }
        return _so.apply(this, arguments);
      };
      root.sendOne = root.sendOne;
    }
  }

  function parentOptions(ev) {
    const evs = (typeof db !== "undefined" && db && db.events) || [];
    return evs.filter(e => e && e.projectId === ev.projectId && e.id !== ev.id && !isFitEvent(e) && !(root.isFibreEvent && root.isFibreEvent(e)))
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }

  function stageOf(ev) {
    if (!isFitEvent(ev)) return null;
    const reps = reportsOf(ev.id);
    if (!reps.length) return ev.uploadReady ? "upload_ready" : "planned";
    const allSigned = reps.every(r => !!(r.signedAt || (r.sigTech && r.sigClient)));
    if (allSigned && ev.uploadReady) return "upload_ready";
    if (allSigned) return "ev_complete";
    return "ev_needs";
  }

  function blankReport(ev) {
    return {
      id: uid("fr"),
      eventId: ev.id,
      projectId: ev.projectId,
      eventCode: ev.code,
      idNumber: "", lastName: "", firstName: "", company: "", location: "",
      testDateRaw: "", testDateDisplay: "", testTime: "", dueDateRaw: "", dueDateDisplay: "",
      dateFlag: "",
      portaCountSn: "", n95Companion: "", respirator: "", manufacturer: "", model: "",
      respiratorStyle: "", respiratorSize: "", protocol: "", passLevel: "", approval: "", efficiency: "",
      exercises: [], overallFf: "", overallPass: null, result: "", operator: "", operatorName: "", note: "",
      exerciseFails: [],
      flags: [], missing: [], low: [],
      photo: "", photoDataUrl: "",
      sigTech: "", sigClient: "", signedAt: "",
      pdfName: "", ocrStatus: "", ocrMessage: "",
      audit: [],
      updatedAt: new Date().toISOString()
    };
  }

  function applyParsed(rep, parsed) {
    const f = (parsed && parsed.fields) || {};
    rep.idNumber = f.idNumber || "";
    rep.lastName = f.lastName || "";
    rep.firstName = f.firstName || "";
    rep.company = f.company || "";
    rep.location = f.location || "";
    rep.testDateRaw = (f.testDate && f.testDate.raw) || f.testDateRaw || "";
    rep.testDateDisplay = (f.testDate && f.testDate.display) || "";
    rep.testTime = f.testTime || (f.testDate && f.testDate.time) || "";
    rep.dueDateRaw = (f.dueDate && f.dueDate.raw) || f.dueDateRaw || "";
    rep.dueDateDisplay = (f.dueDate && f.dueDate.display) || "";
    rep.dateFlag = (f.testDate && f.testDate.flag) || "";
    rep.testDate = f.testDate || parseTsiDate(rep.testDateRaw);
    rep.dueDate = f.dueDate || parseTsiDate(rep.dueDateRaw);
    rep.portaCountSn = f.portaCountSn || "";
    rep.n95Companion = f.n95Companion || "";
    rep.respirator = f.respirator || "";
    rep.manufacturer = f.manufacturer || "";
    rep.model = f.model || "";
    rep.respiratorStyle = f.respiratorStyle || "";
    rep.respiratorSize = f.respiratorSize || "";
    rep.protocol = f.protocol || "";
    rep.passLevel = f.passLevel != null ? String(f.passLevel) : (f.passLevelRaw || "");
    rep.approval = f.approval || "";
    rep.efficiency = f.efficiency || "";
    rep.exercises = f.exercises || [];
    rep.overallFf = (f.overallFf && f.overallFf.raw) || f.overallFfRaw || "";
    rep.overallPass = f.overallPass;
    rep.result = f.result || "";
    rep.operator = f.operator || "";
    rep.operatorName = f.operatorName || "";
    rep.note = f.note || "";
    rep.exerciseFails = f.exerciseFails || [];
    rep.flags = parsed.flags || [];
    rep.missing = parsed.missing || [];
    rep.low = parsed.low || [];
    return rep;
  }

  function collectForm(rep) {
    const g = id => (document.getElementById(id) || {}).value || "";
    rep.idNumber = trim(g("fitIdNumber"));
    rep.lastName = trim(g("fitLast"));
    rep.firstName = trim(g("fitFirst"));
    rep.company = trim(g("fitCompany"));
    rep.location = trim(g("fitLocation"));
    rep.testDateDisplay = trim(g("fitTestDate"));
    rep.testDateRaw = rep.testDateDisplay || rep.testDateRaw;
    rep.testDate = parseTsiDate(rep.testDateDisplay || rep.testDateRaw);
    if (rep.testDate.flag === "us" || rep.testDate.flag === "ambiguous") rep.dateFlag = rep.testDate.flag;
    else if (rep.testDate.display) { rep.testDateDisplay = rep.testDate.display; rep.dateFlag = rep.testDate.flag; }
    rep.testTime = trim(g("fitTestTime"));
    rep.dueDateDisplay = trim(g("fitDueDate"));
    rep.dueDateRaw = rep.dueDateDisplay || rep.dueDateRaw;
    rep.dueDate = parseTsiDate(rep.dueDateDisplay || rep.dueDateRaw);
    rep.portaCountSn = trim(g("fitPorta"));
    rep.n95Companion = trim(g("fitN95"));
    rep.respirator = trim(g("fitRespirator"));
    rep.manufacturer = trim(g("fitMfr"));
    rep.model = trim(g("fitModel"));
    rep.respiratorStyle = trim(g("fitStyle"));
    rep.respiratorSize = trim(g("fitSize"));
    rep.protocol = trim(g("fitProtocol"));
    rep.passLevel = trim(g("fitPassLevel"));
    rep.approval = trim(g("fitApproval"));
    rep.efficiency = trim(g("fitEfficiency"));
    rep.overallFf = trim(g("fitOverallFf"));
    rep.result = trim(g("fitResult"));
    rep.operator = trim(g("fitOperator"));
    rep.operatorName = trim(g("fitOperatorName"));
    rep.note = trim(g("fitNote"));
    const pl = parseFloat(rep.passLevel);
    const of = parseFf(rep.overallFf);
    if (rep.result !== "PASS" && rep.result !== "FAIL") {
      const meet = ffMeets(of, pl);
      if (meet === true) rep.result = "PASS";
      else if (meet === false) rep.result = "FAIL";
    }
    rep.overallPass = rep.result === "PASS";
    const ex = [];
    document.querySelectorAll("[data-fit-ex]").forEach(row => {
      const i = row.getAttribute("data-fit-ex");
      ex.push({
        exercise: trim((document.getElementById("fitExN" + i) || {}).value),
        duration: trim((document.getElementById("fitExD" + i) || {}).value),
        fitFactorRaw: trim((document.getElementById("fitExF" + i) || {}).value),
        pass: parseYesNo((document.getElementById("fitExP" + i) || {}).value),
        fitFactor: parseFf((document.getElementById("fitExF" + i) || {}).value)
      });
    });
    if (ex.length) {
      const level = parseFloat(rep.passLevel);
      ex.forEach(r => { r.fail = r.pass === "no" || ffMeets(r.fitFactor, level) === false; });
      rep.exercises = ex;
      rep.exerciseFails = ex.filter(r => r.fail).map(r => r.exercise);
    }
    return rep;
  }

  function lowClass(rep, field) {
    return (rep.low || []).indexOf(field) >= 0 || (rep.missing || []).indexOf(field) >= 0 ? " fit-low" : "";
  }

  function photoPid(rep) {
    const v = (rep && (rep.photo || rep.photoDataUrl)) || "";
    if (String(v).indexOf("envss-photo:") === 0) return String(v).slice("envss-photo:".length);
    return "";
  }
  function photoSrc(rep) {
    if (rep.photoDataUrl && String(rep.photoDataUrl).indexOf("data:") === 0) return rep.photoDataUrl;
    if (rep.photo && String(rep.photo).indexOf("data:") === 0) return rep.photo;
    return "";
  }

  function confirmHtml(rep, ev) {
    const psrc = photoSrc(rep);
    const flags = (rep.flags || []).map(f => "<li>" + esc(f.reason) + "</li>").join("");
    const msg = rep.ocrMessage ? "<p class=\"help\" id=\"fitOcrMsg\">" + esc(rep.ocrMessage) + "</p>" : "";
    const fails = (rep.exerciseFails || []).length
      ? "<p class=\"fit-warn\">Exercise fail" + (rep.exerciseFails.length === 1 ? "" : "s") + ": " + esc(rep.exerciseFails.join(", ")) + "</p>"
      : "";
    const exRows = (rep.exercises && rep.exercises.length ? rep.exercises : [{ exercise: "", duration: "", fitFactorRaw: "", pass: "" }]).map((ex, i) => {
      return "<tr data-fit-ex=\"" + i + "\"><td><input id=\"fitExN" + i + "\" value=\"" + esc(ex.exercise || "") + "\"></td>"
        + "<td><input id=\"fitExD" + i + "\" value=\"" + esc(ex.duration || "") + "\"></td>"
        + "<td><input id=\"fitExF" + i + "\" value=\"" + esc(ex.fitFactorRaw || (ex.fitFactor && ex.fitFactor.raw) || "") + "\"></td>"
        + "<td><select id=\"fitExP" + i + "\"><option value=\"\"></option>"
        + "<option value=\"yes\"" + (ex.pass === "yes" ? " selected" : "") + ">Pass</option>"
        + "<option value=\"no\"" + (ex.pass === "no" ? " selected" : "") + ">Fail</option></select></td></tr>";
    }).join("");
    const inp = (id, field, label, val, extra) =>
      "<label class=\"" + lowClass(rep, field) + "\">" + esc(label) + "<input id=\"" + id + "\" value=\"" + esc(val || "") + "\" " + (extra || "") + "></label>";
    return "<div class=\"wrap fit-screen\" id=\"fitConfirm\">"
      + "<button class=\"btn ghost back-ctl\" id=\"fitBackEvent\">← " + esc(ev.code) + "</button>"
      + "<h2 class=\"brand-type\" style=\"color:var(--navy)\">Confirm fit-test report</h2>"
      + "<p class=\"help\">Check every field against the photo before you sign. Nothing is signed automatically.</p>"
      + msg
      + (flags ? "<ul class=\"fit-flags\">" + flags + "</ul>" : "")
      + fails
      + "<div class=\"fit-grid\">"
      + "<div class=\"fit-photo-col\"><div class=\"card\">"
      + (psrc ? "<img id=\"fitPhotoImg\" alt=\"Fit-test report photo\" src=\"" + psrc + "\">" : (photoPid(rep) && root.envssPhotos && root.envssPhotos.imgTag ? root.envssPhotos.imgTag(photoPid(rep), "Fit-test report photo").replace("<img ", "<img id=\"fitPhotoImg\" style=\"width:100%;max-height:70vh;object-fit:contain\" ") : "<p class=\"help\">No photo attached.</p>"))
      + "<div class=\"row\" style=\"margin-top:8px\"><button type=\"button\" class=\"btn mid\" id=\"fitRetake\">Retake photo</button>"
      + "<input id=\"fitPhotoInput\" type=\"file\" accept=\"image/*\" capture=\"environment\" hidden></div>"
      + "</div></div>"
      + "<div class=\"fit-fields card\">"
      + inp("fitIdNumber", "idNumber", "ID number", rep.idNumber)
      + inp("fitLast", "lastName", "Last name", rep.lastName)
      + inp("fitFirst", "firstName", "First name", rep.firstName)
      + inp("fitCompany", "company", "Company", rep.company)
      + inp("fitLocation", "location", "Location", rep.location)
      + inp("fitTestDate", "testDate", "Test date (DD/MM/YYYY)", rep.testDateDisplay || (rep.testDate && rep.testDate.display) || "")
      + inp("fitTestTime", "testTime", "Test time", rep.testTime)
      + inp("fitDueDate", "dueDate", "Due date (DD/MM/YYYY)", rep.dueDateDisplay || (rep.dueDate && rep.dueDate.display) || "")
      + inp("fitPorta", "portaCountSn", "PortaCount S/N", rep.portaCountSn)
      + inp("fitN95", "n95Companion", "N95-Companion", rep.n95Companion)
      + "<label class=\"" + lowClass(rep, "respirator") + "\">Respirator<textarea id=\"fitRespirator\" rows=\"2\">" + esc(rep.respirator || "") + "</textarea></label>"
      + inp("fitMfr", "manufacturer", "Manufacturer", rep.manufacturer)
      + inp("fitModel", "model", "Model", rep.model)
      + "<label>Respirator style<textarea id=\"fitStyle\" rows=\"2\">" + esc(rep.respiratorStyle || "") + "</textarea></label>"
      + inp("fitSize", "respiratorSize", "Respirator size", rep.respiratorSize)
      + inp("fitProtocol", "protocol", "Protocol", rep.protocol)
      + inp("fitPassLevel", "passLevel", "Pass level", rep.passLevel)
      + inp("fitApproval", "approval", "Approval", rep.approval)
      + inp("fitEfficiency", "efficiency", "Efficiency &lt;99%", rep.efficiency)
      + inp("fitOverallFf", "overallFf", "Overall fit factor", rep.overallFf)
      + "<label class=\"" + lowClass(rep, "result") + "\">Overall result<select id=\"fitResult\">"
      + "<option value=\"\"></option><option value=\"PASS\"" + (rep.result === "PASS" ? " selected" : "") + ">PASS</option>"
      + "<option value=\"FAIL\"" + (rep.result === "FAIL" ? " selected" : "") + ">FAIL</option></select></label>"
      + inp("fitOperator", "operator", "Fit-test operator", rep.operator)
      + inp("fitOperatorName", "operatorName", "Name on report", rep.operatorName)
      + "<label>Note<textarea id=\"fitNote\" rows=\"2\">" + esc(rep.note || "") + "</textarea></label>"
      + "<h3 class=\"brand-type\" style=\"margin-top:12px\">Exercises</h3>"
      + "<div class=\"fit-ex-wrap\"><table class=\"fit-ex\"><thead><tr><th>Exercise</th><th>Duration</th><th>Fit factor</th><th>Pass</th></tr></thead><tbody>"
      + exRows + "</tbody></table></div>"
      + "<button type=\"button\" class=\"btn ghost\" id=\"fitAddEx\">Add exercise</button>"
      + "</div></div>"
      + "<div class=\"footer-actions\">"
      + "<button type=\"button\" class=\"btn mid\" id=\"fitSaveDraft\">Save without signing</button>"
      + "<button type=\"button\" class=\"btn orange\" id=\"fitToSign\">Continue to signatures</button>"
      + "</div></div>";
  }

  function signHtml(rep, ev) {
    return "<div class=\"wrap fit-screen\" id=\"fitSign\">"
      + "<button class=\"btn ghost back-ctl\" id=\"fitBackConfirm\">← Back to details</button>"
      + "<h2 class=\"brand-type\" style=\"color:var(--navy)\">Sign fit-test report</h2>"
      + "<p class=\"help\">" + esc([rep.lastName, rep.firstName].filter(Boolean).join(", ") || "Unnamed") + " · " + esc(rep.model || rep.respirator || "") + " · " + esc(rep.result || "result not set") + "</p>"
      + "<p class=\"help\">The ENVSS technician signs first, then hand the phone to the client. Signatures are not filled in automatically.</p>"
      + "<div class=\"card\"><label>ENVSS technician</label><canvas id=\"fitSigTech\" class=\"fit-sig\" width=\"700\" height=\"220\"></canvas>"
      + "<button type=\"button\" class=\"btn ghost\" id=\"fitClearTech\">Clear</button></div>"
      + "<div class=\"card\"><label>Client</label><canvas id=\"fitSigClient\" class=\"fit-sig\" width=\"700\" height=\"220\"></canvas>"
      + "<button type=\"button\" class=\"btn ghost\" id=\"fitClearClient\">Clear</button></div>"
      + "<div class=\"footer-actions\"><button type=\"button\" class=\"btn orange\" id=\"fitMakePdf\">Save signed PDF</button></div>"
      + "</div>";
  }

  function eventFitHtml(ev) {
    const p = root.project && root.project(ev.projectId);
    const reps = reportsOf(ev.id);
    const parents = parentOptions(ev);
    const parentSel = "<label>Linked hygiene event (optional)<select id=\"fitParent\">"
      + "<option value=\"\">None</option>"
      + parents.map(e => "<option value=\"" + esc(e.id) + "\"" + (ev.parentEventId === e.id ? " selected" : "") + ">" + esc(e.code + (e.date ? " · " + e.date : "")) + "</option>").join("")
      + "</select></label>";
    const rows = reps.length ? reps.map(r => {
      const signed = !!(r.signedAt || (r.sigTech && r.sigClient));
      const who = [r.lastName, r.firstName].filter(Boolean).join(", ") || "Details not filled in";
      const res = r.result ? "<strong>" + esc(r.result) + "</strong>" : "No result yet";
      const fail = (r.exerciseFails || []).length ? " · exercise fail: " + esc(r.exerciseFails.join(", ")) : "";
      return "<div class=\"train\" data-fit-open=\"" + esc(r.id) + "\">"
        + "<div class=\"pouch\">" + (signed ? "✓" : "…") + "</div>"
        + "<div><div class=\"row-title\">" + esc(who) + " · " + esc(r.model || r.respirator || "Respirator not set") + "</div>"
        + "<div class=\"muted\">" + res + fail + (signed ? " · signed" : " · not signed") + (r.pdfName ? " · " + esc(r.pdfName) : "") + "</div></div>"
        + "<span class=\"badge " + (signed ? "s-ok" : "s-needs") + "\">" + (signed ? "Signed" : "In progress") + "</span></div>";
    }).join("") : "<div class=\"empty\">No fit-test reports yet. Add one from a PortaCount report photo, or enter the details by hand.</div>";
    const st = stageOf(ev);
    return "<div class=\"wrap\" id=\"fitEvent\">"
      + "<button class=\"btn ghost back-ctl\" onclick=\"openProject('" + ev.projectId + "')\">← Project events</button>"
      + "<div class=\"row\" style=\"margin-top:10px\"><div class=\"grow\">"
      + "<div class=\"muted\" onclick=\"openEditEvent('" + ev.id + "')\" style=\"cursor:pointer\">" + esc(p ? p.number + " · " + (p.name || "") : "") + " · tap to edit event</div>"
      + "<h2 class=\"brand-type\" style=\"margin:4px 0;color:var(--navy)\">" + esc(ev.code) + "</h2>"
      + "<div class=\"muted\">" + esc((root.eventTypeLabel && root.eventTypeLabel(ev)) || "Respirator fit testing") + (ev.date ? " · " + esc(ev.date) : "") + "</div>"
      + "</div>" + (root.eventBadge ? root.eventBadge(ev) : "") + "</div>"
      + "<div class=\"card\" style=\"margin-top:10px\">" + parentSel + "</div>"
      + "<div class=\"row\" style=\"margin:10px 0\">"
      + "<button type=\"button\" class=\"btn mid\" id=\"fitAddReport\">Add individual report</button>"
      + "<input id=\"fitNewPhoto\" type=\"file\" accept=\"image/*\" capture=\"environment\" hidden>"
      + "<button type=\"button\" class=\"btn mid\" id=\"fitAddManual\">Enter manually</button>"
      + "<button type=\"button\" class=\"btn green\" id=\"fitMarkComplete\">Mark event complete</button>"
      + (reps.some(r => r.signedAt || r.pdfBlob || r.pdfName) ? "<button type=\"button\" class=\"btn mid\" id=\"fitZip\">Download all (zip)</button>" : "")
      + "</div>"
      + rows
      + "<p class=\"help\">ENVSS Field v" + (root.APP_VERSION || VERSION) + " · Status follows signed reports, not samples. There is no laboratory COC for fit testing.</p>"
      + "</div>";
  }

  function wirePad(canvas, existing) {
    const ctx = canvas.getContext("2d");
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 700, h = canvas.clientHeight || 180;
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    if (existing) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, w, h); };
      img.src = existing;
    }
    let drawing = false, dirty = !!existing;
    function pos(ev) {
      const r = canvas.getBoundingClientRect();
      const t = ev.touches ? ev.touches[0] : ev;
      return { x: (t.clientX - r.left) * (w / r.width), y: (t.clientY - r.top) * (h / r.height) };
    }
    function start(ev) { ev.preventDefault(); drawing = true; dirty = true; const p = pos(ev); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
    function move(ev) { if (!drawing) return; ev.preventDefault(); const p = pos(ev); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    function end(ev) { if (!drawing) return; ev.preventDefault(); drawing = false; }
    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointerleave", end);
    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    return {
      clear: () => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); dirty = false; },
      isDirty: () => dirty,
      toDataURL: () => canvas.toDataURL("image/png")
    };
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      const ready = () => (src.indexOf("pdf-lib") >= 0 && (root.PDFLib || (typeof PDFLib !== "undefined" && PDFLib)))
        || (src.indexOf("jszip") >= 0 && (root.JSZip || (typeof JSZip !== "undefined" && JSZip)));
      if (ready()) return res();
      const existing = [...document.getElementsByTagName("script")].find(s => s.src === src || s.getAttribute("src") === src);
      if (existing && ready()) return res();
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => ready() || src ? res() : rej(new Error("Library loaded but the global was missing: " + src));
      s.onerror = () => rej(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
  }

  function downscaleBlob(file, maxEdge, quality) {
    return new Promise(function (res, rej) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, (maxEdge || 1600) / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => res(b || file), "image/jpeg", quality == null ? 0.72 : quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(file); };
      img.src = url;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  }
  function dataUrlToBase64(dataUrl) { return String(dataUrl || "").replace(/^data:[^;]+;base64,/, ""); }

  async function runOcr(rep, file) {
    rep.ocrStatus = "running";
    rep.ocrMessage = "Reading the photo…";
    try {
      const small = await downscaleBlob(file, 1600, 0.72);
      const dataUrl = await blobToDataUrl(small);
      const cfg = root.sbCfg && root.sbCfg();
      if (!cfg || !cfg.supabaseUrl) {
        rep.ocrStatus = "unavailable";
        rep.ocrMessage = "OCR not set up yet, enter manually";
        return;
      }
      const headers = (root.sbHeaders && root.sbHeaders()) || {};
      const res = await fetch(cfg.supabaseUrl + "/functions/v1/" + OCR_FN, {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, headers),
        body: JSON.stringify({ image: dataUrlToBase64(dataUrl), mime: "image/jpeg" })
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 503 || j.error === "OCR_NOT_CONFIGURED") {
        rep.ocrStatus = "not_configured";
        rep.ocrMessage = "OCR not set up yet, enter manually";
        return;
      }
      if (!res.ok) {
        rep.ocrStatus = "failed";
        rep.ocrMessage = j.message || "Could not read the photo. Enter the details manually, or retake it.";
        return;
      }
      const parsed = parseReport(j.text || "", { pages: j.pages, annotations: j.annotations, confidence: null });
      applyParsed(rep, parsed);
      rep.ocrText = j.text || "";
      if (parsed.ocrWords && parsed.ocrWords.length) rep.ocrWords = parsed.ocrWords;
      rep.ocrStatus = "ok";
      rep.ocrMessage = parsed.missing.length || parsed.flags.length
        ? "Check the highlighted fields against the photo."
        : "Fields were filled from the photo. Please check them before signing.";
    } catch (e) {
      rep.ocrStatus = "failed";
      rep.ocrMessage = "Could not reach OCR (" + (e && e.message || e) + "). Enter the details manually, or try again when you are online.";
    }
  }

  async function attachPhoto(rep, ev, file) {
    const small = await downscaleBlob(file, 1600, 0.72);
    delete rep.photoDataUrl;
    try {
      if (root.envssPhotos && root.envssPhotos.attach) {
        const host = { id: rep.id, eventId: ev.id, projectId: ev.projectId || rep.projectId, photoRefs: Object.assign({}, rep.photoRefs) };
        const ref = await root.envssPhotos.attach(small, host, "photo");
        rep.photoRefs = host.photoRefs || rep.photoRefs;
        if (ref && String(ref).indexOf("data:") === 0) {
          /* IndexedDB unavailable: keep only the already-downscaled last-resort copy. */
          rep.photoDataUrl = ref; rep.photo = "inline";
        } else {
          rep.photo = ref; delete rep.photoDataUrl;
        }
      } else {
        /* Last resort if the photo store is missing: a downscaled data URL, never the original. */
        rep.photoDataUrl = await blobToDataUrl(small);
        rep.photo = "inline";
      }
    } catch (e) {
      console.warn("[ENVSS] fit photo store", e);
      try { rep.photoDataUrl = await blobToDataUrl(small); } catch (e2) {}
      rep.photo = "inline";
    }
  }

  function openConfirm(rep) {
    view.page = "event";
    if (rep && rep.eventId) view.eventId = rep.eventId;
    view.fitScreen = "confirm";
    view.fitReportId = rep.id;
    if (typeof root.render === "function") root.render();
  }
  function openSign(rep) {
    view.page = "event";
    if (rep && rep.eventId) view.eventId = rep.eventId;
    view.fitScreen = "sign";
    view.fitReportId = rep.id;
    if (typeof root.render === "function") root.render();
  }

  async function startFromFile(ev, file, manual) {
    const rep = blankReport(ev);
    (db.fitReports || (db.fitReports = [])).push(rep);
    if (file) {
      await attachPhoto(rep, ev, file);
      if (!manual) await runOcr(rep, file);
      else { rep.ocrStatus = "skipped"; rep.ocrMessage = "Entered manually."; }
    } else {
      rep.ocrStatus = "skipped";
      rep.ocrMessage = "Entered manually. You can attach a photo with Retake photo.";
    }
    evLog(ev, "Fit-test report added", rep.lastName || "new report");
    save();
    openConfirm(rep);
  }

  async function jpegForPdf(rep) {
    let src = photoSrc(rep);
    if (!src) {
      const pid = photoPid(rep);
      if (pid && root.envssPhotos && root.envssPhotos.blobOf) {
        const blob = await root.envssPhotos.blobOf(pid);
        if (blob) src = await blobToDataUrl(blob);
      }
    }
    if (!src) return null;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const k = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL("image/jpeg", 0.62);
    return { data, w: c.width, h: c.height, bytes: dataUrlToBase64(data) };
  }

  function formatAwst(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return String(iso || "");
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Australia/Perth",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(d);
    const g = t => (parts.find(x => x.type === t) || {}).value || "";
    return g("day") + "/" + g("month") + "/" + g("year") + " " + g("hour") + ":" + g("minute") + " AWST";
  }


  function wrapPdfText(font, text, size, maxW) {
    const words = String(text == null ? "" : text).split(/\s+/);
    const lines = [];
    let cur = "";
    words.forEach(function (w) {
      if (!w && !cur) return;
      const t = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(t, size) <= maxW || !cur) cur = t;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  function fieldText(rep, key) {
    if (key === "testDate") {
      const d = (rep.testDate && rep.testDate.display) || rep.testDateDisplay || "";
      const t = rep.testTime || (rep.testDate && rep.testDate.time) || "";
      return t ? (d + " " + t) : d;
    }
    if (key === "dueDate") return (rep.dueDate && rep.dueDate.display) || rep.dueDateDisplay || "";
    if (key === "overallFf") return (rep.overallFf && rep.overallFf.raw) || rep.overallFf || "";
    if (key === "passLevel") return (rep.passLevel == null || rep.passLevel === "") ? "" : String(rep.passLevel);
    if (key === "approval" || key === "note") return trim(rep[key] || "");
    const v = rep[key];
    if (v == null) return "";
    if (typeof v === "object") return v.raw || v.display || "";
    return String(v);
  }
  async function buildReportPdf(rep, opts) {
    opts = opts || {};
    const signed = !!opts.signed;
    await loadScript(PDF_LIB);
    const lib = root.PDFLib || (typeof PDFLib !== "undefined" ? PDFLib : null);
    if (!lib) throw new Error("The PDF library did not load. Go online once, then try again.");
    const doc = await lib.PDFDocument.create();
    const a4 = (lib.PageSizes && lib.PageSizes.A4) || null;
    const page = a4 ? doc.addPage(a4) : doc.addPage();
    if (!a4) page.setSize(595.28, 841.89);
    const font = await doc.embedFont(lib.StandardFonts.Helvetica);
    const bold = await doc.embedFont(lib.StandardFonts.HelveticaBold);
    const black = lib.rgb(0, 0, 0);
    const grey = lib.rgb(0.15, 0.15, 0.15);
    const W = 595.28, H = 841.89, L = 36, R = W - 36;
    let y = H - 40;
    function text(str, x, yy, size, f, color) {
      page.drawText(String(str == null ? "" : str), { x: x, y: yy, size: size || 9, font: f || font, color: color || black });
    }
    function center(str, yy, size, f) {
      const s = String(str || ""), sz = size || 14;
      const w = (f || bold).widthOfTextAtSize(s, sz);
      text(s, Math.max(L, (W - w) / 2), yy, sz, f || bold);
    }
    function hline(yy) { page.drawLine({ start: { x: L, y: yy }, end: { x: R, y: yy }, thickness: 0.6, color: black }); }

    center("FIT TEST REPORT", y, 16, bold);
    y -= 18;
    const headerDate = fieldText(rep, "testDate") || (rep.testDate && rep.testDate.display) || fieldText(rep, "dueDate") || "";
    /* Header date on the TSI report is the test date (or the title date). */
    const titleDate = (rep.testDate && rep.testDate.display) || rep.testDateDisplay || "";
    if (titleDate) center(titleDate, y, 11, font);
    y -= 16;
    hline(y + 6);
    y -= 10;

    function labelVal(lab, val, x, yy, colW) {
      text(lab, x, yy, 7, bold, grey);
      const lines = wrapPdfText(font, val, 9, colW - 2);
      lines.forEach(function (ln, i) { text(ln, x, yy - 11 - i * 11, 9, font); });
      return yy - 11 - Math.max(1, lines.length) * 11 - 6;
    }

    /* Identity: five labels across, values underneath. */
    const idCols = [
      ["ID NUMBER", fieldText(rep, "idNumber")],
      ["LAST NAME", fieldText(rep, "lastName")],
      ["FIRST NAME", fieldText(rep, "firstName")],
      ["COMPANY", fieldText(rep, "company")],
      ["LOCATION", fieldText(rep, "location")]
    ];
    const colW = (R - L) / idCols.length;
    idCols.forEach(function (c, i) { text(c[0], L + i * colW, y, 7, bold, grey); });
    y -= 12;
    let idBottom = y;
    idCols.forEach(function (c, i) {
      const lines = wrapPdfText(font, c[1], 9, colW - 6);
      lines.forEach(function (ln, k) { text(ln, L + i * colW, y - k * 11, 9, font); });
      idBottom = Math.min(idBottom, y - Math.max(1, lines.length) * 11);
    });
    y = idBottom - 10;

    const half = (R - L - 16) / 2;
    const midX = L + half + 16;
    text("TEST DATE", L, y, 7, bold, grey);
    text("DUE DATE", midX, y, 7, bold, grey);
    y -= 12;
    text(fieldText(rep, "testDate"), L, y, 9, font);
    text(fieldText(rep, "dueDate"), midX, y, 9, font);
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
    const yLeftStart = y, yRightStart = y;
    let yL = y, yR = y;
    leftFields.forEach(function (c) { yL = labelVal(c[0], c[1], L, yL, half); });
    rightFields.forEach(function (c) { yR = labelVal(c[0], c[1], midX, yR, half); });
    y = Math.min(yL, yR) - 6;
    hline(y + 8);
    y -= 4;

    /* Exercise table */
    const xEx = L, xDur = L + 230, xFf = L + 340, xPass = L + 450;
    text("EXERCISE", xEx, y, 7, bold, grey);
    text("DURATION (sec)", xDur, y, 7, bold, grey);
    text("FIT FACTOR", xFf, y, 7, bold, grey);
    text("PASS", xPass, y, 7, bold, grey);
    y -= 8;
    hline(y + 4);
    y -= 12;
    const exRows = (rep.exercises || []).slice();
    exRows.push({
      exercise: "OVERALL FF",
      duration: "",
      fitFactorRaw: fieldText(rep, "overallFf"),
      pass: (rep.overallPass === true || rep.result === "PASS") ? "yes" : (rep.overallPass === false || rep.result === "FAIL") ? "no" : ""
    });
    exRows.forEach(function (ex) {
      const nameLines = wrapPdfText(font, ex.exercise || "", 9, xDur - xEx - 8);
      nameLines.forEach(function (ln, i) { text(ln, xEx, y - i * 11, 9, /OVERALL/i.test(ex.exercise || "") ? bold : font); });
      text(ex.duration || "", xDur, y, 9, font);
      const ff = ex.fitFactorRaw || (ex.fitFactor && ex.fitFactor.raw) || "";
      text(ff, xFf, y, 9, font);
      const p = ex.pass === "no" || ex.pass === "fail" ? "No" : ex.pass === "yes" || ex.pass === "pass" ? "Yes" : (ex.passRaw || "");
      text(p, xPass, y, 9, font);
      y -= Math.max(14, nameLines.length * 11 + 3);
    });
    y -= 8;

    text("FITTEST OPERATOR", L, y, 7, bold, grey);
    text("NOTE", midX, y, 7, bold, grey);
    y -= 12;
    text(fieldText(rep, "operator"), L, y, 9, font);
    const noteLines = wrapPdfText(font, fieldText(rep, "note"), 9, half);
    noteLines.forEach(function (ln, i) { text(ln, midX, y - i * 11, 9, font); });
    y -= 16;
    text("NAME", L, y, 7, bold, grey);
    y -= 12;
    text(fieldText(rep, "operatorName"), L, y, 9, font);
    y -= 22;

    /* Signature block — the only difference between signed and unsigned copies. */
    hline(y + 10);
    y -= 4;
    text("ENVSS technician", L, y, 8, bold);
    text("Client", midX, y, 8, bold);
    y -= 8;
    async function paintSig(data, x, boxW, boxH) {
      page.drawRectangle({ x: x, y: y - boxH, width: boxW, height: boxH, borderWidth: 0.5, borderColor: grey, color: lib.rgb(1, 1, 1) });
      if (!signed || !data) return;
      try {
        const b64 = String(data).replace(/^data:[^;]+;base64,/, "");
        const bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
        const img = String(data).indexOf("image/jpeg") >= 0 ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
        const iw = boxW - 6, ih = Math.min(boxH - 6, iw * (img.height / img.width));
        page.drawImage(img, { x: x + 3, y: y - ih - 3, width: iw, height: ih });
      } catch (e) {}
    }
    const boxH = 52, boxW = half - 4;
    await paintSig(rep.sigTech, L, boxW, boxH);
    await paintSig(rep.sigClient, midX, boxW, boxH);
    y -= boxH + 12;
    const techName = signed ? (fieldText(rep, "operatorName") || "") : "";
    const signedDisp = signed && rep.signedAt ? formatAwst(rep.signedAt) : "";
    text("Name: " + techName, L, y, 8, font);
    text("Name: ", midX, y, 8, font);
    y -= 12;
    text("Date: " + signedDisp, L, y, 8, font);
    text("Date: " + signedDisp, midX, y, 8, font);

    const bytes = await doc.save();
    let name = fileNameFor(Object.assign({}, rep, { testDate: rep.testDate || parseTsiDate(rep.testDateDisplay || rep.testDateRaw) }));
    if (!signed) name = name.replace(/\.pdf$/i, "_unsigned.pdf");
    const blob = new Blob([bytes], { type: "application/pdf" });
    return { blob: blob, name: name, bytes: bytes.byteLength };
  }
  async function buildPdf(rep, ev) {
    return buildReportPdf(rep, { signed: !!(rep && (rep.signedAt || (rep.sigTech && rep.sigClient))) });
  }

  function downloadBlob(blob, name) {
    if (typeof root.download === "function") { root.download(blob, name); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function finishPdf(rep, ev, signed) {
    const out = await buildReportPdf(rep, { signed: signed !== false && !!(rep.signedAt || (rep.sigTech && rep.sigClient)) });
    rep.pdfName = out.name;
    rep.pdfBytes = out.bytes;
    evLog(ev, "Fit-test PDF created", out.name + " (" + out.bytes + " bytes)");
    save();
    try {
      if (root.envssDrive && root.envssDrive.enqueueExport) root.envssDrive.enqueueExport(out.blob, out.name);
    } catch (e) { console.warn("[ENVSS] fit drive enqueue", e); }
    downloadBlob(out.blob, out.name);
    return out;
  }

  async function zipAll(ev) {
    const reps = reportsOf(ev.id).filter(r => r.signedAt || r.sigTech);
    if (!reps.length) { alert("Sign at least one report first."); return; }
    await loadScript(ZIP_LIB);
    const JSZ = root.JSZip || (typeof JSZip !== "undefined" ? JSZip : null);
    if (!JSZ) throw new Error("The zip library did not load. Go online once, then try again.");
    const zip = new JSZ();
    const used = [];
    for (const r of reps) {
      const out = await buildReportPdf(r, { signed: !!(r.signedAt || (r.sigTech && r.sigClient)) });
      let name = out.name;
      if (root.envssDrive && root.envssDrive.versionedName) name = root.envssDrive.versionedName(name, used);
      else if (used.indexOf(name) >= 0) name = name.replace(/\.pdf$/i, "_2.pdf");
      used.push(name);
      zip.file(name, out.blob);
    }
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const zipName = ev.code + "_Fit-Tests.zip";
    try { if (root.envssDrive && root.envssDrive.enqueueExport) root.envssDrive.enqueueExport(blob, zipName); } catch (e) {}
    downloadBlob(blob, zipName);
    evLog(ev, "Fit-test zip downloaded", zipName);
    save();
  }

  function hookUi() {
    const _etl = root.eventTypeLabel;
    root.eventTypeLabel = function (e) {
      if (isFitEvent(e)) return "Respirator fit testing";
      return _etl ? _etl(e) : (e && e.type === "fibre" ? "Airborne fibre monitoring" : "Hygiene event");
    };
    root.window && (root.eventTypeLabel = root.eventTypeLabel);

    const _neh = root.newEventHtml;
    if (_neh) {
      root.newEventHtml = function () {
        let html = _neh.apply(this, arguments);
        if (html.indexOf("value=\"fit\"") === -1) {
          html = html.replace("<option value=\"fibre\">Airborne fibre monitoring (AFM)</option>",
            "<option value=\"fibre\">Airborne fibre monitoring (AFM)</option>\n      <option value=\"fit\">Respirator fit testing</option>");
        }
        if (html.indexOf("id=\"fitEventFields\"") === -1) {
          html = html.replace("<div class=\"footer-actions\">",
            "<div id=\"fitEventFields\" style=\"display:none\">"
            + "<p class=\"help\">Code: {job}-FIT-001, 002, … — a sibling event under this job, not a hygiene -001 number. You can link it to today’s hygiene event after it is created. There is no laboratory COC for fit testing.</p>"
            + "</div><div class=\"footer-actions\">");
        }
        return html;
      };
    }
    const _tog = root.toggleEventTypeFields;
    root.toggleEventTypeFields = function () {
      if (_tog) _tog.apply(this, arguments);
      const type = (document.getElementById("ntype") || {}).value;
      const box = document.getElementById("fitEventFields");
      const fibre = document.getElementById("fibreEventFields");
      const hyg = document.getElementById("hygieneEventFields");
      if (box) box.style.display = type === "fit" ? "" : "none";
      if (type === "fit") {
        if (fibre) fibre.style.display = "none";
        if (hyg) hyg.style.display = "none";
      }
    };
    root.toggleEventTypeFields = root.toggleEventTypeFields;

    const _ce = root.createEvent;
    root.createEvent = function () {
      const type = (document.getElementById("ntype") || {}).value || "hygiene";
      if (type !== "fit") return _ce ? _ce.apply(this, arguments) : null;
      const projectId = view.projectId;
      const p = root.project && root.project(projectId);
      if (!p) { alert("Open a project first."); return; }
      const date = (document.getElementById("ndate") || {}).value || "";
      const ev = {
        id: uid("e"), projectId, type: "fit", stage: "planned", date,
        code: fitEventCode(p, nextFitSeq(projectId)),
        multiDay: false, notes: "", uploadReady: false, operators: [], parentEventId: "",
        audit: []
      };
      db.events.push(ev);
      evLog(ev, "Fit-testing event created", ev.code);
      save();
      if (typeof root.openEvent === "function") root.openEvent(ev.id);
      return ev;
    };
    root.createEvent = root.createEvent;

    const _des = root.deriveEventStage;
    root.deriveEventStage = function (ev) {
      if (isFitEvent(ev)) return stageOf(ev);
      return _des ? _des(ev) : "planned";
    };

    const _coc = root.createCoc;
    if (_coc) {
      root.createCoc = async function () {
        const ev = root.eventById && root.eventById(view.eventId);
        if (isFitEvent(ev)) { alert("Fit-testing events do not have a laboratory COC."); return false; }
        return _coc.apply(this, arguments);
      };
      root.createCoc = root.createCoc;
    }
    const _mark = root.markEventUpload;
    root.markEventUpload = function (id) {
      const ev = root.eventById && root.eventById(id);
      if (!isFitEvent(ev)) return _mark ? _mark.apply(this, arguments) : null;
      const reps = reportsOf(ev.id);
      if (!reps.length) { alert("Add and sign at least one fit-test report before marking this event complete."); return; }
      const unsigned = reps.filter(r => !(r.signedAt || (r.sigTech && r.sigClient)));
      if (unsigned.length) { alert("This event cannot be marked complete until every report is signed.\nUnsigned: " + unsigned.length + "."); return; }
      ev.uploadReady = true;
      evLog(ev, "Marked event complete", "All fit-test reports signed");
      saveQuiet();
      if (typeof root.render === "function") root.render();
      alert("Event marked complete.");
    };

    const _opt = root.openPickType;
    root.openPickType = function (eventId) {
      const ev = root.eventById && root.eventById(eventId);
      if (isFitEvent(ev)) { const inp = document.getElementById("fitNewPhoto"); if (inp) inp.click(); else startFromFile(ev, null, true); return; }
      return _opt ? _opt.apply(this, arguments) : null;
    };

    const _eh = root.eventHtml;
    root.eventHtml = function () {
      const ev = root.eventById && root.eventById(view.eventId);
      if (ev && isFitEvent(ev)) {
        if (view.fitScreen === "confirm") {
          const rep = reportById(view.fitReportId);
          if (rep) return confirmHtml(rep, ev);
        }
        if (view.fitScreen === "sign") {
          const rep = reportById(view.fitReportId);
          if (rep) return signHtml(rep, ev);
        }
        view.fitScreen = "";
        return eventFitHtml(ev);
      }
      let html = _eh ? _eh.apply(this, arguments) : "";
      return html;
    };

    const _bind = root.bind;
    root.bind = function () {
      if (_bind) _bind.apply(this, arguments);
      const ev = root.eventById && root.eventById(view.eventId);
      if (!ev || !isFitEvent(ev)) return;
      const parent = document.getElementById("fitParent");
      if (parent) parent.onchange = () => { ev.parentEventId = parent.value || ""; evLog(ev, "Linked hygiene event", ev.parentEventId || "cleared"); saveQuiet(); };
      const add = document.getElementById("fitAddReport");
      const inp = document.getElementById("fitNewPhoto") || document.getElementById("fitPhotoInput");
      if (add && document.getElementById("fitNewPhoto")) add.onclick = () => document.getElementById("fitNewPhoto").click();
      const newInp = document.getElementById("fitNewPhoto");
      if (newInp && !newInp.dataset.bound) {
        newInp.dataset.bound = "1";
        newInp.onchange = () => { const f = newInp.files && newInp.files[0]; newInp.value = ""; if (f) startFromFile(ev, f, false); };
      }
      const man = document.getElementById("fitAddManual");
      if (man) man.onclick = () => startFromFile(ev, null, true);
      const mark = document.getElementById("fitMarkComplete");
      if (mark) mark.onclick = () => root.markEventUpload(ev.id);
      const zip = document.getElementById("fitZip");
      if (zip) zip.onclick = () => zipAll(ev).catch(e => alert(e.message || String(e)));
      document.querySelectorAll("[data-fit-open]").forEach(row => {
        row.onclick = () => { const r = reportById(row.getAttribute("data-fit-open")); if (r) openConfirm(r); };
      });
      const backEv = document.getElementById("fitBackEvent");
      if (backEv) backEv.onclick = () => { view.fitScreen = ""; view.fitReportId = ""; root.render(); };
      const retake = document.getElementById("fitRetake");
      const retakeInp = document.getElementById("fitPhotoInput");
      if (retake && retakeInp) {
        retake.onclick = () => retakeInp.click();
        if (!retakeInp.dataset.bound) {
          retakeInp.dataset.bound = "1";
          retakeInp.onchange = async () => {
            const f = retakeInp.files && retakeInp.files[0];
            retakeInp.value = "";
            const rep = reportById(view.fitReportId);
            if (!f || !rep) return;
            await attachPhoto(rep, ev, f);
            await runOcr(rep, f);
            evLog(ev, "Fit-test photo retaken", "");
            save();
            openConfirm(rep);
          };
        }
      }
      const addEx = document.getElementById("fitAddEx");
      if (addEx) addEx.onclick = () => {
        const rep = reportById(view.fitReportId);
        if (!rep) return;
        collectForm(rep);
        rep.exercises = (rep.exercises || []).concat([{ exercise: "", duration: "", fitFactorRaw: "", pass: "" }]);
        saveQuiet();
        openConfirm(rep);
      };
      const draft = document.getElementById("fitSaveDraft");
      if (draft) draft.onclick = async () => {
        const rep = reportById(view.fitReportId);
        if (!rep) return;
        collectForm(rep);
        evLog(ev, "Fit-test report saved", "unsigned draft");
        save();
        try {
          draft.disabled = true;
          await finishPdf(rep, ev, false);
        } catch (e) {
          alert(e.message || String(e));
        } finally {
          draft.disabled = false;
        }
        view.fitScreen = "";
        root.render();
      };
      const toSign = document.getElementById("fitToSign");
      if (toSign) toSign.onclick = () => {
        const rep = reportById(view.fitReportId);
        if (!rep) return;
        collectForm(rep);
        if (!trim(rep.lastName) || !trim(rep.firstName)) { alert("Enter the worker’s last and first name before signing."); return; }
        saveQuiet();
        openSign(rep);
      };
      const backC = document.getElementById("fitBackConfirm");
      if (backC) backC.onclick = () => { const r = reportById(view.fitReportId); if (r) openConfirm(r); };
      const techC = document.getElementById("fitSigTech");
      const cliC = document.getElementById("fitSigClient");
      let pads = null;
      if (techC && cliC) {
        const rec = reportById(view.fitReportId);
        pads = { tech: wirePad(techC, rec && rec.sigTech), client: wirePad(cliC, rec && rec.sigClient) };
        const ct = document.getElementById("fitClearTech");
        const cc = document.getElementById("fitClearClient");
        if (ct) ct.onclick = () => pads.tech.clear();
        if (cc) cc.onclick = () => pads.client.clear();
      }
      const make = document.getElementById("fitMakePdf");
      if (make) make.onclick = async () => {
        const rep = reportById(view.fitReportId);
        if (!rep || !pads) return;
        if (!pads.tech.isDirty() || !pads.client.isDirty()) { alert("Both the ENVSS technician and the client need to sign."); return; }
        rep.sigTech = pads.tech.toDataURL();
        rep.sigClient = pads.client.toDataURL();
        rep.signedAt = new Date().toISOString();
        evLog(ev, "Fit-test report signed", [rep.lastName, rep.firstName].filter(Boolean).join(", "));
        save();
        try {
          make.disabled = true;
          await finishPdf(rep, ev);
          view.fitScreen = "";
          root.render();
        } catch (e) {
          make.disabled = false;
          alert(e.message || String(e));
        }
      };
    };

    if (root.envssFit && typeof root.envssFit === "object") {
      /* keep */
    }
    const pl = root.envssProjlist;
    /* typeLab is inside review.js IIFE; patched in review.js source. */
  }

  function injectCss() {
    if (document.getElementById("fitTestCss")) return;
    const st = document.createElement("style");
    st.id = "fitTestCss";
    st.textContent = ".fit-grid{display:grid;grid-template-columns:minmax(220px,1fr) 1.4fr;gap:14px;margin-top:10px}"
      + "@media(max-width:800px){.fit-grid{grid-template-columns:1fr}}"
      + ".fit-photo-col img{width:100%;max-height:70vh;object-fit:contain;border-radius:10px;background:#0b1020}"
      + ".fit-fields label,.fit-screen label{display:block;margin:8px 0 0;font-weight:700}"
      + ".fit-fields input,.fit-fields textarea,.fit-fields select,.fit-screen select{width:100%;box-sizing:border-box}"
      + ".fit-low{background:#3A1616;border-radius:10px;padding:6px 8px;color:#FFC9C4}"
      + ".fit-flags{color:#FFD9A8;font-weight:600}.fit-warn{color:#FFC9C4;font-weight:700}"
      + ".fit-ex-wrap{overflow:auto}.fit-ex{width:100%;border-collapse:collapse;font-size:13px}"
      + ".fit-ex th,.fit-ex td{padding:4px;border-bottom:1px solid var(--edge,#3A4A7A)}"
      + ".fit-sig{width:100%;height:180px;background:#fff;border:2px solid var(--edge,#3A4A7A);border-radius:12px;touch-action:none}"
      + ".s-ok{background:#E5F4EE;color:#1F6B4A}.s-needs{background:#FFF4E5;color:#8A4B08}";
    document.head.appendChild(st);
  }

  function boot() {
    installSync();
    injectCss();
    hookUi();
    root.isFitEvent = isFitEvent;
    api.reportsOf = reportsOf;
    api.stageOf = stageOf;
    api.applyParsed = applyParsed;
    api.startFromFile = startFromFile;
    api.buildPdf = buildPdf;
    api.buildReportPdf = buildReportPdf;
    api.zipAll = zipAll;
    api.blankReport = blankReport;
    api.runOcr = runOcr;
    root.envssFit = api;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof window !== "undefined" ? window : globalThis);
