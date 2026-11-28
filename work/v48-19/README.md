# v48.19 lock-down guards (supersedes draft PR #15)

Built on v48.18 (PR #30, on top of v48.17 / PR #29). One new layer at the end of `field.html` (`window.v4819`, prefix `g19`).

## Constants (top of the layer)
| Constant | Value | Meaning |
|---|---|---|
| `STOP_LIMIT_H` | 14 | STOP (or typed times) more than 14 h after START: warn and confirm |
| `STOP_LIMIT_MODE` | `"warn"` | warning only, never a block |
| `STOP_EDIT_GRACE_MIN` | 5 | minutes after STOP when fields can be fixed with no reason |
| `LATE_MANUAL_START_MIN` | 15 | typed start (START never pressed) this far in the past needs a comment |
| `NOISE_DRIFT_DB` | 0.5 | start-of-day calibration drift that triggers the warn-and-confirm |
| `SWITCH_TZ` | `"Australia/Perth"` | the switch dates below use the device clock's date in Perth |
| `NOISE_CAL_BLOCK_FROM` | `"2026-12-01"` | before: dose badge START with no pre-start calibration = warning + confirm; from: blocked |
| `LATE_COMMENT_BLOCK_FROM` | `"2026-12-04"` | before: late manual start without a comment = warning + Save again; from: comment required |
| `COMPANY_TYPO_MAX` / `COMPANY_TYPO_LONG` | 2 / 15 | "Did you mean …?": 1 edit, or 2 on names of 15+ letters with the same first letter |

## Guards
0. **Deep link** `#event=<eventId>&sample=<trainId>`: the hash is saved to sessionStorage in `<head>` (the Google sign-in round trip loses it). The link is opened once the user is signed in and the sample has synced to the device; it gives up after 10 min.
1. **Laptop / Chromebook START or STOP**: "Not at the pump?" warning, confirm with "Press START/STOP anyway". The sample is flagged `needsOfficeApproval`; staff see "Flagged to the office" on the sample (with a prompt to fix the time on their phone with Edit time) and a "flagged to office" chip on the event. Admins see a "Needs office approval" card with an Approve button (`officeApproval` keeps who / when / count). The event list shows a chip and a count. The old v48.3 after-press nudge is suppressed when the warning was confirmed.
2. **14 h STOP**: warning only (also in the Edit time dialog).
3. **Head already running** on another sample: the existing warn-and-confirm is kept; nothing new blocks.
4. **Company**: suggestions are the project client, then companies used before (case / space duplicates folded). A new company is accepted as typed and added to `db.catalogs.companies`. Likely misspellings or near-duplicates (case, spacing, small typos including swapped letters, or a short form like "Mac" for "MacMahon") show "Did you mean X?" with Keep as typed. A project client's spelling (from Podio) wins over a more common sample typo. A stored near-duplicate is flagged on the sample. Nothing is merged or rewritten.
5. **Noise calibration**: until 30 Nov 2026, a dose badge START with no start-of-day calibration shows a notice and a warning to confirm. The text says that from 1 December 2026 it won't be able to start. From 1 Dec 2026 00:00 AWST, START is blocked (on the start checklist) until the calibration is recorded. Drift over 0.5 dB stays a warning to confirm.
6. **Stopped sample**: a 5 min grace banner after STOP; after that, changing a filled field asks for a reason (audit `g19edit`).
7. **Late manual start**: a typed start at least 15 min old asks for a comment. Until 3 Dec 2026 it's a warning that mentions 4 December 2026, and Save again carries on (noted in the audit trail). From 4 Dec 2026 the comment (at least 5 characters) is required.
8. **Location missing** notifies the sampler and doesn't block. The sample shows "Location missing" under the box, and the event shows a count, links and a "no location" chip on each row. Mark event complete and Create COC list the samples with links and ask "… anyway / Go back"; carrying on is noted on each sample. Blanks, fibre, not used, rejected and fault samples are exempt.
10. **Capitalisation** of first name, last name and company: on blur, all lower case, ALL CAPS or mixed-up caps (jOHN, SMith) suggests Proper Case ("Capital letters: use John Smith? / Keep"). It handles Mc (McDonald), O' (O'Brien), hyphens, and van / de / der mid-name. Mac… is left alone (Macdonald, Mackenzie) because too many plain words start with mac. For companies, acronyms (BHP, JBS&G, WA, Pty Ltd) are kept, and a known spelling ("Did you mean …?") wins over the caps prompt. Stored values are never changed unless the tech taps the suggestion.
11. **Sync counter fix**: a clean (signed-out) device showed "21 changes still uploading" with nothing to send. In `pullActivity`, the v41 silent "Not stated" repair ran on the pulled samples before the deleted ones were dropped (that happens only after the slower hires / fit-report pulls). Live has 21 deleted samples from 2 Nov 2026 with an old automatic "not_stated", so they were marked pending until those pulls finished, and on a slow Chromebook that took a long time. Fixes: the v41 repair skips deleted samples, and as soon as deletions are merged, deleted samples leave the device copy and the queue, before any flush.
9. **Rotameter pick-list** on the sample, AFM event, new event and edit event screens. Values are the Podio list plus ones used on other samples. An old value not in the list is kept and labelled "(not in the list)". AFM field blanks need none.
10. The old end-flow lock (PR #15 guard a) is dropped; v48.8 STOP deviation prompt covers it.

Data: new sample keys only (`needsOfficeApproval`, `officeApproval`) and audit entries. No schema or Supabase change.

## Noise measurements (28 Nov 2026, noise.js 48.19)
Done in `noise.js`; `field.html` and `sw-field.js` are untouched. Tests: `ROOT=<worktree> OUT=<dir> node work/v48-19/noise.test.mjs [pixel7|chromebook]` (143 checks).

1. **Add measurement.** On a noise event (`ev.type === "noise"` or `ev.podioEventKind === "noise"`) the Add sample screen is "Add measurement" and offers only: Noise · personal (dose badge) / Noise · area / task (sound level meter) / Noise · static dose badge. The old Noise · static is split at the first tap: the stored `trainKind` stays `noise_personal` or `noise_static`, and `noise.method` (`slm` / `dose`) is set at creation, with `noise.v20 = true` marking new-flow records. Old static records keep their method; one with no method yet still shows the chips and "needs answer". The Measurement type select lists the same three types (plus "Noise · static (method not chosen yet)" only for an old record with no method). Hygiene events are unchanged (all six types, "Add sample"). Wording on noise events, display only (a post-render pass): Add measurement, Noise Measurement N, the confirm text, the bottom bar "Measure", and the help text. Exports, audit entries and `displayNo` are untouched.
2. **SLM: Area / Task** (`noise.scope`). Task shows "What the worker is doing" (`noise.task`, e.g. operating a drill) and the position hint is operator's ear (placeholder, and first in the drop-down). New SLM measurements are asked for Area/Task (and the task text); old records are not. The 85 dB(A) extent + distance prompt shows for area and task (non-blocking warning only).
3. **New SLM fields** (Minah's 0019340 Measurements tab): SLM reading number, ENVSS reading number (auto: next after the highest on the event, editable), Additional comments (`noise.comments`).
4. **Equipment used** (event page, noise events): `ev.noiseEquip = [{id, type: mic|slm|cal, model, serial}]`, entered once. Each measurement picks per type (`noise.equip.{mic,slm,cal}` = item id). The pick is mirrored to the existing fields (`dosimeterSerial` + `noise.slmModel`, `noise.micSerial` + `noise.micModel`, `fieldCalibrator`), so nothing downstream changes. Editing a serial on the event updates the measurements that picked it (audit entry on each). Dose badges pick the calibrator only. Old text values show as "(this measurement only)".
5. **Drop-downs with type-your-own** for description / source, operating conditions, measurement position, task and equipment make / model. Built from values already on this event first, then earlier events. A typed value is kept exactly as typed.
6. **Octave bands** now start at 31.5 and 63 Hz (key `"31.5"` is special-cased in `setPath`). The Spectrum Table photo prompt is unchanged (LCpeak ≥ 140 or LAeq > 110).

Data: new keys inside `t.noise` and `ev.noiseEquip` only. Nothing is renamed or removed, and there is no schema or Supabase change.

## Tests
`ROOT=<worktree> OUT=/workspace/guard-shots/v4819 node work/v48-19/test.mjs [pixel7|chromebook]`. Supabase is stubbed in memory and never live.

Live company spellings flagged by the rule are listed (read-only) in the PR description. `/workspace/v4819-notes/variants.js` produced the list and isn't part of the app.
12. **Project pull trimmed** (John 28 Nov 2026): the app used to download every Podio project (5,187 rows, 6 requests, about 2.6 MB) on every start and then throw most away on the device. It now asks the server for field-created projects plus active Podio jobs (same rule the device already used: status not Closed / Cancelled / On Hold, any job type so AFM jobs typed HAZ stay), then adds any project that has a field event (server event list, this device's events, queued project edits) even if Podio closed it. Live check: 63 rows, 3 requests, about 30 KB, and nothing the device would have kept is missing. If the server rejects the filter (400) it falls back to the old full download. Test: `work/v48-19/projects-pull.test.mjs`.
   Database lock-down drafts (NOT applied): `work/lockdown_v48_19_01_signed_in_staff_only.sql` (+ `_rollback`), `work/lockdown_v48_19_02_dash_views_staff_only.sql` (+ `_rollback`), test script `work/lockdown_v48_19_TEST_in_rolled_back_tx.sql` and its results JSON.
