# Drive copy worker (Chromebook install)

The field app keeps the local download. It also queues a copy. This Apps Script, signed in as **developer@envss.com.au**, creates **new** files in `{job}_Field-App` inside the job’s project folder on the Current Projects shared drives. It runs every 5 minutes.

It does **not** edit, move, rename, or delete existing files in a job folder. The only file it updates is the `manifest.csv` (or a uniquely named `manifest_2.csv` if that name is already taken) inside `{job}_Field-App`, and only the copy it created itself (tagged `envssManifest=1`). If a name is already taken it uploads `name_2`, `name_3`, and so on. Each queued item is copied once: a `source_key` that already has a file in that folder is not uploaded again, and `drive_file_id` is stored. Queue status updates always patch by row id.

The Supabase key is the Script Property **`drive-worker`**. It is a dedicated secret API key with that same name, not the service-role key. It is not in the app and not in git.

## Before you start

1. Apply `work/drive_v45d_01_drive_copy_queue.sql` in the Supabase SQL editor (project `luyprcmjyruznluboyms`). Do that before relying on the queue. Rollback is the matching `_rollback.sql` file.
2. The developer@ account needs to be able to **add files** on the Current Projects shared drives (Contributor or Content manager). It does not need permission to edit existing job files.
3. In the Supabase dashboard for `luyprcmjyruznluboyms`: **Project Settings → API Keys → Create new secret key**. Name it **`drive-worker`**. Copy that key once. It can be revoked on its own without rotating any other key. Do not use the service-role key.

## Install on the Chromebook

1. Sign in to the Chromebook as **developer@envss.com.au**.
2. Open [script.google.com](https://script.google.com) → **New project**. Name it `ENVSS Field Drive copy`.
3. **Project settings** (gear) → tick **Show "appsscript.json" manifest file**. Set the time zone to **(GMT+08:00) Perth**.
4. Select all of `Code.gs` in the editor and replace it with the contents of `work/drive-worker/Code.gs` in this repo. Save.
5. Left menu → **Services** (or the `+` next to Services) → add **Drive API**. Choose version **v3**. The identifier must stay `Drive`.
6. In the associated Google Cloud project (the script shows a link under Project settings), enable the **Google Drive API** as well. Apps Script’s advanced service and the Cloud API both have to be on.
7. Project settings → **Script properties** → **Add script property**:
   - Property: `drive-worker`
   - Value: the dedicated Supabase secret API key you just created and named `drive-worker`
   Save. Do not email the key, do not put it in the sheet, and do not paste the service-role key here.
8. In the editor, choose the function **`testFolderMatch`** and **Run**. The log should show one folder for `0019333` (`TEST_FOLDER_ID_0019333`) and one for `0019032` (`18vWLmc4YG8u7_oYngUaDtv6ppxpGiLb4`) when those names are the fixtures in the function — that run does not call Drive. Then choose **`processDriveQueue`** and **Run**.
9. Google will ask you to authorise. Review the scopes (Drive, and external requests to Supabase). Approve as developer@envss.com.au.
10. Left menu → **Triggers** → **Add trigger**:
    - Function: `processDriveQueue`
    - Event source: **Time-driven**
    - Type: **Minutes timer**
    - Interval: **Every 5 minutes**
    Or run `installTrigger` once from the editor; it replaces any older `processDriveQueue` trigger with a 5-minute one.
11. Leave the project owned by developer@envss.com.au. A trigger runs as the account that created it.

## What “stopped” means

| Queue message | App shows | Why |
| --- | --- | --- |
| `job folder not found` | Drive copy waiting: job folder not found | No shared-drive folder whose name starts with the 7-digit job number and then a non-digit. |
| `job folder not unique` | Drive copy waiting: job folder not unique | More than one such folder. The worker does not guess. |
| `field-app folder not unique` | Drive copy stopped: field-app folder not unique | More than one `{job}_Field-App` and it is not clear which one we created. |

`0019032_Admin` and `0019032_Lab` are ignored. They are not the project folder.

A stopped row stays stopped. After the folder situation is fixed, set that row’s `status` back to `queued` and `next_at` to now in the Supabase SQL editor (the table is not writable by the field app). The app cannot update the row.

## Names

- Photo: `0019333-001_S03_filter_1.jpg` (S = sample, N = noise, then the sample number, type `filter` / `equip` / `log`, then a count).
- Generated file: `0019333-001_Laboratory_COC.xlsx`. The next generation is `…_COC_2.xlsx`. The worker adds a further `_n` only if that exact name is already in the folder.
- `manifest.csv` in `{job}_Field-App` lists what this worker created.

## Check a copy

After a COC or a photo has uploaded, wait for the next 5-minute run (or press Run on `processDriveQueue`). The field app should say **In Drive** and **Open in Drive**. The file is a new file inside `0019333_Field-App`. Nothing else in `0019333 …` should have changed.
