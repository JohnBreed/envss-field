/* Read-only pull of planned HYG Assessment Events (Podio app 24280319) into envss_podio_events.
   Never calls a Podio write endpoint. Secrets stay in the Edge Function environment:
   PODIO_CLIENT_ID, PODIO_CLIENT_SECRET, PODIO_HYG_APP_TOKEN, HYG_CRON_SECRET.
   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform. */
import { mapItem } from "./map.js";

const APP_ID = "24280319";
const PLANNED_STATUS = [1, 2]; /* Tentative, Confirmed. 3 = Site Works Not Required, excluded. */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-envss-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function inBusinessWindow(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Perth", weekday: "short", hour: "2-digit", hourCycle: "h23"
  });
  const parts = fmt.formatToParts(now);
  const wd = String((parts.find(p => p.type === "weekday") || {}).value || "").replace(".", "").slice(0, 3);
  const hour = Number((parts.find(p => p.type === "hour") || {}).value);
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].indexOf(wd) >= 0 && hour >= 7 && hour <= 17;
}

async function podioToken() {
  const clientId = Deno.env.get("PODIO_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("PODIO_CLIENT_SECRET") || "";
  const appToken = Deno.env.get("PODIO_HYG_APP_TOKEN") || "";
  if (!clientId || !clientSecret || !appToken) {
    throw new Error("Podio secrets are not set (PODIO_CLIENT_ID, PODIO_CLIENT_SECRET, PODIO_HYG_APP_TOKEN). Nothing was written to Podio.");
  }
  const body = new URLSearchParams({
    grant_type: "app",
    app_id: APP_ID,
    app_token: appToken,
    client_id: clientId,
    client_secret: clientSecret
  });
  const res = await fetch("https://api.podio.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    throw new Error("Podio sign-in failed (" + res.status + "). Check the app token and client credentials. No Podio write was attempted.");
  }
  return j.access_token as string;
}

async function fetchPlanned(token: string) {
  const out: unknown[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const res = await fetch("https://api.podio.com/item/app/" + APP_ID + "/filter/", {
      method: "POST",
      headers: { Authorization: "OAuth2 " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: { "site-works-start-date-status": PLANNED_STATUS },
        limit: 100,
        offset,
        sort_by: "last_edit_on",
        sort_desc: true
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = String(j.error_description || j.error || "").slice(0, 180);
      throw new Error("Podio read failed (" + res.status + ")" + (detail ? ": " + detail : "") + ". No Podio write was attempted.");
    }
    const items = j.items || [];
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

function sbHeaders() {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not available to the function.");
  return {
    apikey: key,
    Authorization: "Bearer " + key,
    "Content-Type": "application/json"
  };
}

async function sb(path: string, init: RequestInit) {
  const base = Deno.env.get("SUPABASE_URL") || "";
  if (!base) throw new Error("SUPABASE_URL is not available to the function.");
  const headers = Object.assign({}, sbHeaders(), init.headers || {});
  const res = await fetch(base + path, Object.assign({}, init, { headers }));
  const text = await res.text();
  if (!res.ok) throw new Error("Supabase " + res.status + " " + text.slice(0, 180));
  return text ? JSON.parse(text) : null;
}

async function callerAllowed(req: Request) {
  const cron = req.headers.get("x-envss-cron") || "";
  const expect = Deno.env.get("HYG_CRON_SECRET") || "";
  if (expect && cron && cron === expect) return { ok: true, via: "cron" };
  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!jwt || jwt === anon || jwt === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return { ok: false, error: "Sign in with an @envss.com.au account." };
  }
  const base = Deno.env.get("SUPABASE_URL") || "";
  const res = await fetch(base + "/auth/v1/user", { headers: { Authorization: "Bearer " + jwt, apikey: anon } });
  const user = await res.json().catch(() => ({}));
  const email = String(user.email || "").toLowerCase();
  if (!res.ok || !email.endsWith("@envss.com.au")) {
    return { ok: false, error: "Sign in with an @envss.com.au account." };
  }
  return { ok: true, via: "staff", email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });
  let body: { job?: string; force?: boolean; all?: boolean; source?: string } = {};
  try { body = await req.json(); } catch (_e) { body = {}; }
  const who = await callerAllowed(req);
  if (!who.ok) return json(401, { ok: false, error: who.error });
  const force = body.force === true || who.via === "staff";
  if (!force && !inBusinessWindow(new Date())) {
    return json(200, { ok: true, skipped: true, reason: "outside Mon–Fri 07:00–17:00 Australia/Perth" });
  }
  const job = String(body.job || "").match(/^(\d{7})$/) ? String(body.job) : "";
  try {
    const token = await podioToken();
    const items = await fetchPlanned(token);
    const mapped = items.map(it => mapItem(it)).filter(p => p.itemId && p.jobNumber && (!job || p.jobNumber === job));
    const rows = mapped.map(p => ({
      id: "podio-event-" + p.itemId,
      item_id: Number(p.itemId),
      event_reference: p.reference || null,
      job_number: p.jobNumber,
      project_item_id: p.projectItemId ? Number(p.projectItemId) : null,
      project_title: p.projectTitle || null,
      payload: p,
      planned: !!p.planned,
      updated_at: new Date().toISOString()
    }));
    if (rows.length) {
      await sb("/rest/v1/envss_podio_events?on_conflict=item_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows)
      });
    }
    const seen = new Set(mapped.map(p => p.itemId));
    const q = job ? "&job_number=eq." + job : "";
    const existing = await sb("/rest/v1/envss_podio_events?select=item_id&planned=eq.true" + q, { method: "GET" }) || [];
    const stale = (existing as { item_id: number }[]).map(r => String(r.item_id)).filter(id => !seen.has(id));
    for (const id of stale) {
      await sb("/rest/v1/envss_podio_events?item_id=eq." + id, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ planned: false, updated_at: new Date().toISOString() })
      });
    }
    return json(200, {
      ok: true,
      skipped: false,
      job: job || null,
      read: items.length,
      upserted: rows.length,
      planned: rows.filter(r => r.planned).length,
      closed: stale.length
    });
  } catch (e) {
    return json(502, { ok: false, error: String(e && (e as Error).message || e) });
  }
});
