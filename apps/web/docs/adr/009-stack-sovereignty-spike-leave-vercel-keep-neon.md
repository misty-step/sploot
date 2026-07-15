# ADR-009: Stack-sovereignty spike — leave Vercel, keep Neon (don't adopt Fly MPG)

Status: Accepted (2026-06-23)

Implementation update (2026-07-14): DigitalOcean App Platform is the selected
app host. Its singleton PRE_DEPLOY job owns production migration; GitHub and
the web build do not receive or apply the production database connection.

## Context

Epic 044 asked whether sploot should leave the managed-serverless stack for a
substrate an agent can **deploy, migrate, verify, and recover from a token on
disk** — the thing that kept biting us is that Vercel marks the prod
`DATABASE_URL` "Sensitive" (injected at runtime, withheld at build), so
migrations can't run on deploy and an agent can't reach prod without a human
placing secrets (036 had to work around this with a `migrate-prod` GitHub
Action). Fly was the lead candidate: one CLI + a token already on disk, plus
`release_command` for atomic migrate-on-deploy.

A throwaway spike stood the Next.js app up on Fly and tested two databases,
using **only** credentials already on disk (the Fly token + `neonctl` auth — no
Vercel/Clerk/Replicate secrets were present locally). Evidence:
`docs/qa/evidence/2026-06-23-fly-spike/`.

What the spike proved, all agent-only:

- **The app is host-agnostic.** It containerizes and `next build`s 43/43 static
  pages with zero real secrets; image 460 MB.
- **`release_command` is the real thing.** `fly deploy` ran
  `prisma migrate deploy` in a throwaway machine with the app's own
  `DATABASE_URL`, before traffic cutover — applying all 9 migrations atomically.
  This is exactly the loop Vercel structurally can't do.
- **pgvector search works on the substrate.** The app's exact cosine query
  (`image_embedding <=> …::vector`) ranks correctly on the deployed stack.
- **Verify + recover are token-only:** `fly logs` / `status` / `releases` /
  `machine restart`.

The decisive finding was a **divergence in how pgvector gets enabled**:

- **Fly Managed Postgres:** the app role (`fly-user` → `schema_admin`) is not a
  superuser, and `CREATE EXTENSION vector` fails (`42501, must be superuser`).
  Per Fly's docs, pgvector on MPG is enabled **only via the dashboard toggle** —
  PostGIS has a `--enable-postgis-support` CLI flag, vector has **no** CLI / API
  / MCP equivalent, and `fly mpg connect -u postgres` is refused. It is a
  one-time, **human-gated** step — a real (if bounded) break in token-only
  operability.
- **Neon:** `neondb_owner` (also not a superuser) runs `CREATE EXTENSION vector`
  straight from the terminal (Neon allow-lists it as a trusted extension). Neon
  also has a full REST API, `neonctl`, and an MCP server.

So the database was never what made sploot un-automatable — **Vercel was.**

## Decision

**Target an app-host migration off Vercel while keeping Neon** — do **not**
adopt Fly Managed Postgres.

- Move the Next.js app to a host with a real deploy CLI + `release_command`
  (Fly is proven here; Railway/Render are equivalent shapes). This restores
  atomic migrate-on-deploy from a token on disk.
- Keep **Neon** as the database: it is already sploot's DB, is fully agent-
  operable (API + CLI + MCP), enables pgvector from the terminal, and bills
  near-zero at idle. This means **no data migration and no new gate**.
- Reject **Fly MPG** for now: excellent app-layer agent-ops, but its extension
  model is not terminal-complete (pgvector requires a dashboard step), which
  defeats the entire point of the migration.

## Consequences

- The "migration" shrinks dramatically: it's an app-host move, not a re-platform.
  No vector DB change (pgvector rides along), no DB data move, no embeddings or
  auth change. Cost is comparable-to-cheaper (~$2–25/mo vs Vercel Pro $20 +
  Neon).
- Migrate-on-deploy becomes agent-runnable on the new host via `release_command`,
  retiring the `migrate-prod` GitHub Action workaround (036) for that path.
- **Rejected — Fly MPG:** would reintroduce a human-gated setup step (pgvector
  toggle) and cost more ($38/mo floor, no scale-to-zero) than Neon.
- **Rejected — self-hosted Postgres:** would make `CREATE EXTENSION` trivial
  (you're superuser) but owns backups/PITR/patching on an unattended personal
  library — the data-loss blast radius the epic explicitly forbids.
- The deployed source service intentionally uses a full dependency install and
  plain `next start`; standalone output is neither required nor supported by
  that contract. Storage portability and Clerk isolation remain separately
  tracked work.
- Spike resources (Fly app, Fly MPG cluster, Neon project) were destroyed after
  evidence capture; the throwaway `Dockerfile`/`fly.toml`/proof script are kept
  under `docs/qa/evidence/2026-06-23-fly-spike/` as the reproduction. They are
  historical evidence, not the live deployment path.
