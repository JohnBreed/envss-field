# ENVSS Field

Offline-first sample-train capture for Environmental Site Services.

Live (after Pages is on): `https://johnbreed.github.io/envss-field/`

## Enable GitHub Pages

1. Open https://github.com/JohnBreed/envss-field/settings/pages
2. Source: **Deploy from a branch**
3. Branch: `main` / folder `/` (root)
4. Save. Wait a minute.

## Google Workspace sign-in

GitHub Pages is a static site. Google sign-in uses Google Identity Services in the browser. No server secret.

1. Google Cloud Console → APIs & Services → Credentials → Create credentials → **OAuth client ID** → **Web application**.
2. Authorised JavaScript origins:
   - `https://johnbreed.github.io`
   - `http://localhost:8080`
3. Copy the client ID into `config.js` → `googleClientId`.
4. Restrict the OAuth consent screen to the `envss.com.au` Workspace if you want.

After that, staff sign in with their Google Workspace account. The name and email stay on that device until they tap Sign out.

## Vent survey measurements (v48.19, `vent.js`)

Events linked to the Podio *Vent Survey Event* app (`podioEventKind: "vent"`) record measurements instead of samples:
anemometer make/model/serial once per event, then one measurement per extraction unit + location with a numbered
velocity list (m/s), automatic average/lowest/highest, optional "distance where velocity < 0.5 m/s", comments and photos.
Measurements are ordinary train rows (`trainKind: "vent"`, data in `t.vent`) so they save offline and sync like samples.
No COC (vent trains are left out of COCs on mixed events), no Podio writes, no Drive sheet fill: the event menu has
"Export vent survey CSV" in the Drive template's column order. Tests: `work/v48-19/vent.test.mjs` (Pixel 7 + Chromebook).
