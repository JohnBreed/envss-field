/* v48.6 project list (Layout A): grouped by when work is happening.
   window.ENVSS_PROJLIST_REVIEW = 0 previous list | 1 grouped (default) | 2 date-sorted
   window.ENVSS_PROJLIST_FIXTURE, when set (tests), supplies mockup projects and per-job events. */
(function () {
  "use strict";
  if (window.__envssProjlistReview) return;
  window.__envssProjlistReview = true;

  const st = document.createElement("style");
  st.textContent = [
    ".plr-group{margin:18px 0 8px}",
    ".plr-head{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:transparent;border:0;color:inherit;padding:4px 0;cursor:pointer}",
    ".plr-head h3{margin:0;font-size:16px;font-weight:700;color:var(--text, var(--navy))}",
    ".plr-count{font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid var(--edge,#3A4258)}",
    ".plr-date{font-weight:800;font-size:16px;color:var(--hot,#D9782C);white-space:nowrap}",
    ".plr-date.today{color:#6BE3AE}",
    ".plr-date.none{color:var(--sub,#9aa);font-weight:700;font-size:13px}",
    ".plr-sum{font-weight:700;font-size:13px;margin-top:2px}",
    ".plr-ev{border-top:1px solid var(--edge,#3A4258);margin-top:8px;padding-top:8px}",
    ".plr-evrow{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:6px 0}",
    ".plr-chev{min-width:44px;min-height:44px;border-radius:10px}",
    ".plr-card{margin-bottom:8px;cursor:pointer}",
    ".plr-card .grow{min-width:0}",
    ".plr-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:0 0 auto}",
    ".plr-title{overflow-wrap:anywhere}",
    ".plr-status{font-size:12px;opacity:.8;text-align:right;max-width:140px}",
    ".plr-empty{opacity:.75;font-size:13px;margin:0 0 8px}",
    ".plr-fallback{font-style:italic;opacity:.9}",
    ".plr-chev{min-width:44px;min-height:44px;border-radius:10px;align-self:flex-end}"
  ].join("");
  document.head.appendChild(st);

  const STAGE_CLASS = {
    "Planned": "planned", "Prepped": "ev_prepped", "Running": "ev_running",
    "Needs fields": "ev_needs", "Samples complete": "ev_complete", "Event complete": "upload_ready"
  };
  const STAGE_LABEL = {
    planned: "Planned", ev_prepped: "Prepped", ev_running: "Running",
    ev_needs: "Needs fields", ev_complete: "Samples complete", upload_ready: "Event complete",
    prepped: "Prepped"
  };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function todayYmd() {
    const fx = window.ENVSS_PROJLIST_FIXTURE;
    if (fx && fx.today) return fx.today;
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth" }).format(new Date());
  }
  function parseYmd(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : ""; }
  function addDays(ymd, n) {
    const d = new Date(ymd + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function niceDate(ymd, today) {
    if (!ymd) return "No date set";
    if (ymd === today) return "Today";
    if (ymd === addDays(today, 1)) return "Tomorrow";
    if (ymd === addDays(today, -1)) return "Yesterday";
    const [y, m, d] = ymd.split("-").map(Number);
    const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1];
    return d + " " + mon;
  }
  function badgeFor(stage) {
    const k = STAGE_CLASS[stage] || "planned";
    const lab = stage || "Planned";
    if (typeof badge === "function" && STAGE_CLASS[stage]) return badge(k);
    return '<span class="badge s-' + k + '">' + esc(lab) + "</span>";
  }
  function job7(p) {
    const m = String(p && (p.number || p.jobNumber || "") || "").trim().match(/^(\d{7})(?!\d)/);
    return m ? m[1] : "";
  }
  function isTestProject(p) {
    if (p && p.isTest) return true;
    const name = String((p && (p.shortName || p.name)) || "").replace(/^\d{7}[-_ ]*/, "");
    return /^test\b/i.test(name);
  }
  function stageLabel(code) {
    if (!code) return "Planned";
    if (STAGE_CLASS[code]) return code;
    return STAGE_LABEL[code] || "Planned";
  }
  function stageDone(label) {
    return label === "Samples complete" || label === "Event complete";
  }
  function isAfmEvent(ev) {
    return !!(ev && (ev.source === "afm" || (ev.type === "fibre" && ev.source !== "hyg")));
  }
  function uniqueNames(list) {
    const out = [];
    const seen = new Set();
    const arr = Array.isArray(list) ? list : String(list == null ? "" : list).split(/,\s*/);
    arr.forEach(function (n) {
      const t = String(n || "").trim();
      const k = t.toLowerCase();
      if (t && !seen.has(k)) { seen.add(k); out.push(t); }
    });
    return out;
  }
  function nameOf(ev, p) {
    /* AFM: distinct Sample Submitted by (sample-by) names on that event's samples.
       Never use report-submitted-by on the AFM event. Hygiene still uses attendee. */
    if (isAfmEvent(ev)) {
      const names = uniqueNames(ev.samplers != null ? ev.samplers : ev.sampledBy);
      if (names.length) return { text: names.join(", "), fallback: false };
    } else {
      const att = ev && String(ev.attendee || "").trim();
      if (att) return { text: att, fallback: false };
    }
    if (p && String(p.controller || "").trim()) return { text: "Controller: " + p.controller.trim(), fallback: true };
    return { text: "No controller", fallback: true };
  }

  function hygCache() {
    try { return JSON.parse(localStorage.getItem("envss-podio-events-v45d") || "{}") || {}; } catch (e) { return {}; }
  }
  function afmCache() {
    try {
      if (window.envssAfmPodio && typeof window.envssAfmPodio.cache === "function") return window.envssAfmPodio.cache() || { events: [], samples: [] };
    } catch (e) {}
    return { events: [], samples: [] };
  }
  function samplersForAfmItem(itemId) {
    const cache = afmCache();
    const samples = (cache.samples || []).filter(s => String(s.eventItemId) === String(itemId));
    return uniqueNames(samples.map(s => s.sampledBy));
  }
  function liveEvsOf(p) {
    const job = job7(p);
    const byKey = new Map();
    function put(ev, prefer) {
      const pid = ev.podioItemId ? "id:" + ev.podioItemId : "";
      const code = ev.code ? "c:" + String(ev.code).toLowerCase() : "";
      const key = pid || code || ("x:" + (ev.date || "") + ":" + (ev.source || "") + ":" + (ev.type || ""));
      const prev = byKey.get(key) || (code && byKey.get(code)) || (pid && byKey.get(pid));
      if (prev && !prefer) {
        if (!prev.attendee && ev.attendee) prev.attendee = ev.attendee;
        if ((!prev.samplers || !prev.samplers.length) && ev.samplers && ev.samplers.length) prev.samplers = ev.samplers;
        if (!prev.date && ev.date) prev.date = ev.date;
        return prev;
      }
      byKey.set(key, ev);
      if (pid) byKey.set(pid, ev);
      if (code) byKey.set(code, ev);
      return ev;
    }

    const projectIds = new Set([String(p.id)]);
    if (typeof db !== "undefined" && db && job) {
      (db.projects || []).forEach(function (x) { if (job7(x) === job) projectIds.add(String(x.id)); });
    }
    if (typeof db !== "undefined" && db) {
      (db.events || []).forEach(function (e) {
        if (!e || !projectIds.has(String(e.projectId || ""))) return;
        const fibre = (typeof isFibreEvent === "function") ? isFibreEvent(e) : (e.type === "fibre");
        const st = stageLabel(typeof deriveEventStage === "function" ? deriveEventStage(e) : e.stage);
        const ev = {
          code: e.code || e.podioReference || "",
          date: parseYmd(e.date),
          type: fibre ? "fibre" : (e.type || "hygiene"),
          stage: st,
          done: stageDone(st),
          attendee: e.attendedBy || "",
          samplers: fibre ? uniqueNames(e.sampledBy || (e.podioAfm && e.podioAfm.sampledBy) || "") : null,
          source: fibre ? "field" : "field",
          podioItemId: e.podioItemId ? String(e.podioItemId) : ""
        };
        put(ev, true);
      });
    }

    if (job) {
      const rows = (hygCache()[job] || {}).rows || [];
      rows.forEach(function (row) {
        const pl = row.payload || row;
        const ev = {
          code: pl.fieldCode || pl.reference || row.event_reference || "",
          date: parseYmd(pl.startDate || pl.date),
          type: "hygiene",
          stage: "Planned",
          done: false,
          attendee: pl.attendedBy || "",
          samplers: null,
          source: "hyg",
          podioItemId: String(pl.itemId || row.item_id || "")
        };
        put(ev, false);
      });
      (afmCache().events || []).forEach(function (row) {
        if (!row || String(row.jobNumber || "") !== job) return;
        if (row.open === false) return;
        const names = uniqueNames(row.sampledBy) ;
        const fromSamples = samplersForAfmItem(row.itemId);
        const ev = {
          code: row.reference || row.title || "",
          date: parseYmd(row.date),
          type: "fibre",
          stage: "Planned",
          done: false,
          attendee: "",
          samplers: (fromSamples.length ? fromSamples : names),
          source: "afm",
          podioItemId: row.itemId ? String(row.itemId) : ""
        };
        put(ev, false);
      });
    }

    const evs = [];
    const seen = new Set();
    byKey.forEach(function (ev, k) {
      if (k.indexOf("id:") === 0 || k.indexOf("c:") === 0 || k.indexOf("x:") === 0) {
        if (seen.has(ev)) return;
        seen.add(ev);
        evs.push(ev);
      }
    });
    evs.sort(function (a, b) {
      return String(a.date || "9999").localeCompare(String(b.date || "9999")) || String(a.code || "").localeCompare(String(b.code || ""));
    });
    return evs;
  }
  function evsOf(p) {
    const fx = window.ENVSS_PROJLIST_FIXTURE || {};
    const map = fx.reviewEvents || {};
    if (fx.reviewEvents && Object.prototype.hasOwnProperty.call(map, p.id)) return (map[p.id] || []).slice();
    return liveEvsOf(p);
  }
  function pickCurrent(evs, today) {
    if (!evs.length) return null;
    const running = evs.find(e => e.stage === "Running");
    if (running) return running;
    const onToday = evs.filter(e => e.date === today);
    if (onToday.length) {
      const open = onToday.find(e => !e.done && e.stage !== "Planned") || onToday.find(e => !e.done) || onToday[0];
      return open;
    }
    const future = evs.filter(e => e.date && e.date > today).sort((a, b) => a.date.localeCompare(b.date));
    if (future.length) return future[0];
    const open = evs.filter(e => !e.done && e.stage !== "Planned");
    if (open.length) return open.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
    const pastOpen = evs.filter(e => !e.done).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return pastOpen[0] || evs[evs.length - 1];
  }
  function nextDate(p, evs, today) {
    const cur = pickCurrent(evs, today);
    if (cur && cur.date && cur.date >= today) return cur.date;
    const future = evs.filter(e => e.date && e.date >= today).map(e => e.date).sort();
    return future[0] || "";
  }
  function groupOf(p, evs, today) {
    if (isTestProject(p)) return "test";
    const nd = nextDate(p, evs, today);
    const week = addDays(today, 7);
    if (evs.some(e => e.stage === "Running" || e.date === today) || nd === today) return "today";
    if (nd && nd > today && nd <= week) return "week";
    if (nd && nd > week) return "later";
    const lab = /lab results pending|report pending|report in review/i.test(p.status || "");
    if (lab) return "lab";
    if (evs.some(e => e.date && e.date < today)) return "past";
    return "nodate";
  }
  const GROUPS = [
    ["today", "On site today"],
    ["week", "Next 7 days"],
    ["later", "Later"],
    ["lab", "Awaiting lab / report"],
    ["past", "Past dates, no upcoming visit"],
    ["nodate", "No date set"],
    ["test", "Test / local only"]
  ];
  const COLLAPSE_DEFAULT = { nodate: true, test: true };

  function shortName(p) {
    return p.shortName || String(p.name || "").replace(/^\d{7}[-_ ]*/, "") || p.number;
  }
  function typeLab(t) { return t === "fibre" ? "AFM" : "Hygiene"; }

  function cardHtml(p, evs, today, expanded) {
    const cur = pickCurrent(evs, today);
    const nd = cur && cur.date ? cur.date : nextDate(p, evs, today);
    const dateCls = !nd ? "none" : nd === today ? "today" : "";
    const done = evs.filter(e => e.done).length;
    const n = evs.length;
    let sum = "";
    if (n > 1) sum = done + " of " + n + " events done";
    else if (n === 1 && cur) sum = typeLab(cur.type) + " · " + (cur.stage || "Planned");
    else sum = "No field events yet";
    const who = nameOf(cur, p);
    const sub = [who.text, p.status || ""].filter(Boolean).join(" · ");
    const evBlock = (expanded && n) ? '<div class="plr-ev">' + evs.map(e => {
      const w = nameOf(e, p);
      return '<div class="plr-evrow"><div><div class="brand-type" style="font-weight:700;font-size:14px">' + esc(e.code) + "</div>"
        + '<div class="muted">' + esc(typeLab(e.type) + " · " + niceDate(e.date, today)) + "</div>"
        + '<div class="muted' + (w.fallback ? " plr-fallback" : "") + '">' + esc(w.text) + "</div></div>"
        + badgeFor(e.stage) + "</div>";
    }).join("") + "</div>" : "";
    const chev = n > 1 ? '<button type="button" class="btn ghost plr-chev" data-plr-expand="' + esc(p.id) + '" aria-label="Show events">' + (expanded ? "▴" : "▾") + "</button>" : "";
    return '<div class="card open-project plr-card" data-project="' + esc(p.id) + '" style="display:block;width:100%;text-align:left">'
      + '<div class="row"><div class="grow">'
      + '<div class="brand-type" style="font-weight:700;color:var(--navy);font-size:18px">' + esc(p.number || "No job number") + "</div>"
      + '<div class="muted plr-title">' + esc(shortName(p) || "No title") + (p.client ? " · " + esc(p.client) : "") + "</div>"
      + (sub ? '<div class="muted">' + esc(sub) + "</div>" : "")
      + (sum ? '<div class="plr-sum">' + esc(sum) + "</div>" : "")
      + "</div><div class=\"plr-right\">"
      + '<div class="plr-date ' + dateCls + '">' + esc(niceDate(nd, today)) + "</div>"
      + (cur ? badgeFor(cur.stage) : "")
      + chev
      + "</div></div>"
      + evBlock
      + "</div>";
  }

  function rankProject(p) {
    let r = 0;
    const id = String(p && p.id || "");
    if (p && p.source === "podio" && id.indexOf("podio-afm-job-") !== 0) r += 8;
    if (id.indexOf("podio-job-") === 0) r += 4;
    if (p && p.controller) r += 2;
    if (p && p.name) r += 1;
    return r;
  }
  function uniqueByJob(list) {
    const by = new Map();
    list.forEach(function (p) {
      const k = job7(p) || p.id;
      const prev = by.get(k);
      if (!prev || rankProject(p) > rankProject(prev)) by.set(k, p);
    });
    return Array.from(by.values());
  }
  function liveProjects() {
    const all = (typeof db !== "undefined" && db && db.projects) ? db.projects : [];
    const isActive = function (p) {
      try { return typeof activeProject === "function" ? activeProject(p) : true; } catch (e) { return true; }
    };
    view.controller = view.controller || "all";
    view.statusFilter = view.statusFilter || "all";
    return uniqueByJob(all.filter(function (p) {
      if (!isActive(p)) return false;
      if (view.controller !== "all" && p.controller !== view.controller) return false;
      if (view.statusFilter !== "all" && p.status !== view.statusFilter) return false;
      return true;
    }));
  }
  function listForMode() {
    const fx = window.ENVSS_PROJLIST_FIXTURE || {};
    const mode = Number(window.ENVSS_PROJLIST_REVIEW == null ? 1 : window.ENVSS_PROJLIST_REVIEW);
    const today = todayYmd();
    const projects = fx.mockupProjects ? fx.mockupProjects.slice() : liveProjects();
    const hideNone = !!view.plrHideNone;
    const items = projects.map(p => {
      const evs = evsOf(p);
      return { p, evs, g: groupOf(p, evs, today), nd: nextDate(p, evs, today) || "9999-99-99" };
    }).filter(it => {
      if (hideNone && (it.g === "nodate" || it.g === "test")) return false;
      return true;
    });
    items.sort((a, b) => a.nd.localeCompare(b.nd) || String(a.p.number).localeCompare(String(b.p.number)));
    return { mode, today, items, projects };
  }

  function filterBar(items) {
    const source = (window.ENVSS_PROJLIST_FIXTURE && window.ENVSS_PROJLIST_FIXTURE.mockupProjects)
      ? window.ENVSS_PROJLIST_FIXTURE.mockupProjects
      : ((typeof db !== "undefined" && db && db.projects) ? db.projects : []);
    const controllers = [], statuses = [];
    source.forEach(function (p) {
      try { if (typeof activeProject === "function" && !activeProject(p)) return; } catch (e) {}
      if (p.controller && controllers.indexOf(p.controller) < 0) controllers.push(p.controller);
      if (p.status && statuses.indexOf(p.status) < 0) statuses.push(p.status);
    });
    controllers.sort(); statuses.sort();
    view.controller = view.controller || "all";
    view.statusFilter = view.statusFilter || "all";
    const me = (typeof getOperator === "function" && getOperator() || {}).name || "";
    let html = "";
    if (me) {
      const mine = source.some(function (p) {
        try { return (typeof activeProject !== "function" || activeProject(p)) && String(p.controller || "").toLowerCase() === me.toLowerCase(); } catch (e) { return false; }
      });
      if (mine) {
        html += '<div class="row" style="gap:8px;margin-top:8px">'
          + '<button type="button" class="chip ' + (view.controller === me ? "on" : "") + '" id="btnMyJobs" data-me="' + esc(me) + '">My jobs (' + esc(me) + ")</button>"
          + '<button type="button" class="chip ' + (view.controller === "all" ? "on" : "") + '" id="btnAllJobs">All jobs</button></div>';
      }
    }
    html += "<label>Controller</label><select id=\"controllerFilter\"><option value=\"all\">All controllers</option>";
    controllers.forEach(function (n) { html += "<option value=\"" + esc(n) + "\"" + (view.controller === n ? " selected" : "") + ">" + esc(n) + "</option>"; });
    html += "</select><label>Status</label><select id=\"statusFilter\"><option value=\"all\">All active statuses</option>";
    statuses.forEach(function (n) { html += "<option value=\"" + esc(n) + "\"" + (view.statusFilter === n ? " selected" : "") + ">" + esc(n) + "</option>"; });
    html += "</select>";
    return html;
  }

  function reviewHtml() {
    const { mode, today, items } = listForMode();
    const title = mode === 2 ? "Projects by date" : "Projects";
    let html = '<div class="wrap"><div class="row"><h2 class="brand-type" style="margin:0;color:var(--navy)">' + title + "</h2>"
      + '<button class="btn orange" id="btnNewProject">New project</button></div>';
    html += '<div class="row" style="margin:10px 0 4px;gap:8px;flex-wrap:wrap">'
      + '<button type="button" class="btn mid" id="btnHireRequests">Hire requests</button>';
    if (typeof canSeeLoginLogButton === "function" && canSeeLoginLogButton()) {
      html += '<button type="button" class="btn ghost" id="btnLoginLog">Login log</button>';
    }
    html += "</div>";
    html += filterBar(items);
    html += '<div class="row" style="gap:8px;margin:8px 0;flex-wrap:wrap">'
      + '<button type="button" class="chip ' + (view.plrHideNone ? "on" : "") + '" id="btnPlrHideNone">Hide jobs with no date</button>'
      + '<span class="help" style="margin:0;align-self:center">' + items.length + " job" + (items.length === 1 ? "" : "s") + " shown · " + todayYmd() + " AWST</span></div>";

    if (mode === 2) {
      if (!items.length) html += '<p class="help">0 active jobs.</p>';
      items.forEach(it => { html += cardHtml(it.p, it.evs, today, view.plrOpen === it.p.id); });
    } else {
      if (!items.length) html += '<p class="help">0 active jobs.</p>';
      GROUPS.forEach(([key, label]) => {
        const rows = items.filter(it => it.g === key);
        if (!rows.length) return;
        const collapsed = view.plrCollapse && Object.prototype.hasOwnProperty.call(view.plrCollapse, key)
          ? view.plrCollapse[key]
          : !!COLLAPSE_DEFAULT[key];
        html += '<div class="plr-group" data-plr-group="' + key + '">'
          + '<button type="button" class="plr-head" data-plr-toggle="' + key + '"><h3>' + esc(label) + "</h3>"
          + '<span class="plr-count">' + rows.length + "</span>"
          + '<span class="muted">' + (collapsed ? "Show" : "Hide") + "</span></button>";
        if (collapsed) html += '<p class="plr-empty">' + rows.length + " job" + (rows.length === 1 ? "" : "s") + " hidden in this group.</p>";
        else rows.forEach(it => { html += cardHtml(it.p, it.evs, today, view.plrOpen === it.p.id); });
        html += "</div>";
      });
    }
    html += '<p class="muted">Signed in as ' + esc(typeof whoText === "function" ? whoText() : "") + ' <button class="btn ghost" type="button" id="btnSignOut" onclick="signOut()">Sign out</button></p>';
    html += '<p class="help">ENVSS Field v' + (typeof APP_VERSION !== "undefined" ? APP_VERSION : "") + "</p></div>";
    return html;
  }

  view.plrCollapse = view.plrCollapse || { nodate: true, test: true };
  view.plrHideNone = !!view.plrHideNone;
  view.plrOpen = view.plrOpen || "";

  const _dash = dashHtml;
  dashHtml = function () {
    const mode = Number(window.ENVSS_PROJLIST_REVIEW == null ? 1 : window.ENVSS_PROJLIST_REVIEW);
    if (!mode) return _dash.apply(this, arguments);
    try { return reviewHtml(); } catch (e) { console.warn("projlist", e); return _dash.apply(this, arguments); }
  };

  const _bind = bind;
  bind = function () {
    try { _bind.apply(this, arguments); } catch (e) {}
    const hide = document.getElementById("btnPlrHideNone");
    if (hide) hide.onclick = function (e) { e.preventDefault(); e.stopPropagation(); view.plrHideNone = !view.plrHideNone; render(); };
    const my = document.getElementById("btnMyJobs");
    if (my) my.onclick = function () { view.controller = my.getAttribute("data-me"); render(); };
    const al = document.getElementById("btnAllJobs");
    if (al) al.onclick = function () { view.controller = "all"; view.statusFilter = "all"; render(); };
    document.querySelectorAll("[data-plr-toggle]").forEach(btn => {
      btn.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        const k = btn.getAttribute("data-plr-toggle");
        const cur = view.plrCollapse && Object.prototype.hasOwnProperty.call(view.plrCollapse, k)
          ? view.plrCollapse[k] : !!COLLAPSE_DEFAULT[k];
        view.plrCollapse = view.plrCollapse || {};
        view.plrCollapse[k] = !cur;
        render();
      };
    });
    document.querySelectorAll("[data-plr-expand]").forEach(btn => {
      btn.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        const id = btn.getAttribute("data-plr-expand");
        view.plrOpen = view.plrOpen === id ? "" : id;
        render();
      };
    });
  };

  window.envssProjlist = {
    todayYmd, nameOf, isAfmEvent, uniqueNames, groupOf, nextDate, pickCurrent, evsOf, liveEvsOf, listForMode, GROUPS
  };
})();
