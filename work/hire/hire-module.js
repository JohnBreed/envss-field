/* ===== v45b-hire (local unpublished): equipment hire-request screen =====
   - Launch from the dashboard without opening a project first.
   - Jobs: pick an active Podio-synced (or field) project by seven-digit job number.
   - Leads: enter/search a unique lead number; do NOT create a fake job/project.
   - Offline queue + sync via COLLS "hires" -> envss_hires (SQL draft only until John applies it).
   - Versioned resubmit: same request_group_id, incremented version, previous is_latest=false.
   - Suppliers enabled: Air-Met, NVMS. ETS / Mérieux listed as coming soon (disabled).
   - Catalog stub until /workspace/envss-invoicing/hire-catalog/ is filled.
   - Never emails hire companies. Never writes Podio. Never touches Google Sheets.
   Live rollback target remains a710ca9 / v45a. This layer is local-only until John publishes. */
(function () {
  "use strict";

  /* Drop-in catalog shape. Later JSON can replace HIRE_CATALOG without a redesign.
     key: stable id for a line; label: exact supplier invoice/quote wording when known;
     rateNote: reference only — v1 never calculates billing. */
  var HIRE_CATALOG = {
    suppliers: [
      { id: "air-met", name: "Air-Met", enabled: true },
      { id: "nvms", name: "NVMS", enabled: true },
      { id: "ets", name: "ETS", enabled: false, note: "Rates being catalogued" },
      { id: "merieux", name: "Mérieux", enabled: false, note: "Rates being catalogued" }
    ],
    items: {
      /* Pending full catalog wording/rates from the 6 Nov 2026 NVMS pricelist. */
      "nvms": [
        { key: "nvms-4448-dosi", label: "4448 Dosi (pending full catalog wording)", pending: true },
        { key: "nvms-2250-slm", label: "2250 SLM (pending full catalog wording)", pending: true }
      ],
      /* Air-Met: drop-down empty until real invoice wording exists; free-text always available. */
      "air-met": []
    }
  };
  window.HIRE_CATALOG = HIRE_CATALOG;

  function ensureHires() {
    if (!Array.isArray(db.hires)) db.hires = [];
    return db.hires;
  }

  function hireById(id) {
    return ensureHires().find(function (h) { return h && h.id === id; }) || null;
  }

  function latestHires() {
    return ensureHires().filter(function (h) { return h && h.is_latest !== false; })
      .sort(function (a, b) { return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")); });
  }

  function versionsOf(groupId) {
    return ensureHires().filter(function (h) { return h && h.request_group_id === groupId; })
      .sort(function (a, b) { return (b.version || 0) - (a.version || 0); });
  }

  function activeJobs() {
    return (db.projects || []).filter(function (p) {
      if (!p) return false;
      try { return typeof activeProject === "function" ? activeProject(p) : true; } catch (e) { return true; }
    }).sort(function (a, b) { return String(b.number || "").localeCompare(String(a.number || "")); });
  }

  function jobByNumber(num) {
    var n = String(num || "").trim();
    if (!n) return null;
    return (db.projects || []).find(function (p) { return String(p.number || "") === n; }) || null;
  }

  function defaultRequester() {
    var o = getOperator();
    if (o && (o.name || o.email)) return o.email ? (o.name + " <" + o.email + ">") : o.name;
    try {
      var sess = getSession();
      if (sess && sess.user) {
        var u = sess.user;
        return u.email ? ((u.name || u.email) + " <" + u.email + ">") : (u.name || "");
      }
    } catch (e) {}
    return whoText();
  }

  function supplierName(id) {
    var s = HIRE_CATALOG.suppliers.find(function (x) { return x.id === id; });
    return s ? s.name : id;
  }

  function itemsFor(supplierId) {
    return (HIRE_CATALOG.items[supplierId] || []).slice();
  }

  function blankLine() {
    return { catalog_key: "", label: "", quantity: 1, is_free_text: false, flagged: false };
  }

  function blankDraft(base) {
    var o = {
      id: "",
      request_group_id: "",
      version: 1,
      is_latest: true,
      supplier: "air-met",
      ref_type: "job",
      job_number: "",
      lead_number: "",
      project_id: "",
      on_hire_date: "",
      off_hire_date: "",
      logistics: "delivery",
      delivery_site: "",
      requested_by: defaultRequester(),
      lines: [blankLine()],
      createdAt: "",
      updatedAt: "",
      source: "field"
    };
    if (base) {
      Object.keys(base).forEach(function (k) { if (base[k] !== undefined) o[k] = base[k]; });
      o.lines = (base.lines || [blankLine()]).map(function (ln) {
        return {
          catalog_key: ln.catalog_key || "",
          label: ln.label || "",
          quantity: Number(ln.quantity) || 1,
          is_free_text: !!ln.is_free_text,
          flagged: !!ln.flagged
        };
      });
    }
    return o;
  }

  function openHireList() {
    view.page = "hireList";
    view.hireId = null;
    view.hireDraft = null;
    render();
  }
  function openHireNew() {
    view.page = "hireForm";
    view.hireId = null;
    view.hireDraft = blankDraft();
    view.hireDraft.request_group_id = uid("hg");
    view.hireMode = "new";
    render();
  }
  function openHireEdit(id) {
    var h = hireById(id);
    if (!h) { alert("Hire request not found on this device."); return; }
    view.page = "hireForm";
    view.hireId = id;
    view.hireDraft = blankDraft(h);
    view.hireMode = "version"; /* saving creates a new linked version */
    render();
  }

  function hireListHtml() {
    var list = latestHires();
    var html = "<div class=\"wrap\">";
    html += "<button class=\"btn ghost\" type=\"button\" id=\"btnHireBackDash\">← Projects</button>";
    html += "<div class=\"row\" style=\"margin-top:10px\"><div class=\"grow\"><h2 class=\"brand-type\" style=\"margin:0;color:var(--navy)\">Hire requests</h2>";
    html += "<p class=\"help\" style=\"margin:4px 0 0\">Central launch for equipment hire — jobs and leads. Offline saves sync when you are back online.</p></div>";
    html += "<button class=\"btn orange\" type=\"button\" id=\"btnHireNew\">New hire request</button></div>";
    if (!list.length) {
      html += "<div class=\"empty\">No hire requests on this device yet.</div>";
    } else {
      list.forEach(function (h) {
        var ref = h.ref_type === "lead"
          ? ("Lead " + (h.lead_number || "—"))
          : ("Job " + (h.job_number || "—"));
        var lines = (h.lines || []).map(function (ln) { return (ln.quantity || 1) + "× " + (ln.label || "(blank)"); }).join(", ");
        var flag = (h.lines || []).some(function (ln) { return ln.flagged || ln.is_free_text; });
        html += "<button type=\"button\" class=\"card open-hire\" data-hire=\"" + esc(h.id) + "\" style=\"display:block;width:100%;text-align:left\">";
        html += "<div class=\"row\"><div class=\"grow\">";
        html += "<div class=\"brand-type\" style=\"font-weight:700;color:var(--navy);font-size:17px\">" + esc(supplierName(h.supplier)) + " · " + esc(ref) + "</div>";
        html += "<div class=\"muted\">v" + (h.version || 1) + (flag ? " · free-text flagged" : "") + " · " + esc(h.logistics || "") + "</div>";
        html += "<div class=\"muted\">" + esc(lines || "No lines") + "</div>";
        html += "<div class=\"muted\">" + esc(h.on_hire_date || "?") + " → " + esc(h.off_hire_date || "?") + " · " + esc(h.requested_by || "") + "</div>";
        html += "</div></div></button>";
      });
    }
    html += "<p class=\"help\">ENVSS Field v" + APP_VERSION + " · hire (local unpublished). Opening a request and saving creates a new version.</p>";
    html += "</div>";
    return html;
  }

  function logisticsLabel(v) {
    if (v === "delivery") return "Delivery";
    if (v === "pickup") return "Pickup";
    if (v === "already_holding") return "Already holding (kit kept between same-week jobs)";
    return v || "";
  }

  function hireFormHtml() {
    var d = view.hireDraft || blankDraft();
    var mode = view.hireMode === "version" ? "version" : "new";
    var jobs = activeJobs();
    var items = itemsFor(d.supplier);
    var html = "<div class=\"wrap\">";
    html += "<button class=\"btn ghost\" type=\"button\" id=\"btnHireBackList\">← Hire requests</button>";
    html += "<h2 class=\"brand-type\" style=\"color:var(--navy)\">" + (mode === "version" ? "Resubmit hire request (new version)" : "New hire request") + "</h2>";
    if (mode === "version") {
      html += "<p class=\"help\">Editing version " + (d.version || 1) + " of group " + esc(d.request_group_id) + ". Save creates version " + ((d.version || 1) + 1) + ". Latest version counts.</p>";
    }
    html += "<p class=\"help\"><strong>Holding kit:</strong> a separate quote/request is still needed for each job even when physically holding the same kit. Chargeable days follow use, not idle hold days. (No billing calculation in this screen.)</p>";

    html += "<label>Supplier</label><select id=\"hireSupplier\">";
    HIRE_CATALOG.suppliers.forEach(function (s) {
      html += "<option value=\"" + esc(s.id) + "\"" + (d.supplier === s.id ? " selected" : "") + (s.enabled ? "" : " disabled") + ">"
        + esc(s.name) + (s.enabled ? "" : " (coming soon)") + "</option>";
    });
    html += "</select>";
    if (!(HIRE_CATALOG.items[d.supplier] || []).length && d.supplier === "air-met") {
      html += "<p class=\"help\">Air-Met catalog wording is not loaded yet — pick Free text on each line, or wait for the supplier catalog drop-in.</p>";
    }
    if (d.supplier === "nvms") {
      html += "<p class=\"help\">NVMS list is a stub from the 6 Nov 2026 pricelist (4448 Dosi, 2250 SLM) pending full catalog wording/rates.</p>";
    }

    html += "<label>Reference type</label><div class=\"filters\" id=\"hireRefType\">";
    [["job", "Job (seven-digit)"], ["lead", "Lead (no project yet)"]].forEach(function (pair) {
      html += "<button type=\"button\" class=\"chip" + (d.ref_type === pair[0] ? " on" : "") + "\" data-hire-ref=\"" + pair[0] + "\">" + pair[1] + "</button>";
    });
    html += "</div>";

    if (d.ref_type === "job") {
      html += "<label>Job number</label><select id=\"hireJob\">";
      html += "<option value=\"\">Select an active project…</option>";
      jobs.forEach(function (p) {
        var sel = String(p.number || "") === String(d.job_number || "") ? " selected" : "";
        html += "<option value=\"" + esc(p.number || "") + "\" data-pid=\"" + esc(p.id) + "\"" + sel + ">"
          + esc(p.number || "") + " — " + esc(p.name || p.client || "") + "</option>";
      });
      html += "</select>";
      html += "<p class=\"help\">Active jobs from the Podio-synced project list (and any field-created projects). Podio rows stay read-only.</p>";
    } else {
      html += "<label>Lead number</label><input id=\"hireLead\" value=\"" + esc(d.lead_number || "") + "\" placeholder=\"Unique lead number\" autocomplete=\"off\">";
      html += "<p class=\"help\"><strong>Lead lookup blocker:</strong> leads are not on the project list today and no lead table is wired into this app yet. Enter the unique lead number. Do not invent a seven-digit job or create a fake project.</p>";
    }

    html += "<div class=\"grid2\">";
    html += "<div><label>On-hire date</label><input type=\"date\" id=\"hireOn\" value=\"" + esc(d.on_hire_date || "") + "\"></div>";
    html += "<div><label>Off-hire date</label><input type=\"date\" id=\"hireOff\" value=\"" + esc(d.off_hire_date || "") + "\"></div>";
    html += "</div>";

    html += "<label>Logistics (shared by all lines)</label><select id=\"hireLogistics\">";
    [["delivery", "Delivery"], ["pickup", "Pickup"], ["already_holding", "Already holding (kit kept between same-week jobs)"]].forEach(function (pair) {
      html += "<option value=\"" + pair[0] + "\"" + (d.logistics === pair[0] ? " selected" : "") + ">" + pair[1] + "</option>";
    });
    html += "</select>";

    html += "<label>Delivery site (internal only)</label><input id=\"hireSite\" value=\"" + esc(d.delivery_site || "") + "\" placeholder=\"Internal site / depot — never on hire-company emails or Xero PO\">";
    html += "<p class=\"help\">Stored in-app only for staff. v1 does not send hire emails or create Xero POs.</p>";

    html += "<label>Who requested it</label><input id=\"hireWho\" value=\"" + esc(d.requested_by || "") + "\">";

    html += "<h3 class=\"brand-type\" style=\"color:var(--navy);font-size:16px;margin:18px 0 8px\">Equipment lines</h3>";
    html += "<div id=\"hireLines\">";
    (d.lines || [blankLine()]).forEach(function (ln, i) {
      html += lineHtml(ln, i, items);
    });
    html += "</div>";
    html += "<button type=\"button\" class=\"btn mid\" id=\"btnHireAddLine\">Add equipment line</button>";

    html += "<div class=\"footer-actions\">";
    html += "<button type=\"button\" class=\"btn orange\" id=\"btnHireSave\">" + (mode === "version" ? "Save as new version" : "Submit hire request") + "</button>";
    html += "<button type=\"button\" class=\"btn ghost\" id=\"btnHireCancel\">Cancel</button>";
    html += "</div>";
    html += "<p class=\"help\">ENVSS Field v" + APP_VERSION + " · sync uses the same pending queue as events/samples.</p>";
    html += "</div>";
    return html;
  }

  function lineHtml(ln, i, items) {
    var free = !!ln.is_free_text || (!ln.catalog_key && !!ln.label);
    var html = "<div class=\"card hire-line\" data-line=\"" + i + "\" style=\"margin:8px 0\">";
    html += "<div class=\"row\"><div class=\"grow brand-type\" style=\"font-weight:700;color:var(--navy)\">Line " + (i + 1) + "</div>";
    html += "<button type=\"button\" class=\"btn ghost hire-remove-line\" data-line=\"" + i + "\">Remove</button></div>";
    html += "<label>Equipment</label><select class=\"hire-equip\" data-line=\"" + i + "\">";
    html += "<option value=\"\">Select…</option>";
    items.forEach(function (it) {
      html += "<option value=\"" + esc(it.key) + "\"" + (ln.catalog_key === it.key ? " selected" : "") + ">"
        + esc(it.label) + (it.pending ? " *" : "") + "</option>";
    });
    html += "<option value=\"__free__\"" + (free && !ln.catalog_key ? " selected" : "") + ">Free text (not in catalog — flagged)</option>";
    html += "</select>";
    html += "<label>Label (exact invoice/quote wording)</label>";
    html += "<input class=\"hire-label\" data-line=\"" + i + "\" value=\"" + esc(ln.label || "") + "\" " + (ln.catalog_key && !free ? "readonly" : "") + " placeholder=\"Required\">";
    html += "<label>Quantity</label><input type=\"number\" min=\"1\" step=\"1\" class=\"hire-qty\" data-line=\"" + i + "\" value=\"" + esc(String(ln.quantity || 1)) + "\">";
    if (ln.flagged || free) html += "<p class=\"help\" style=\"color:var(--hot,#FFB066)\">Flagged for later catalog update.</p>";
    html += "</div>";
    return html;
  }

  function readDraftFromDom() {
    var d = view.hireDraft || blankDraft();
    var sup = document.getElementById("hireSupplier");
    if (sup) d.supplier = sup.value;
    var on = document.getElementById("hireOn");
    if (on) d.on_hire_date = on.value;
    var off = document.getElementById("hireOff");
    if (off) d.off_hire_date = off.value;
    var log = document.getElementById("hireLogistics");
    if (log) d.logistics = log.value;
    var site = document.getElementById("hireSite");
    if (site) d.delivery_site = site.value.trim();
    var who = document.getElementById("hireWho");
    if (who) d.requested_by = who.value.trim();
    if (d.ref_type === "job") {
      var job = document.getElementById("hireJob");
      if (job) {
        d.job_number = (job.value || "").trim();
        var opt = job.options[job.selectedIndex];
        d.project_id = opt && opt.getAttribute("data-pid") || "";
        d.lead_number = "";
      }
    } else {
      var lead = document.getElementById("hireLead");
      if (lead) d.lead_number = lead.value.trim();
      d.job_number = "";
      d.project_id = "";
    }
    var lines = [];
    document.querySelectorAll("#hireLines .hire-line").forEach(function (card) {
      var i = card.getAttribute("data-line");
      var eq = card.querySelector(".hire-equip");
      var lab = card.querySelector(".hire-label");
      var qty = card.querySelector(".hire-qty");
      var key = eq ? eq.value : "";
      var label = lab ? lab.value.trim() : "";
      var isFree = key === "__free__" || (!key && !!label);
      var catalogKey = isFree ? "" : key;
      if (!isFree && catalogKey) {
        var it = itemsFor(d.supplier).find(function (x) { return x.key === catalogKey; });
        if (it && !label) label = it.label;
      }
      lines.push({
        catalog_key: catalogKey,
        label: label,
        quantity: Math.max(1, parseInt(qty && qty.value, 10) || 1),
        is_free_text: isFree,
        flagged: isFree
      });
    });
    if (lines.length) d.lines = lines;
    view.hireDraft = d;
    return d;
  }

  function validate(d) {
    if (!d.supplier || !HIRE_CATALOG.suppliers.some(function (s) { return s.id === d.supplier && s.enabled; })) {
      return "Choose an enabled supplier (Air-Met or NVMS).";
    }
    if (d.ref_type === "job") {
      if (!String(d.job_number || "").trim()) return "Pick a job from the active project list.";
      var jp = (db.projects || []).find(function (p) { return String(p.number || "") === String(d.job_number); });
      if (!jp) return "Pick a job from the active project list (jobs come from envss_projects; do not type a fake job).";
      /* Prefer seven-digit Podio job numbers; field-created projects may differ and are still allowed once picked. */
      if (!/^\d{7}$/.test(String(d.job_number)) && (!jp.source || jp.source === "podio")) {
        return "Podio jobs use a seven-digit job number. Check the selected project.";
      }
    } else if (d.ref_type === "lead") {
      if (!String(d.lead_number || "").trim()) return "Enter the unique lead number.";
    } else return "Choose Job or Lead.";
    if (!d.on_hire_date) return "Enter the on-hire date.";
    if (!d.off_hire_date) return "Enter the off-hire date.";
    if (d.off_hire_date < d.on_hire_date) return "Off-hire date must be on or after on-hire date.";
    if (!d.logistics) return "Choose logistics.";
    if (!d.requested_by) return "Who requested it is required.";
    if (!d.lines || !d.lines.length) return "Add at least one equipment line.";
    for (var i = 0; i < d.lines.length; i++) {
      var ln = d.lines[i];
      if (!ln.label || !String(ln.label).trim()) return "Line " + (i + 1) + " needs a label (exact wording or free text).";
      if (!(Number(ln.quantity) >= 1)) return "Line " + (i + 1) + " needs a quantity of at least 1.";
    }
    return "";
  }

  function saveHireRequest() {
    var d = readDraftFromDom();
    var err = validate(d);
    if (err) { alert(err); return; }
    var now = nowIso();
    var mode = view.hireMode === "version" ? "version" : "new";
    ensureHires();

    if (mode === "version") {
      var prev = hireById(view.hireId);
      if (!prev) { alert("Original request missing."); return; }
      /* Mark all previous versions in the group as not latest */
      versionsOf(prev.request_group_id).forEach(function (h) {
        if (h.is_latest) { h.is_latest = false; h.updatedAt = now; }
      });
      var next = blankDraft(d);
      next.id = uid("hr");
      next.request_group_id = prev.request_group_id;
      next.version = (prev.version || 1) + 1;
      next.is_latest = true;
      next.createdAt = now;
      next.updatedAt = now;
      next.parent_id = prev.id;
      db.hires.push(next);
    } else {
      var rec = blankDraft(d);
      rec.id = uid("hr");
      rec.request_group_id = d.request_group_id || uid("hg");
      rec.version = 1;
      rec.is_latest = true;
      rec.createdAt = now;
      rec.updatedAt = now;
      db.hires.push(rec);
    }
    /* Never write Podio project rows from hire save */
    save();
    openHireList();
  }

  /* ---- wire into render / dash / bind ---- */
  var _dashHire = dashHtml;
  dashHtml = function () {
    var html = _dashHire();
    /* Insert Hire entry near the top actions without requiring a project */
    if (html.indexOf("id=\"btnHireRequests\"") >= 0) return html;
    html = html.replace(
      /(<div class="row"><h2 class="brand-type"[^>]*>Active projects<\/h2><button class="btn orange" id="btnNewProject">New project<\/button><\/div>)/,
      "$1<div class=\"row\" style=\"margin:10px 0 4px;gap:8px;flex-wrap:wrap\">"
        + "<button type=\"button\" class=\"btn mid\" id=\"btnHireRequests\">Hire requests</button>"
        + "<span class=\"help\" style=\"margin:0;align-self:center\">Jobs and leads — no project required to start.</span></div>"
    );
    /* Fallback if markup differs */
    if (html.indexOf("id=\"btnHireRequests\"") < 0) {
      html = html.replace(
        "<div class=\"wrap\">",
        "<div class=\"wrap\"><div class=\"row\" style=\"margin:0 0 10px\"><button type=\"button\" class=\"btn mid\" id=\"btnHireRequests\">Hire requests</button></div>"
      );
    }
    return html;
  };

  var _renderHire = render;
  render = function () {
    if (view.page === "hireList" || view.page === "hireForm") {
      setOnline();
      var whoEl = document.getElementById("whoLabel");
      if (whoEl) whoEl.textContent = whoText();
      paintLogin();
      var root = document.getElementById("app");
      if (tickMin) { clearInterval(tickMin); tickMin = null; }
      root.innerHTML = view.page === "hireList" ? hireListHtml() : hireFormHtml();
      bindHire();
      paintSyncBar();
      return;
    }
    var r = _renderHire.apply(this, arguments);
    /* After normal dash bind, attach hire button if present */
    var btn = document.getElementById("btnHireRequests");
    if (btn) btn.onclick = function () { openHireList(); };
    return r;
  };

  var _bindHire = bind;
  bind = function () {
    try { _bindHire.apply(this, arguments); } catch (e) {}
    var btn = document.getElementById("btnHireRequests");
    if (btn) btn.onclick = function () { openHireList(); };
  };

  function bindHire() {
    var backDash = document.getElementById("btnHireBackDash");
    if (backDash) backDash.onclick = function () { goDash(); };
    var backList = document.getElementById("btnHireBackList");
    if (backList) backList.onclick = function () { readDraftFromDom(); openHireList(); };
    var neu = document.getElementById("btnHireNew");
    if (neu) neu.onclick = function () { openHireNew(); };
    document.querySelectorAll(".open-hire").forEach(function (btn) {
      btn.onclick = function () { openHireEdit(btn.getAttribute("data-hire")); };
    });
    var cancel = document.getElementById("btnHireCancel");
    if (cancel) cancel.onclick = function () { openHireList(); };
    var saveBtn = document.getElementById("btnHireSave");
    if (saveBtn) saveBtn.onclick = function () { saveHireRequest(); };
    var add = document.getElementById("btnHireAddLine");
    if (add) add.onclick = function () {
      var d = readDraftFromDom();
      d.lines.push(blankLine());
      view.hireDraft = d;
      render();
    };
    document.querySelectorAll(".hire-remove-line").forEach(function (btn) {
      btn.onclick = function () {
        var d = readDraftFromDom();
        var i = parseInt(btn.getAttribute("data-line"), 10);
        if (d.lines.length <= 1) { alert("Keep at least one equipment line."); return; }
        d.lines.splice(i, 1);
        view.hireDraft = d;
        render();
      };
    });
    document.querySelectorAll("[data-hire-ref]").forEach(function (btn) {
      btn.onclick = function () {
        var d = readDraftFromDom();
        d.ref_type = btn.getAttribute("data-hire-ref");
        if (d.ref_type === "job") d.lead_number = "";
        else { d.job_number = ""; d.project_id = ""; }
        view.hireDraft = d;
        render();
      };
    });
    var sup = document.getElementById("hireSupplier");
    if (sup) sup.onchange = function () {
      var d = readDraftFromDom();
      d.supplier = sup.value;
      /* Clear catalog keys that don't belong to the new supplier; keep free-text labels */
      d.lines.forEach(function (ln) {
        if (ln.catalog_key) {
          var ok = itemsFor(d.supplier).some(function (it) { return it.key === ln.catalog_key; });
          if (!ok) { ln.catalog_key = ""; ln.is_free_text = true; ln.flagged = true; }
        }
      });
      view.hireDraft = d;
      render();
    };
    document.querySelectorAll(".hire-equip").forEach(function (sel) {
      sel.onchange = function () {
        var d = readDraftFromDom();
        var i = parseInt(sel.getAttribute("data-line"), 10);
        var ln = d.lines[i];
        if (!ln) return;
        if (sel.value === "__free__" || !sel.value) {
          ln.catalog_key = "";
          ln.is_free_text = true;
          ln.flagged = true;
        } else {
          var it = itemsFor(d.supplier).find(function (x) { return x.key === sel.value; });
          ln.catalog_key = sel.value;
          ln.label = it ? it.label : ln.label;
          ln.is_free_text = false;
          ln.flagged = !!(it && it.pending);
        }
        view.hireDraft = d;
        render();
      };
    });
  }

  window.openHireList = openHireList;
  window.openHireNew = openHireNew;
  window.openHireEdit = openHireEdit;
  window.envssHire = {
    catalog: HIRE_CATALOG,
    list: latestHires,
    openList: openHireList,
    openNew: openHireNew,
    openEdit: openHireEdit
  };
})();
