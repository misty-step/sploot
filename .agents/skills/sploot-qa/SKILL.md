---
name: sploot-qa
description: Exercise a running Sploot web, API, or extension surface and report observable evidence. Use for "QA this", "verify the feature", "smoke test", or "test Sploot".
argument-hint: "[web|api|extension|route|feature]"
---

# Sploot QA

Invoke as `/sploot-qa`. Exercise the changed surface against a running app. Unit-test
success does not prove that the web grid renders, semantic search returns
results, or upload persists.

## Surface map

- Web UI (`apps/web/app/app/**`, `components/**`): sign in, open `/app`, walk
  the changed flow, and inspect DOM, network, console, and failed requests.
- API (`apps/web/app/api/**`): call the route with a QA-local token; check status,
  JSON shape, and one unauthenticated or malformed request.
- Extension (`apps/extension/**`): run its WXT build; for behavior, load the
  unpacked extension and exercise popup/background capture.
- Common package (`packages/common/**`): type-check web and build extension.

The product path is sign in → `/app` grid → search or upload → embedding →
text-to-image result → favorite/tag. Relevant routes include `/app/search`,
`/app/upload`, `/app/settings`, `/app/tags`, and `/app/meme`.

## Local runtime

Preferred deterministic setup:

```sh
pnpm dev:local
# Docker pgvector + migrate + qa:seed + QA auth/server; teardown:
pnpm dev:local:down
```

Or configure `apps/web/.env.local` from `.env.example` and run `pnpm dev` or
`pnpm dev:web` (the web app uses port 3001 unless a harness chooses another).
The local QA database is pgvector Postgres, normally
`postgresql://test:test@localhost:5432/sploot_test`; `qa:seed` creates user
`qa-design-user` and 24 deterministic assets and refuses non-localhost URLs.

For non-production QA auth, set `SPLOOT_QA_AUTH_MODE=enabled` and a 32+ character
`SPLOOT_QA_AUTH_SECRET`; send the signed token in `x-sploot-qa-auth` or the
`sploot_qa_auth` cookie. This mode is rejected in production. Real uploads and
search also need `BLOB_READ_WRITE_TOKEN` and `REPLICATE_API_TOKEN`.

## Evidence

Use the one-command harness when possible:

```sh
pnpm --filter web qa:evidence --slug <slug> --intent "<what this proves>" \
  --routes /app,/app/search --gates
```

It seeds, boots a random-port server, authenticates, walks routes with
`agent-browser`, and writes screenshots/transcripts to
`.sploot-local/qa-evidence/<date>-<slug>-<unique>/` (gitignored). Use
`--out-dir <path>` for an exact new packet directory; relative paths resolve
from `apps/web` and existing directories fail rather than overwrite. Read the
artifacts; the command alone is not evidence. `pnpm --filter web e2e:auth` is
auth-only (port 3108).

Do not commit raw packets by default. Retain them in approved storage with
appropriate access/retention, then link a sanitized revision/scope/verdict from
Linear or the PR. The runner does not upload or redact. Historical
`docs/qa/evidence/` packets, curated fixtures, and selected public demo assets
remain in place; see `docs/qa/README.md` for the input/output boundary.

Check one relevant edge: empty query, no auth, or a bad file type. A red console
or failed request fails QA even when the page loads. DB paths require pgvector;
`qa:evidence` requires `agent-browser`; seeded image URLs require QA auth mode.
Do not hardcode a port chosen by a harness.

## Report

Return `PASS`, `FAIL`, or `UNVERIFIED`; exact commands; surfaces exercised;
evidence paths and observed DOM/network/console behavior; uncovered paths (for
example, no live Replicate search); and whether deployed smoke
(`pnpm --filter web smoke:deployed`) remains owed.
