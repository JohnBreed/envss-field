# Later: write a finished HYG event back to Podio (design only)

Not built. This release does not write to Podio. Do not point the field app at `api.podio.com`.

When a field event that was started from a Podio row is marked complete, a **dry-run** should run first and a live write only after someone turns dry-run off.

## Dry-run

A server function (service role + the same Podio app token) accepts `{ itemId, dryRun: true }` and returns the Podio `item` update body it **would** PUT. It does not call Podio. The app shows that body to the sampler and stores it on the event as `podioWritebackPreview`. Default remains dry-run. A separate explicit flag `dryRun: false`, checked server-side, is required before any PUT. The client never holds the Podio token.

Unplanned events (`Not in Podio yet - office to create/link`) are not written. The office creates or links the Podio item first. The preview can still show the values so the office can copy them.

## Fields to send

Podio app 24280319. External ids:

| Field | external_id | Value when fieldwork is finished |
| --- | --- | --- |
| Site Works attended by | `report-submitted-by` | App relation to the staff app (21061319). Match the signed-in person by name. If there is no match, dry-run reports "no staff item" and the live call skips this field rather than creating a staff row. |
| Site Works Start Date | `site-works-start-date` | The event date the sampler used (`YYYY-MM-DD`). |
| Actual site hours | — | **Not in the app today.** Sample start/stop is not site hours. Add an event-level timer later and send that duration. Do not sum sample runtimes and call them site hours. |
| Laboratory | `which-laboratory-is-processing-samples` | App relation. Send the lab already on the Podio item unless the sampler changed `ev.lab` to another known lab item. Do not create a lab row. |
| Field sheet link | `field-sheet-link` | Link to the field sheet file inside `{job}_Field-App` (the Drive file id once the copy is `copied`). |
| Project Google Drive Job Folder Link | `google-drive-job-folder-link` | Link to the `{job}_Field-App` folder the worker created, not a guess at the project root. |
| COC Status | `generate-report` | **Only** option id **10**, text **`Awaiting Lab Results`**. |

## Never send these COC Status options

They trigger Podio workflows (generate a COC or send samples):

| id | text |
| --- | --- |
| 3 | `*Generate COC MPL Lab` |
| 8 | `*Generate COC Merieux` |
| 9 | `*SEND Samples to Laboratory selected above (attaches most recent file)` |
| 13 | `*Generate COC ARL/Eurofins` |
| 14 | `*Generate COC ALS` |
| 15 | `*Generate COC SGS` |

The dry-run response must list the option id it intends to set and refuse to proceed if it is anything other than 10. A live call uses the same check and aborts without a PUT.

## Request shape (future)

`PUT https://api.podio.com/item/{item_id}` with only the fields above. No other fields. If Podio returns an error, leave the item unchanged and show the error. Do not retry a 4xx automatically.

The Drive copier’s rule still stands on the Google side: write-back updates **Podio fields**, it does not edit files already in the job folder.
