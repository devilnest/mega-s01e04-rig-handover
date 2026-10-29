---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

## Completed issue list

- [#1 — Shared digest reader contract](https://github.com/devilnest/mega-s01e04-rig-handover/issues/1)
- [#2 — Nightly run-log reader](https://github.com/devilnest/mega-s01e04-rig-handover/issues/2)
- [#3 — HTML digest page](https://github.com/devilnest/mega-s01e04-rig-handover/issues/3)
- [#4 — JSON digest endpoint](https://github.com/devilnest/mega-s01e04-rig-handover/issues/4)
- [#5 — Status-board links and event counts](https://github.com/devilnest/mega-s01e04-rig-handover/issues/5)
- [#6 — Digest route tests](https://github.com/devilnest/mega-s01e04-rig-handover/issues/6)
- [#7 — Public preview and reviewer inspection](https://github.com/devilnest/mega-s01e04-rig-handover/issues/7)
- [#8 — Marker removal and plan archival](https://github.com/devilnest/mega-s01e04-rig-handover/issues/8)

Completed on 2026-10-29 after the course confirmed that the reviewer had seen the marked preview.
The same public URL now serves the page with "no marker set":
https://devilnest.github.io/mega-s01e04-rig-handover/

Validation: 29 tests and strict TypeScript checks pass locally and in GitHub Actions. The
five-job fixture still reports one bad line. Run fixtures are unchanged. Public cleanup
deployment 40945795056 passed, and its HTML exactly matches the approved marker-free copy.
