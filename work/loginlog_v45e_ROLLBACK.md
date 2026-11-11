# Login log v45e — rollback

Preview branch: `preview/login-log-v45e`  
Base (live main / v45c): `658eccf` (`v45c: publish hire form updates`)  
Do **not** merge this branch without John's approval. Pushing/merging to `main` goes live on GitHub Pages.

## App (field.html + sw-field.js)

If this preview was merged or deployed and must be undone:

1. Revert the merge commit, **or** reset / restore `field.html` and `sw-field.js` to base commit `658eccf`.
2. Service worker cache name in this preview is `envss-field-v45e-loginlog`. After rollback, a reload of `field.html` activates the previous SW (`envss-field-v45b-hire` on v45c) and drops the preview cache on activate.
3. Local device leftovers (harmless): `localStorage` keys
   - `envss-field-login-log-queue-v45e` (offline queue)
   - `envss-field-login-daily-<userId|email>` (last Perth day already logged)
   Staff can clear site data if needed; the app does not require it.

## Database (`public.envss_login_log`)

SQL was written as draft only and must **not** be applied until John approves.

- Apply (when approved): `work/loginlog_v45e_01_table.sql`
- Rollback (if applied): `work/loginlog_v45e_01_rollback.sql`  
  Drops policies + table. Does not touch `envss_admins`, `is_envss_staff()`, or any other `envss_*` data.

## Admin gate

- **App button:** shown when browser `isAdmin()` is true (config.js / default `john@envss.com.au`) **or** when `envss_admins` self-read returns a row.
- **Server SELECT (RLS):** only emails present in `public.envss_admins`. That table is currently empty on live — seed before expecting the admin screen to load rows, e.g.  
  `insert into public.envss_admins(email, name) values ('john@envss.com.au','John Breed') on conflict do nothing;`  
  (not included in the migration; run only with John's approval)

## What this preview does not change

Per-record `audit` arrays, `updated_by`, Podio rows, hire tables, photo storage, or existing sync behaviour. Logging failures never block sign-in or capture.
