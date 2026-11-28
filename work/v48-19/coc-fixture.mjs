/* Shared fixture for the CoC send tests and the before/after CoC format comparison. Made-up names only. */
export const PF_=0;
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
export const TODAY = PF.format(new Date());
export const TOMORROW = PF.format(new Date(Date.now() + 86400000 * 1.0));
export const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
export const SECRET = { tech: "Taylor Tester", techMail: "taylor.tester@envss.com.au", worker: "Testone", client: "Acme Mining Pty", project: "Secret Hill Expansion", mobile: "0419628710" };
export const person = (first, last) => ({ first, last, sex: "male", sexSet: true, dob: "1985-03-04", occupation: "Fitter", company: SECRET.client, hours: "12", daysOn: "8", daysOff: "6" });
const aud = [{ at: at(6, 0), action: "START pressed", who: SECRET.tech + " <" + SECRET.techMail + ">" }];
export const H = (id, n, extra) => Object.assign({ id, eventId: "eC", trainKind: "airborne_personal", mode: "personal", sampleNo: n, pouch: String(n), contaminantId: "INH", pumpSerial: "7700" + n, headId: "IESS-" + id, mediaId: "C-10" + n,
  startFlow: "2.0", endFlow: "2.0", rotameter: "FR4A40BNBN-NL-02", shiftDate: TODAY, shiftKind: "day", status: "ended", startAt: at(6, 0), endAt: at(13, 0), comments: "", location: "Mill floor",
  person: person("Sam", SECRET.worker), rpd: {}, hpd: {}, audit: aud.slice() }, extra || {});
export function fixture(over) {
  over = over || {};
  const trains = [
    H("s1", 1), H("s2", 2, { contaminantId: "RES", analyses: [{ code: "RES", name: "Respirable dust" }, { code: "SIL", name: "Crystalline silica" }] }),
    H("s3", 3, { trainKind: "airborne_static", mode: "static", location: "Bay 2", startFlow: "2.0", endFlow: "1.9" }),
    H("s4", 4, { status: "rejected", rejectCode: "damaged_filter", rejectAsked: "yes", rejectReason: "Damaged filter", endAt: "", endFlow: "" }),
    H("sb", 0, { trainKind: "blank", mode: "blank", mediaId: "C-BLANK", sampleNo: 0, pouch: "0", startAt: "", endAt: "", startFlow: "", endFlow: "", location: "", person: {}, audit: [] })
  ].concat(over.extraTrains || []);
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }, { id: "RES", name: "Respirable dust", code: "RES", kind: "airborne", headHint: "IESS", flowTolPct: 5, defaultFlow: "2.5" }, { id: "SIL", name: "Crystalline silica", code: "SIL", kind: "airborne", flowTolPct: 5, defaultFlow: "2.5" }],
      pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p1", number: over.job || "0019358", name: SECRET.project, source: "field", site: "Pit 4", client: SECRET.client }],
    events: [{ id: "eC", projectId: "p1", code: "0019358-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] }],
    trains, deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
  };
}
