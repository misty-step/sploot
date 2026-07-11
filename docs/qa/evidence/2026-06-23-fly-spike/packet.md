# Evidence packet: stack-sovereignty spike (044 child 6)

- Date: 2026-06-23
- Branch: `spike/044-fly-substrate`
- Ticket: Powder card `sploot-044` (child 6)
- Operator: agent, using **only credentials already on disk** — the Fly API token and
  `neonctl` auth. No Vercel/Clerk/Replicate secrets were present locally (verified: no
  `.env.local`, no `.vercel` link, none in env/`~/.secrets`).

## Claim under test

sploot can run on a substrate an agent **deploys + migrates + verifies + recovers from a
token on disk** — managed Postgres + pgvector, no self-hosted DB, **no dashboard step**.

The spike proves the **substrate**. It does not re-prove Replicate (embeddings) or Clerk
(auth): both are host-agnostic SaaS, already in prod, "keep unchanged" per the epic.

---

## 1. Provisioning — agent-only ✅

| Resource | How | Cost |
|---|---|---|
| Fly app `sploot-fly-spike-purple-dew-4268` (`iad`, misty-step) | `fly launch` / `fly deploy` | shared-cpu-1x/1GB, scale-to-zero → ~$2–6/mo |
| Fly Managed Postgres `sploot-spike-db` (`3x9jv024m38r6qp7`) | `fly mpg create --plan Basic` | **$38/mo** (shared 2×CPU, 1GB, 10GB; no scale-to-zero) |
| Neon `sploot-spike-neon` (`wild-voice-78394145`, aws-us-east-2) | `neonctl projects create` | **$0** free tier (scale-to-zero) |

First MPG cluster (`w867508ye57r3pk4`) hung >20 min in `initializing` (a Fly hiccup — two other
misty-step MPG clusters, one also `iad`, were `ready`); destroyed + recreated with one command.

## 2. Image build — host-agnostic, no secrets ✅

`fly deploy` on Depot remote builder: monorepo `pnpm install --frozen-lockfile` + `prisma generate`
+ `next build` → **43/43 static pages generated with ZERO real Clerk/DB/Replicate** (only a
format-valid dummy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` so `<ClerkProvider>` prerender doesn't throw).
Image **460 MB** (pragmatic full-install; a real cutover would use `output: 'standalone'`). Full log:
`01-build-push.log`.

## 3. Deploy + atomic migrate via `release_command` — the headline ✅ (on Neon)

`fly.toml` → `[deploy].release_command = "pnpm --filter web exec prisma migrate deploy"`. On
`fly deploy`, Fly runs it in a throwaway machine with the app's own `DATABASE_URL`, **before**
traffic cutover — the loop Vercel's build-withheld Sensitive secret model structurally can't do.

```
✔ release_command 5683605ea20958 completed successfully
✔ Machine [app] update finished: success
✓ DNS configuration verified
Visit your newly deployed app at https://sploot-fly-spike-purple-dew-4268.fly.dev/
```
Verified against Neon directly — **all 9 migrations applied**, pgvector v0.8.0, core tables
(`assets`, `asset_embeddings`, `users`) present.

> The app serves HTTP but Clerk-gated routes 500 with `@clerk/nextjs: Missing secretKey` — expected,
> no Clerk secret was provisioned. The DB (the substrate) is fully migrated and reachable from the
> app's network (the release machine reached Neon over the internet from inside Fly).

## 4. pgvector enable — the decisive divergence ⚠️ MPG vs ✅ Neon

Same non-superuser app role, opposite outcome:

- **Fly MPG** — `release_command` connected, found 9 migrations, and **failed on migration #1**:
  ```
  ERROR: permission denied to create extension "vector"   (SQLSTATE 42501)
  HINT: Must be superuser to create this extension.
  ```
  `fly-user` = role `schema_admin` (not superuser). Per Fly docs (fly.io/docs/mpg/extensions),
  pgvector on MPG is enabled **only via the dashboard toggle** — PostGIS has a
  `--enable-postgis-support` CLI flag; **vector has no CLI/API/MCP equivalent**. `fly mpg connect
  -u postgres` → "user postgres not found" (Fly doesn't broker the superuser). The browser path
  needs an interactive Fly login. **Net: a one-time human-gated step.**

- **Neon** — `neondb_owner` (`rolsuper = false`, same privilege level) ran it from the terminal:
  ```
  role: neondb_owner | superuser: false
  CREATE EXTENSION IF NOT EXISTS vector  →  pgvector enabled from terminal: v0.8.0
  ```
  Neon allow-lists pgvector as a trusted extension for the owner role. **No dashboard.**

## 5. pgvector semantic search on the substrate (Layer B) ✅

`spike-fly-pgvector-proof.mjs` (in this dir; run from `apps/web` so `pg` resolves) — seeds interpretable 512-dim concept vectors, runs the app's
EXACT cosine query (`image_embedding <=> ARRAY[…]::vector`, ordered by similarity) against Neon:

```
query: "a feline" → ranked by cosine similarity on the target DB:
  rank  asset        similarity  cosine_dist
  1     kitten.png     0.9945    0.0055
  2     cat.png        0.9707    0.0293
  3     dog.png        0.5318    0.4682
  4     truck.png      0.0000    1.0000
  5     car.png        0.0000    1.0000
verdict: PASS — felines rank top, vehicles orthogonal (~0). pgvector cosine ranking is correct.
```

## 6. Agent-ops verify + recover loop — token-only ✅

All from the Fly token, no dashboard:
- `fly logs` — surfaced the full arc (MPG `P1001` unreachable → MPG pgvector `42501` denial → clean
  Neon boot); also pinpointed the Clerk-secret 500.
- `fly status` — machine `started` (v3, iad). `fly releases` — v3 complete, v1/v2 failed (history an
  agent reads to roll back).
- `fly machine restart` — recovered the machine, returned `started`. (Rollback is the same one-command
  shape: `fly deploy --image <prior>`.)

---

## Cost comparison (solo scale)

| Stack | Monthly | Fully terminal? |
|---|---|---|
| **Vercel + Neon (today)** | Vercel Pro $20 + Neon | ❌ Vercel withholds `DATABASE_URL` at build; no `release_command` |
| **Fly app + Fly MPG** | ~$40–44 ($38 MPG + app) | ❌ pgvector enable is dashboard-gated |
| **Fly app + Neon (recommended)** | **~$2–25** (app $2–6 + Neon $0–19) | ✅ end-to-end, proven above |

## Verdict: GO — but the target is "leave Vercel, keep Neon," not "adopt Fly MPG"

The spike's real discovery: **the database was never the blocker — Vercel was.** Neon (sploot's
existing DB) is fully agent-operable: API + CLI + MCP, and pgvector enables from the terminal. The
only thing making sploot feel un-automatable was Vercel marking `DATABASE_URL` Sensitive (no
migrate-on-deploy). Moving the **app** to a host with `release_command` (Fly, proven here) while
**keeping Neon** delivers 100% terminal operability with **no data migration and no new gate** —
and it's cheaper.

- **Falsifier result:** the spike needed a human/DDL step **only on Fly MPG** (pgvector toggle). On
  Fly-app + Neon, every step ran from a token on disk. ✅
- **No self-hosted Postgres** in the recommended path. ✅
- **Fly MPG:** great app-layer agent-ops, but its extension model isn't terminal-complete yet —
  **not** the Postgres for an agent-operable sploot today.

Follow-ups for a real cutover (not this spike): storage port → R2/Tigris (044 child 2); isolate Clerk
(child 4); `output: 'standalone'` image; pooled `DATABASE_URL` + direct for migrations.
