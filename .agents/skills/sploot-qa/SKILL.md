---
name: sploot-qa
description: |
  QA Sploot changes by exercising the real running app, not just tests. Sploot is
  a Next.js 15 meme library (web UI + App Router API in apps/web) with text→image
  semantic search, plus a WXT Chrome extension in apps/extension. "Tests pass" is
  not QA. Use when: "QA this", "verify the feature", "smoke test", "check the
  app", "test sploot". Trigger: /sploot-qa.
argument-hint: "[web|api|extension|route|feature]"
---

# sploot-qa

QA in Sploot means walking the surface that changed against a running app. The
deterministic gate is CI parity — `pnpm lint && pnpm type-check && pnpm --filter
web test && pnpm --filter extension build` (root `AGENTS.md` Gate Contract) — and
it is **necessary but not sufficient**: `pnpm --filter web test` is vitest in
jsdom, so green proves units, not that the grid renders, text→image search
returns results, or upload persists. Those need the running app on a pgvector DB.

## Surfaces

| Changed area | Surface | QA path |
|---|---|---|
| `apps/web/app/app/**`, `apps/web/components/**` | Web UI | Boot app, land on `/app` logged-in, walk the golden path the change touched; watch console + network |
| `apps/web/app/api/**` | API routes | Replay the route against the running server with a qa-local token; check status + JSON shape + a 401/400 edge |
| `apps/extension/**` | Chrome extension | `pnpm --filter extension build`; for behavior, load unpacked in Chrome, test popup/background capture |
| `packages/common/**` | Shared contract | Rebuild both consumers: `pnpm --filter web type-check && pnpm --filter extension build` |

Golden path (product): sign in → `/app` grid → search or upload → asset embeds →
text→image search finds it → favorite/tag. Web routes: `/app`, `/app/search`,
`/app/upload`, `/app/settings`, `/app/tags`, `/app/meme`.

## Start local runtime

```sh
pnpm install
pnpm dev:local      # push-button: docker pgvector + migrate + qa:seed + qa-local
                    # auth + dev server + doctor evidence (.sploot-local/doctor/);
                    # sign in via http://localhost:3001/api/qa-auth/login;
                    # teardown: pnpm dev:local:down
# — or against real services —
cp apps/web/.env.example apps/web/.env.local   # fill required vars (below)
pnpm dev            # web: http://localhost:3001  (turbo runs all apps)
pnpm dev:web        # web only, same port
```

- Env (`apps/web/.env.example`, required for real behavior): `DATABASE_URL`
  (pgvector Postgres), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`,
  `BLOB_READ_WRITE_TOKEN`, `REPLICATE_API_TOKEN`. Local QA DB default (no cloud):
  `postgresql://test:test@localhost:5432/sploot_test` against a local pgvector
  Postgres — `qa:seed` writes deterministic embeddings so search/piles work
  offline without Replicate.
- Auth without Clerk (non-prod only): set `SPLOOT_QA_AUTH_MODE=enabled` and
  `SPLOOT_QA_AUTH_SECRET=<32+ char secret>`, then present a signed token via the
  `x-sploot-qa-auth` header or `sploot_qa_auth` cookie (`apps/web/lib/auth/qa-local.ts`).
- Seed a usable library: `pnpm --filter web qa:seed` → user `qa-design-user` + 24
  assets (incl. GIF/video); `--teardown` to clean. Refuses non-localhost `DATABASE_URL`.

## Web UI QA — golden path

Reach a seeded, logged-in state (qa-local auth + `qa:seed`), then:

1. Open `/app` with the qa-local cookie set — grid must render seeded memes (not a
   sign-in wall, not an empty state).
2. Exercise the flow the diff touched: type a query in the search bar (semantic
   text→image search, POST `/api/search`); drag a file into the upload zone
   (`/api/upload` → `/api/embeddings`); or toggle a favorite / pile filter.
3. Confirm the DOM result AND the network call (ranked results, asset created +
   embedding kicked) — not just that the page loaded.
4. Watch **console errors and failed requests** the whole walk — a green grid with
   a red console is a FAIL. Try one edge: empty query, unauth (no cookie →
   `/sign-in`), or a bad file type.

### One-command evidence harness (preferred)

`qa:evidence` seeds, boots `next dev` (random port ~3100–3499), sets the qa-local
cookie, walks routes via `agent-browser`, captures screenshots + console/errors,
and writes a packet to `docs/qa/evidence/<date>-<slug>/`:

```sh
pnpm --filter web qa:evidence --slug <slug> --intent "<what this proves>" \
  --routes /app,/app/search --gates
# reuse a server you already started: --base-url http://localhost:3001
# feature probes: --expect-piles  --expect-taste  --exercise-pile-filter
```

Read the packet's screenshots and transcripts — the run is not the QA, the
evidence is. Playwright auth smoke only: `pnpm --filter web e2e:auth` (port 3108).

## Gotchas

- `SPLOOT_QA_AUTH_MODE` is hard-refused when `NODE_ENV=production` — local
  only, never against a deployment. And seeded images 404
  unless it is `enabled` (the QA image loader maps the blob host to
  `public/qa-blob-seed/` only in that mode).
- No fixed dev port: `pnpm dev` uses 3001, `qa:evidence` a random 3100–3499,
  Playwright 3108. Don't hardcode a port when a harness booted the server.
- DB paths need a **pgvector** Postgres (plain Postgres fails the vector columns);
  `qa:evidence` needs the `agent-browser` CLI on PATH; real (non-seed)
  upload/search also need `BLOB_READ_WRITE_TOKEN` + `REPLICATE_API_TOKEN`.

## Report

Return: **verdict** (PASS / FAIL / UNVERIFIED) · exact commands run · surfaces
exercised · evidence inspected (packet path under `docs/qa/evidence/`,
screenshots, network/console) · what was NOT covered (e.g. "seed data only, no
live Replicate search") and whether a deployed smoke (`pnpm --filter web
smoke:deployed`) is owed.
