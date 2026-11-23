# v48.7 draft — same-device save clash (item 23) + second tab warning (item 22)

John, 23 Nov 2026 AWST. Draft only: merging field.html to main publishes the live app. Built on v48.5 (PR #12);
rebase onto main once 48.5 is merged. No SQL, no Supabase changes.

## Root cause (item 23)
Supabase audit trail (read-only SQL, 20–23 Nov) shows each "Merged with a newer copy from another device" came seconds
after the same person's own save, and the edit just before it had to be typed twice (Ben's location 08:33:27 and
08:33:32, John's pump serial 22:38:07 and :12, Marisabel's START on sample 10 at 15:19:26 and :33, Marisabel's
sample 1 analyses RES at 13:19:18 then "(empty) → SIL" at 13:19:21; all AWST).

The app pulls every sample every 8 s (and on returning to the app) while it sends saves. A pull that read Supabase
just *before* a save landed could answer just *after* the send finished. The stale rows then replaced the sample on the
device (the edit vanished from the screen) and were recorded as the "last synced" copy. The next save found its own
earlier save in Supabase, took it for another device and merged. On 20 Nov the screen had lost RES, Marisabel ticked
SIL, and the merge treated `analyses` as one value, kept "SIL" and dropped RES.

## Fix
- Bulk pulls are numbered. A pulled row is ignored for a record that was being sent while that pull was out, was sent
  after it left, or has a change on this device not yet sent (the send + merge path handles those).
- A record edited while it was being sent stays queued straight away (no gap where a pull can replace it).
- The device remembers its last 5 saves of each record; Supabase holding one of them is never treated as a clash.
- Merging: when both sides changed a list (analyses etc.), every entry from both is kept (matched by code / id /
  serial). A removal is only honoured when the other side did not change that list. Audit entries are still merged.
- Same signed-in person on another device / tab is labelled "This account on another device or browser tab".

## Second tab (item 22)
Only one tab or window edits at a time (navigator.locks, BroadcastChannel fallback). Any other tab shows a banner:
"ENVSS Field is already open in another tab or window on this device. This tab is read-only…" with
**Use this tab instead**. That tab asks the editing tab to finish sending, save and stop; then reloads and edits.
A read-only tab never writes the device copy, IndexedDB or Supabase; a change typed there is undone on screen and
the banner flashes. If the editing tab closes, the read-only tab says so and offers **Edit in this tab**.

## Tests
`ROOT=/workspace/envss-clash LABEL=after node work/v48-7/test.mjs` (playwright-core in /tmp/pwt, system Chrome,
Pixel 7 412×915 and Chromebook 1366×768). Supabase answered by an in-memory mock; *.supabase.co mapped to a dead port.
- before (v48.5): 14/32 — RES lost, self-merge on 1 of 1 and 5 of 10 quick edits, no tab guard.
- after (v48.7): 38/38. Results JSON and screenshots in this folder (`before-*`, `after-*`).
- Older suites (v46 test both viewports, v48 regression, v48.4 tests): no new failures; only the
  version-string checks differ, as they did on v48.5.
