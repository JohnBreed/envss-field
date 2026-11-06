# Hire request (v45b local unpublished)

Built 2026-11-06 AWST on local branch `v45b`. **Not pushed. Not on GitHub Pages. SQL not applied.**

## Try locally

1. Open `field.html` from this checkout (static server or `file:` may work; Google sign-in needs the real host / HTTPS redirect).
2. Sign in with an `@envss.com.au` Google account (same as today).
3. On the Active projects dashboard, tap **Hire requests**.
4. **New hire request** → choose supplier (Air-Met / NVMS), Job or Lead, dates, logistics, equipment lines → Submit.
5. Reopen a listed request and **Save as new version** (same `request_group_id`, version++).

Helpers on `window.envssHire`: `openList()`, `openNew()`, `openEdit(id)`, `catalog`, `list()`.

## Sync

- Collection `hires` → table `envss_hires` (see `work/hire_v45b_01_envss_hires.sql`).
- Until John applies that SQL, local saves still work; remote upserts stay in the pending queue and the hire pull error is non-fatal.

## Do not

- Push / Pages publish / apply SQL / write Podio / email Air-Met or NVMS / Google Sheet dual-entry.
