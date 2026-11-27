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

## Guards
1. **Laptop / Chromebook START or STOP**: "Not at the pump?" warning, confirm with "Press START/STOP anyway". The sample is flagged `needsOfficeApproval`; admins see a "Needs office approval" card with an Approve button (`officeApproval` keeps who / when / count). The event list shows a chip and a count. The old v48.3 after-press nudge is suppressed when the warning was confirmed.
2. **14 h STOP**: warning only (also in the Edit time dialog).
3. **Head already running** on another sample: the existing warn-and-confirm is kept; nothing new blocks.
4. **Company**: suggestions are the project client, then companies used before (case / space duplicates folded). A new company is accepted as typed and added to `db.catalogs.companies`.
5. **Noise calibration**: START needs a start-of-day calibration reading (added to the start checklist). Drift over 0.5 dB shows a warning to confirm.
6. **Stopped sample**: a 5 min grace banner after STOP; after that, changing a filled field asks for a reason (audit `g19edit`).
7. **Late manual start**: a typed start at least 15 min old needs a comment (at least 5 characters).
8. **Location** must be filled before Mark event complete or Create COC. Blanks, fibre, not used, rejected and fault samples are exempt. The modal lists the samples with an open link to each.
9. **Rotameter pick-list** on the sample, AFM event, new event and edit event screens. Values are the Podio list plus ones used on other samples. An old value not in the list is kept and labelled "(not in the list)". AFM field blanks need none.
10. The old end-flow lock (PR #15 guard a) is dropped; v48.8 STOP deviation prompt covers it.

Data: new sample keys only (`needsOfficeApproval`, `officeApproval`) and audit entries. No schema or Supabase change.

## Tests
`ROOT=<worktree> OUT=/workspace/guard-shots/v4819 node work/v48-19/test.mjs [pixel7|chromebook]`. Supabase is stubbed in memory and never live.
