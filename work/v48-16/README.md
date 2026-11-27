# v48.16 — safe auto-update + minimum version (DRAFT, not published)

John asked on 27 Nov 2026 (AWST) for the app to update itself so staff don't have to refresh (t651u / t652u). He approved building it, not publishing it.

## What staff see

- Usually nothing. The app checks for a new version when it opens, when it comes back to the front, and every 15 minutes. The new version downloads in the background. When nothing is being typed or open and everything has uploaded, the app reloads itself, and a green toast says **"Updated to v48.16"** for 6 seconds.
- If John raises the minimum version and a phone is below it (and online, with that version published), an amber banner appears under the sync bar:
  > **Update needed.** This app is v48.15; v48.16 or newer is required. It updates by itself as soon as your changes have uploaded and nothing is open for editing. Until then you can view jobs, STOP running samples and finish what you have entered, but you can't add new events or samples or press START. *Waiting for: 2 changes to upload.*
  A tap on a blocked button shows "Blocked until the app updates to v48.16. Your data is safe."
- A phone that's offline carries on as normal and updates once it's back online.

## When the swap is held

Any of these holds the reload. The app tries again after the next save or sync, when it goes to the background, and every 20 seconds:

- a box is focused, typed into and not yet saved (change / blur), or anything was typed or tapped in the last 30 s
- the new project / new event / edit event / pick sample type / hire request form is open, or a fit-test confirm or sign screen is open
- any dialog is open, including the ☰ menus, the COC turnaround picker, the STOP flow question and the laptop reminder
- this device has changes, photos or Drive files it hasn't uploaded yet. Server-side Drive copying doesn't hold the update.
- a START or STOP location fix is still being taken
- a noise calibration (start or end of day, today or yesterday) has only one of its two values entered

## Data safety

- The worker only drops old `envss-field-v*` caches. It never touches localStorage, IndexedDB (`envss-field-photos`, `envss-field-drive`, …) or the OCR caches. The test checks that every localStorage key and IndexedDB database survives an update.
- `sw-field.js` no longer calls `skipWaiting()` on install. A new worker waits until the page sends `SKIP_WAITING`.
- Page navigations revalidate (`cache: no-cache`), so the update reload doesn't get a 10-minute HTTP-cached field.html. The reload URL carries `?u=<version>`, which is removed again on load. A loop guard stops after 3 tries in 30 minutes.

## Minimum version (SQL not applied)

- `work/settings_v48_16_01_app_settings.sql` creates `public.app_settings` (staff read only via `is_envss_staff()`, no write grants) and seeds `min_field_app_version = '0'` (off).
- `work/settings_v48_16_01_app_settings_rollback.sql` drops the table.
- The gate fails open when the setting is missing, unreadable or not a version, or when the device is offline, not signed in, or the required version isn't published yet.

To require a version after it is published:

```sql
update public.app_settings set value = '48.16', updated_at = now(), updated_by = 'John Breed' where key = 'min_field_app_version';
```

Devices on v48.15 or older don't have this code. They pick up v48.16 the next time the app is reloaded or reopened online (the page is network-first). From then on, updates happen by themselves.

## Tests

```
ROOT=/workspace/envss-v4816 OUT=/workspace/fit-shots/v4816 node work/v48-16/test.mjs [chromebook|pixel7]
```

The test serves two copies of the app from one local origin: this branch (v48.16) and a pretend next deploy (v48.17). It switches between them to simulate a publish. Supabase is mocked in memory, so no production calls are made.
