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

**Face velocity grid** (type `grid`, first on the Add measurement screen): one measurement per extraction unit + fan
condition ("How many fans are running?" 1-4 chips or free text; "+ Another condition on this unit" copies the unit,
hood make/model/serial and opening). The grid is set out from the opening width × height (mm) per
AS/NZS 2243.8:2014 Appendix B, B4.2(c): first/last lines 100 mm in from the edges, equally spaced, not more than
250 mm vertically / 500 mm horizontally, fewest lines (`n = ceil((size - 200) / max) + 1`; 2000×1800 → 5×8 = 40,
600×500 → 2×3 = 6). A manual grid (default 4×7 = 28) needs a reason. Points are numbered down each column then across,
labelled like the 0019340 sheet ("1 - Top left corner"); each has velocity, optional distance where velocity < 0.5 m/s
and an optional label. n / average / lowest / highest and the cl. 3.1.2 indicator (average ≥ 0.5 m/s, no point
< 0.3 m/s) are shown but never block. Data lives in `t.vent.grid` (`v` / `d` / `label` maps keyed "point N"), so the
shared change audit writes one readable line per point. A size change that would drop a filled point is refused.
The event page shows a velocity summary table; the CSV puts the 0019340 Sheet1 columns first (stats and comments on
the first row of each block), then a Summary block, with app-only columns to the right.
