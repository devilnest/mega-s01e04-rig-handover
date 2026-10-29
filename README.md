# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Morning digest

- `pnpm test`: reader, routes and board checks.
- `pnpm typecheck`: strict TypeScript checks.
- `pnpm start`: serves only on `127.0.0.1`, default port 8787.
- `/digest/2026-10-28`: the sample night as HTML.
- `/api/digest/2026-10-28`: the same ordered rows and event counts as JSON.

The reader counts malformed records, keeps null owners, preserves original time offsets,
and uses chronological first/last events. The last error remains visible after a later success.
Blank lines are ignored. Event counts include retries; the rows count jobs.

## Public review copy

With rig running, export by command to a location outside this repository:

```sh
node scripts/export-preview.mjs http://127.0.0.1:8787/digest/2026-10-28 ../preview/index.html
```

The manual `Publish review preview` GitHub Actions workflow generates that same static copy,
runs the checks, and deploys it to GitHub Pages. It never commits HTML. Configure the repository's
Pages source as GitHub Actions and set the assigned marker as the `LANE_MARKER` Actions secret.
Only sample run data and the review marker appear on the public page.

For initial review, dispatch with `include_marker=true`. After the reviewer has finished and
the human approves cleanup, dispatch with `include_marker=false` to replace the same URL with
the banner `no marker set`. Remove the obsolete marker secret and archive the plan with its
issue list only after confirming the replacement. No automatic schedule or push trigger is used.
