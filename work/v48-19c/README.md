# v48.19c capture guards (stacked on PR #31, v48.19)

Built from John's answers to the 28 Nov 2026 usage review. Nothing here is published, no SQL, no Podio writes, no emails.

| Guard | Where | What it does |
|---|---|---|
| Fit-test: OCR fills the boxes | `fit-test.js` | Photo opens the confirm screen in a "reading" state (Continue off). Vision values land on the live record and the boxes, also on retake. A box the tech never touched cannot be written back blank over what OCR stored. Retake: non-blank new values replace old, blank OCR never blanks. |
| Fit-test: Sign / PDF gate | `fit-test.js` | Pass/fail, company, respirator model, protocol (and names) must be filled to continue, sign, make the PDF, or mark the event complete. The "Still to fill in" list names the blanks. |
| Fit-test: no empty report | `fit-test.js` | "Enter manually" is held in memory until something is typed; Save draft on an empty form saves nothing; already-saved empty reports are labelled and not counted (never deleted). |
| End flow | `field.html` (v48.8 question) | Expected end flow = start is offered, but the tech must tap "Rotameter reads X L/min: confirm" (or type a reading). Equal-to-start is recorded as `endFlowBasis` = confirmed_equal / typed_equal with audit "End flow confirmed equal to start" (quick back-to-back confirms are noted); different readings = measured. |
| Noise stop | `field.html` (last script), `noise.js` | LAeq and LCpeak must be entered before STOP (or a typed stop time) completes; hearing protection (Yes/No/Unknown) is asked there if not answered. Fails open if noise.js is missing. |
| Daily log | `field.html` (v44c block) | Every stopped personal sample is queued for the daily-log prompt; the sheet stays (no 20 s timeout), shows how many are waiting, survives reload. |

Guards go forward only: stopped samples are not retro-blocked, running samples from before still open and stop (they are just asked first). No schema change.

Run: `ROOT=$PWD OUT=/tmp/out node work/v48-19c/test.mjs [pixel7|chromebook]` (68 checks). `fixtures/fit-vision.json` is a made-up worker + company in the shape of a real Vision reply.
Known stale pin: `work/v48-6/test.mjs` expects "v48.8".
Existing tests adjusted: `work/v48-8/test.mjs` (noise STOP now asks for results), `work/v48-9/test.mjs` (company/protocol now required before signing).
