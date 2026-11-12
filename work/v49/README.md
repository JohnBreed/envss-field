# v49 draft — AFM field-app changes

Draft only. Do not merge or publish until John approves.

Run checks (Supabase is mocked; no production writes):

```
ROOT=/workspace/afm-build node work/v49/test.mjs chromebook
ROOT=/workspace/afm-build node work/v49/test.mjs pixel7
```

Screenshots land in `work/v49/shots/`. The upgrade fixture is `work/v49/fixtures/afm-upgrade-v34.json`.
