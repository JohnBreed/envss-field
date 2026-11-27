# v48.18 draft — same-device save clash + second tab (from PR #17) + quieter same-device merge audits

DRAFT only: merging field.html to main publishes the live app. Numbered v48.18, stacked on v48.17 (PR #29, Drive badge wording). Do not merge or publish until John approves, and not before v48.17.

No SQL, no Supabase changes, no live publish.

## What changed versus draft PR #17

PR #17 was a v48.7 draft on top of v48.5. This brings that fix up to current main and adds:

- Version is **48.18** (SW cache `envss-field-v48-18`). The original #17 work lived in `work/v48-7/`, which main already uses for the auto-create event tests, so the clash tests now live in `work/v48-18/`.
- v48.16 auto-update and minimum-version behaviour is unchanged. The update path will **not reload while a save is in flight** (`flushing` or an inflight send) and a **read-only second tab will not apply an update** (so it cannot `SKIP_WAITING` under the editing tab).
- Noisy repeated **"Merged with a newer copy from another device"** audit lines from the same person on the same device are cut down: this device's own recent saves are never treated as a clash, and an audit-only or already-recorded same-who merge is not written again within 10 minutes. A genuine two-device edit (including the same account on a different device when user-facing fields differ) is still merged and audited, now labelled "This account on another device or browser tab" when the account matches.
- Mid-send requeue, stale-pull numbering, list-union merge and second-tab read-only lock are the same idea as #17, ported onto current `field.html`.
- Mid-send requeue only applies when a send actually landed. If send returns null (an auto-created event adopted from another device, or a Podio project skipped), the queue entry is dropped so this device does not overwrite the other copy.
- The v48-9 browser suite now boots each page in its own browser context, so the second-tab lock does not make later OCR pages read-only.

## Tests

```
ROOT=/workspace/envss-v4818 PWT=/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/index.mjs \
  LABEL=after OUT=/workspace/clash-shots/v4818 node work/v48-18/test.mjs

ROOT=/workspace/envss-v4818 node work/v48-18/real-data.test.mjs
```

Headless Chrome, Pixel 7 412×915 and Chromebook 1366×768. Supabase is an in-memory mock; `*.supabase.co` is mapped to a dead local port.

The real-data test uses a read-only copy of event **0019185-002** (10 samples) taken 27 Nov 2026 AWST. Contact fields were stripped before the fixture was saved. Nothing is written back to the live project.

Older suites (v48-16, v48-7, v48-8, v48-9, v48-13) had their version-string checks updated from 48.16 to 48.18 (the v48-16 auto-update suite pretends the next deploy is 48.19).
