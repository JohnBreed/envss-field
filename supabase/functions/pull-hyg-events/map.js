/* Read-only mapping of a HYG Assessment Events Podio item (app 24280319)
   into the payload stored on envss_podio_events. No Podio writes. */

export function cleanText(v) {
  return String(v == null ? "" : v).replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim();
}

export function htmlToText(v) {
  return String(v == null ? "" : v)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function rawValue(v0) {
  if (!v0 || typeof v0 !== "object") return v0;
  if (v0.value && typeof v0.value === "object") {
    if (v0.value.text && !v0.value.title) return v0.value.text;
    return v0.value;
  }
  if (v0.start || v0.start_date) return { start: v0.start || v0.start_date };
  if (v0.value != null) return v0.value;
  return v0;
}

/* Accept either a Podio API item (fields is an array) or the decoded mirror shape (fields is an object). */
export function fieldBag(item) {
  const fields = item && item.fields;
  if (Array.isArray(fields)) {
    const out = {};
    fields.forEach(f => {
      if (!f || !f.external_id) return;
      const values = f.values || [];
      out[f.external_id] = values.length > 1 ? values.map(rawValue) : rawValue(values[0]);
    });
    return out;
  }
  if (fields && typeof fields === "object") return fields;
  return item || {};
}

export function textOf(v) {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return cleanText(v);
  if (Array.isArray(v)) return textOf(v[0]);
  if (typeof v === "object") {
    if (v.title) return cleanText(v.title);
    if (v.text && !v.value) return cleanText(v.text);
    if (v.value != null && typeof v.value !== "object") return cleanText(v.value);
  }
  return "";
}

export function dateOf(v) {
  if (!v) return "";
  const s = typeof v === "string" ? v : (v.start || v.start_date || "");
  const m = String(s).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

export function relOf(v) {
  if (!v) return { title: "", itemId: "" };
  if (Array.isArray(v)) return relOf(v[0]);
  if (typeof v === "string") return { title: cleanText(v), itemId: "" };
  return { title: cleanText(v.title || ""), itemId: v.item_id || v.itemId || "" };
}

export function jobNumberFrom(reference, projectTitle, jobCalc) {
  const sources = [reference, projectTitle];
  for (let i = 0; i < sources.length; i++) {
    const m = String(sources[i] || "").match(/^(\d{7})(?!\d)/);
    if (m) return m[1];
  }
  const n = Number(jobCalc && typeof jobCalc === "object" ? jobCalc.value : jobCalc);
  if (Number.isFinite(n) && n >= 0 && n < 10000000) return String(Math.round(n)).padStart(7, "0");
  return "";
}

/* selection (Laboratory Turnaround Time) is deleted in Podio and usually empty.
   Map it when a value is still present. Hygiene COC codes: standard | same_day | 1_day | 2_day | 3_day. */
export function mapTurnaround(label) {
  const s = String(label || "").toLowerCase();
  if (!s) return "";
  if (/emergency|same\s*day/.test(s)) return "same_day";
  if (/next day|\b1\s*day|0700/.test(s)) return "1_day";
  if (/\b2\s*day/.test(s)) return "2_day";
  if (/\b3\s*day|normal/.test(s)) return "3_day";
  if (/standard/.test(s)) return "standard";
  return "";
}

export function isPlanned(p) {
  const start = String(p.startStatus || "");
  if (/not required/i.test(start)) return false;
  if (p.cocStatus === "Lab Results Received") return false;
  if (p.reportStatus === "Report Sent") return false;
  if (!start) return true;
  return /tentative|confirmed/i.test(start);
}

export function mapItem(item) {
  const f = fieldBag(item);
  const project = f.project;
  const projectTitle = project && typeof project === "object" ? cleanText(project.title) : cleanText(project);
  const reference = textOf(f["reference-3"]);
  const jobNumber = jobNumberFrom(reference, projectTitle, f["job-number"]);
  const turnaroundLabel = textOf(f.selection);
  const lab = relOf(f["which-laboratory-is-processing-samples"]);
  const attended = relOf(f["report-submitted-by"]);
  const taskRaw = f["task-description"];
  const equipRaw = f["equipment-details"];
  const payload = {
    itemId: String((item && (item.item_id || item.itemId)) || ""),
    reference,
    fieldCode: /^\d{7}-\d{3}$/.test(reference) ? reference : "",
    jobNumber,
    projectItemId: project && typeof project === "object" && project.item_id ? String(project.item_id) : "",
    projectTitle,
    startDate: dateOf(f["site-works-start-date"]),
    startStatus: textOf(f["site-works-start-date-status"]),
    siteContact: textOf(f["site-contact-namephone"]),
    poc: {
      company: textOf(f.company),
      first: textOf(f["first-name"]),
      last: textOf(f["last-name"]),
      role: textOf(f["job-role"]),
      phone: textOf(f["contact-number"]),
      email: textOf(f.email)
    },
    task: htmlToText(typeof taskRaw === "string" ? taskRaw : textOf(taskRaw)),
    turnaroundLabel,
    turnaround: mapTurnaround(turnaroundLabel),
    lab: lab.title,
    labItemId: lab.itemId ? String(lab.itemId) : "",
    attendedBy: attended.title,
    cocStatus: textOf(f["generate-report"]),
    reportStatus: textOf(f["generate-final-report"]),
    equipment: htmlToText(typeof equipRaw === "string" ? equipRaw : textOf(equipRaw)),
    driveLink: textOf(f["google-drive-job-folder-link"]),
    fieldSheetLink: textOf(f["field-sheet-link"])
  };
  payload.planned = isPlanned(payload);
  return payload;
}
