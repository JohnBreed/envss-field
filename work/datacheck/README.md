# v45c → v46 → v47 data-preservation checks (11 Nov 2026)

Read-only snapshots of the live Supabase tables are taken with SELECTs only and kept on the box (`*.json`, git-ignored, never published).
The upgrade tests run against an in-memory PostgREST-style mock seeded with a COPY of those rows; they never contact the live database.

- `s1_synced.mjs` — synced device, upgrade v45c → v46 → v47, idle + browse every event/sample: no record lost/changed, no core-table write.
- `scen.mjs s2` — unsynced edits (start, comment, new sample, admin delete → tombstone, event note) queued on v45c with Supabase unreachable; upgrade; reconnect.
- `scen.mjs s3` — device fully offline on v45c, new version published meanwhile, reconnect, then offline reloads/edits on v46, reconnect, then v47.
- `scen.mjs s4` — two devices (Chromebook + Pixel 7): stale copy on upgrade, parallel edits, same sample/different fields, same field.
- `scen.mjs s5` — two devices, edits queued on v45c (no synced base copy yet) merged after the upgrade.
- `compare.mjs a.json b.json` — per-row before/after comparison of the live snapshots.
