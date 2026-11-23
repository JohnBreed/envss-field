# v48.7 draft: lock-down guards (open item 3)

John, 23 Nov 2026 AWST: all lock-down fixes approved; the 14 h STOP rule is a **warning** (6:26 pm), not a block.
Everything is in one layer at the end of `field.html` (`v48.7 draft: lock-down guards`). No schema change.

| Guard | What it does |
|---|---|
| a | End flow read-only until STOP (hygiene airborne + AFM). After STOP, end flow exactly equal to start flow: inline warning + one "is that right?" prompt (Yes / Re-enter). |
| b | STOP more than `STOP_LIMIT_H` (14) h after START: "Stop anyway / Cancel". Same on Edit time / Enter time for 14–24 h (over 24 h keeps the v48.3 prompt). `STOP_LIMIT_MODE` = `"warn"` (also `"block"` / `"off"`). |
| c | Sample head (hygiene) or cowl (AFM) already running on another sample, any event: inline warning; START / Start all asks "Start anyway?". |
| d | Company / contractor picklist: project client first, every company already on a sample, "Other (type it)". Still stored in `person.company`. |
| e | Noise START blocked until that day's start-of-day calibration (level + reading) is on the event. Added to `startGaps`. |
| f | START / STOP or typed times on a laptop / Chromebook: `needsOfficeApproval` on the sample; admins see a card, row chip and event count and can approve (`officeApproval`, audit). Never blocks. |
| g | Stopped sample: empty boxes free; changing a filled box or an answered Yes / No needs a reason (audit `Edit after STOP unlocked`); unlocked until you leave the sample. |

Tests: `ROOT=/workspace/envss-lock node work/v48-7/test.mjs` (Pixel 7 + Chromebook, Supabase mocked in memory, `*.supabase.co` mapped to a dead port). Screenshots: `/workspace/lock-shots/`.
