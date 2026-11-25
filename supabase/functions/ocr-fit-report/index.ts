/* ENVSS Field v48.9: Google Cloud Vision OCR for TSI PortaCount fit-test report photos.
   The API key stays in the Edge Function secret GOOGLE_VISION_API_KEY and is never sent to the browser.
   Staff JWT (@envss.com.au) required. No Podio or Drive writes. */
const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

async function callerAllowed(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!jwt || jwt === anon || jwt === service) {
    return { ok: false, error: "Sign in with an @envss.com.au account." };
  }
  const base = Deno.env.get("SUPABASE_URL") || "";
  const res = await fetch(base + "/auth/v1/user", { headers: { Authorization: "Bearer " + jwt, apikey: anon || service } });
  const user = await res.json().catch(() => ({} as { email?: string }));
  const email = String(user.email || "").toLowerCase();
  if (!res.ok || !email.endsWith("@envss.com.au")) {
    return { ok: false, error: "Sign in with an @envss.com.au account." };
  }
  return { ok: true, email };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const who = await callerAllowed(req);
  if (!who.ok) return json(401, { error: who.error });

  const key = (Deno.env.get("GOOGLE_VISION_API_KEY") || "").trim();
  if (!key) {
    return json(503, {
      error: "OCR_NOT_CONFIGURED",
      message: "OCR not set up yet, enter manually"
    });
  }

  let body: { image?: string; mime?: string } = {};
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const raw = String(body.image || "").replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!raw) return json(400, { error: "No image" });
  // Client should already have downscaled. Reject very large payloads (~4 MB base64).
  if (raw.length > 5_500_000) return json(413, { error: "Image is too large. Retake or pick a smaller photo." });

  const vision = await fetch("https://vision.googleapis.com/v1/images:annotate?key=" + encodeURIComponent(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        image: { content: raw },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }]
      }]
    })
  });
  const result = await vision.json().catch(() => ({} as Record<string, unknown>));
  if (!vision.ok) {
    const msg = String((result as { error?: { message?: string } }).error?.message || vision.status);
    return json(502, { error: "VISION_FAILED", message: "Could not read the photo (" + msg.slice(0, 180) + "). Enter the details manually, or retake the photo." });
  }
  const resp = ((result as { responses?: Array<Record<string, unknown>> }).responses || [])[0] || {};
  if ((resp as { error?: { message?: string } }).error) {
    const msg = String((resp as { error: { message?: string } }).error.message || "Vision error");
    return json(502, { error: "VISION_FAILED", message: "Could not read the photo (" + msg.slice(0, 180) + "). Enter the details manually, or retake the photo." });
  }
  const full = (resp as { fullTextAnnotation?: { text?: string; pages?: unknown[] } }).fullTextAnnotation || {};
  const text = String(full.text || (resp as { textAnnotations?: Array<{ description?: string }> }).textAnnotations?.[0]?.description || "");
  const pages = Array.isArray(full.pages) ? full.pages : [];
  return json(200, { text, pages, annotations: (resp as { textAnnotations?: unknown }).textAnnotations || [] });
});
