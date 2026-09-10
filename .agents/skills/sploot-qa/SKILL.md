---
name: sploot-qa
description: Exercise a running Sploot web, API, or extension surface and report observable evidence. Use for "QA this", "verify the feature", "smoke test", or "test Sploot".
argument-hint: "[web|api|extension|route|feature]"
---

# Sploot QA

In OMP invoke as `/skill:sploot-qa` (other skill-aware clients may use `/sploot-qa`). Exercise the changed surface against a running app. Unit-test
success does not prove that the web grid renders, semantic search returns
results, or upload persists.

## Surface map

- Local Go UI/API (`apps/server/**`): use real account registration, private
  media and local inference; exercise the actual browser and HTTP boundary.
- Retained Next UI/API (`apps/web/**`): use the documented predecessor
  environment or its isolated QA auth; do not confuse this with Go acceptance.
- Extension (`apps/extension/**`): run its WXT build; for behavior, load the
  unpacked extension and exercise popup/background capture.
- Common package (`packages/common/**`): type-check web and build extension.

The product path is sign in → `/app` grid → search or upload → embedding →
text-to-image result → favorite/tag. Relevant routes include `/app/search`,
`/app/upload`, `/app/settings`, `/app/tags`, and `/app/meme`.

## Local runtime

For fresh isolated Go setup, source/binary identity, the existing stories'
correctness criteria, discovery and bounded cleanup, load [local-go.md](local-go.md).
It complements the runtime manual; it does not add another runner or replace
the retained Next/extension procedures below.

The ordinary application is persistent, not a seeded QA session:

```sh
pnpm dev
pnpm --filter server run doctor
```

Accounts and media survive shutdown in `.sploot-local/library`. Never seed,
reset or delete that directory to exercise a user story. Use the isolated
Go gauntlet for repeatable browser, inference, ownership and recovery checks:

```sh
pnpm --filter server build
pnpm --filter server smoke --keep --binary build/sploot
```

It allocates a private temporary library, registers actual accounts and indexes
new media with pinned local CLIP. Host prerequisites and real extension
acceptance are maintained in `apps/web/docs/DEPLOYMENT.md#acceptance-gates`. There is no Go QA-auth
door or mandatory Clerk/Neon/Blob/Replicate credential.

The retained Next application remains separately available through
`pnpm dev:web`; its provider/pgvector/QA-auth procedure is in
`apps/web/docs/DEPLOYMENT.md`. Do not run both applications on the same port.

## Evidence

For the local Go gauntlet, inspect the printed per-story results and retained
desktop/mobile screenshots. `--keep` also retains private test databases and
media; it does not sanitize or publish them.

For a retained Next surface, use its existing evidence runner:

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
or failed request fails QA even when the page loads. Predecessor DB paths require
pgvector; its `qa:evidence` runner requires `agent-browser` and seeded image URLs
require QA auth mode. The local Go product uses SQLite and actual local inference.
Do not hardcode a port chosen by a harness.

## Report

Return `PASS`, `FAIL`, or `UNVERIFIED`; exact commands; surfaces exercised;
evidence paths and observed DOM/network/console behavior; and uncovered paths.
Local Go acceptance is not a production cutover, Web Store release, Apple signing
or physical iPhone proof. Report predecessor deployed smoke separately when owed.
