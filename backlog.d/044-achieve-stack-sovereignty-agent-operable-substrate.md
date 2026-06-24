# Achieve stack sovereignty: a reversible, agent-operable substrate

Priority: P1 · Status: ready · Estimate: XL

## Goal

Every infrastructure choice is **reversible by config, not a rewrite.** sploot runs on
a consolidated, agent-operable, cost-safe substrate (ideally one CLI, one token, one
invoice) where each vendor sits behind a capability port — so swapping host / storage /
DB / auth / embeddings is a deploy-manifest + env change, decided by evidence
(cost/latency/ops), never by a re-platform. An agent can deploy, migrate, verify, and
recover end-to-end on **managed** Postgres+pgvector, zero-egress storage, and hosted
embeddings.

## Context

A 2026-06-22 research swarm (Cloudflare / Fly / DigitalOcean / embeddings / cost /
portability lanes) evaluated leaving the managed-serverless stack. Findings that
shape this epic:

- **Do NOT self-host Postgres via an agent.** Every lane said no: Fly's unmanaged
  PG is deprecated/unsupported; on a VPS the danger *moves, not disappears*
  (backups, PITR, patching, tested restores = a data-loss blast radius on an
  unattended personal library). Use **managed** Postgres wherever we land. The agent
  operates it declaratively; the provider owns the dangerous stateful recovery.
- **The real cost bomb is Vercel Image Optimization + CDN bandwidth**, not
  Blob/Replicate — fixable in place (ticket 046), independent of any migration.
- **R2's zero egress** is a win for an image library on every target.
- **pgvector + a hosted CLIP travel across all stacks** — keep them.

So the migration is really about **agent-operability, consolidation, and escaping
vendor danger** — and it should be **port-first and reversible, not a big-bang.**

## Lead candidate (historical — superseded by the spike below)

**Fly** was the lead (one CLI + token, `release_command`). The spike corrected this:
keep Neon, move only the app host. Kept for the research trail.

## Spike result (2026-06-23) — child 6 done

The Fly spike ran (token on disk only). Verdict: **leave Vercel, keep Neon — do
NOT adopt Fly Managed Postgres.** See ADR-009 + `docs/qa/evidence/2026-06-23-fly-spike/`.

- Proven agent-only: host-agnostic build, `release_command` atomic migrate-on-deploy
  (all 9 migrations), pgvector cosine search on the substrate, and the verify/recover
  loop (`fly logs`/`status`/`releases`/`machine restart`).
- **The DB was never the blocker — Vercel was** (Sensitive `DATABASE_URL`, no
  migrate-on-deploy). **Neon** is fully agent-operable (API + CLI + MCP) and enables
  pgvector from the terminal as the owner role.
- **Fly MPG is out:** its app role can't `CREATE EXTENSION vector` (needs superuser),
  and pgvector enable is **dashboard-only** (no CLI/API flag). A human-gated step that
  defeats the migration's point; also $38/mo, no scale-to-zero.
- New target: **app off Vercel (Fly/Railway/Render) + keep Neon** — no data move, no
  new gate, ~$2–25/mo.

## Portability doctrine (the reframe — 2026-06-24)

A 2026-06-24 full coupling-map (5 fresh-context lanes, file:line evidence on the PR)
reframed the epic: **the goal is not to find the "right" vendor — it's to make the
choice reversible.** Every change is framed "decouple from today's vendor behind a
port," never "migrate to tomorrow's." sploot is already ~70% there (container +
migrate-on-deploy proven; DB / cache / cron / observability / embeddings are thin or
already portable). The real lock-in is concentrated in **two data-model decisions and
identity acquisition** — fix those and the host/vendor question becomes a config line.

The seven levers (beyond containerization):

1. **Ports & adapters per capability** — Storage / Cache / Embeddings / Identity /
   Scheduler / Telemetry behind first-party interfaces; the SDK lives only in an
   adapter, selected by env.
2. **Target protocols, not products** — S3 API (not the Blob SDK), Postgres wire + OSS
   pgvector, Redis protocol, OIDC/JWT, OCI containers, HTTP-triggered cron, OTLP /
   plain-HTTP telemetry. Adapt to the lingua franca → the provider is fungible.
3. **Keep vendor identity out of the data model** — the DB is the most expensive thing
   to move, so it must be the most neutral. Two live violations: persisted absolute
   Vercel blob URLs + the host-pinned CHECK (`20250929_add_blob_url_validation`), and
   **Clerk's ID used as the `users` primary key** (`lib/db.ts` `syncUser`). Store
   opaque/relative refs; resolve vendor specifics at the edge.
4. **One typed env contract (12-factor)** — provider selection + creds via env,
   validated by one schema. (`.env.example` has drifted: `CANARY_*` undocumented; KV
   named `UPSTASH_*` while code reads `KV_REST_API_*`.)
5. **Declarative deploy per target** — Dockerfile + a ~20-line manifest each
   (`fly.toml` / `railway.json` / `render.yaml` / `compose.yaml`) + `release_command`.
6. **A portability CI gate (the ratchet)** — build the container, run app + tests
   against generic backends (plain Postgres + MinIO + Redis) with no Vercel env; green
   = proof of no hidden lock-in, and it fails if a vendor SDK is reintroduced outside
   an adapter.
7. **Quarantine proprietary runtime features** — edge middleware, ISR-on-Vercel,
   Vercel Image Optimization, `waitUntil`. sploot is clean except image optimization on
   detail/share pages (fixable with the grid's `unoptimized`+thumbnail pattern).

The distributed portability work already lives across the backlog — **035** (auth
seam), **041** (verify/read/recover), **042** (delete dead infra), **047** (vector-dim
drift), **049** (asset→DTO mapper). This epic is the umbrella that sequences them.

## Oracle

- [x] Cost blast-radius capped in place first (046) — no uncapped image/CDN bill.
- [x] A spike stands the app up on ONE target with managed Postgres+pgvector, proving
      agent deploy + migrate from a token on disk + working search + measured cost,
      recorded in an ADR (ADR-009). Go/no-go made. No self-hosted Postgres.
- [ ] Each vendor boundary sits behind a port so the host swap is config, not a
      rewrite: storage (S3/R2-capable), embeddings (provider seam), auth (Clerk
      isolated), platform services (KV / cron / analytics).
- [ ] The data model carries **no vendor identity** — no absolute-vendor-URL CHECK;
      `users` keyed by an internal id, not the Clerk ID.
- [ ] A **portability CI gate** proves the container runs against generic Postgres +
      S3 (MinIO) + Redis with no Vercel env, and fails if a vendor SDK leaks outside an
      adapter.

## Children (port-first; reversibility is the through-line)

1. **Cap the cost blast-radius in place** — ticket 046. ✅ shipped.
2. **Storage-agnostic blob refs + S3/R2 cutover (Tier 1, do first).** Persist
   `pathname` as the source of truth; derive the public URL through one centralized
   helper behind a `StorageProvider` (S3 API) interface; drop the host-pinned CHECK
   (`20250929_add_blob_url_validation/migration.sql:8,16`); widen `next.config`
   remotePatterns + the Workbox cache regex; repoint the purge-cron + GC `del`/`list`.
   The #1 decoupling **and** it independently kills the egress cost via R2 zero-egress,
   so it pays for itself regardless of vendor. (Centralize URL derivation with 049.)
   Size: M.
3. **Embeddings provider seam.** Export an `EmbeddingService` *interface* (consumers
   currently type against the concrete `ReplicateEmbeddingService`); widen the factory;
   un-leak `CLIP_MODEL`/`768` from cache keys. Then a provider behind env is a drop-in.
   (Pairs with 047, the dim-drift fix.) Size: S–M.
4. **Isolate Clerk / finish the auth policy boundary** — extends **035**. Migrate the
   leaky `lib/auth/server.ts` path (~13 RSC callers) + 4 inline `auth()` routes onto
   the `AuthenticatedPrincipal` seam; stop using the Clerk ID as the `users` PK (the
   `user_identities` table is already provider-neutral). Identity acquisition (login
   UI, extension SSO) stays Clerk but isolated. Size: L.
5. **Port Vercel platform services** — KV (rate-limit, slug cache → Redis-protocol
   adapter via the existing `ICacheBackend`), cron (4 bearer-authed GET routes →
   document the any-scheduler pattern), analytics (consolidate the `lib/analytics.ts`
   facade). Size: M.
6. **Spike the lead target and decide.** ✅ DONE (2026-06-23) — ADR-009. App off
   Vercel + keep Neon; not Fly MPG.
7. **Portability tidy (Tier 0, do anytime).** Delete the dead `@vercel/functions` dep
   (declared, never imported — coordinate with **042**); fix `.env.example` drift
   (`CANARY_*`, KV var names); standardize cron auth on `timingSafeEqual` (only
   `purge-search-logs` does today); drop the unused 2nd vector column. Size: S.
8. **Portability CI gate (the ratchet).** CI builds the container and runs app + tests
   against generic Postgres + MinIO (S3) + Redis with NO Vercel env — proving no hidden
   lock-in, failing if a vendor SDK leaks outside an adapter. Relates to **041**.
   Size: M.
9. **Extract `lib/platform/` + portability doctrine.** Pull the capability interfaces +
   adapters into one place no business logic bypasses; write the one-page doctrine
   ("no vendor SDK outside `lib/platform/adapters/`; never persist a vendor URL/ID;
   prefer the protocol"). The reusable substrate other projects start from. Size: L.
10. **Add `output: 'standalone'` + keep the spike Dockerfile/manifest** as the
    committed deploy recipe for the chosen host. Size: S.

## Verification System

- **Claim:** any single vendor (host / storage / DB / auth / embeddings) can be swapped
  by changing a deploy manifest + env, with no business-logic rewrite.
- **Falsifier:** a swap touches business logic; a vendor SDK is imported outside an
  adapter; the data model embeds a vendor URL/ID; the portability CI gate can't run the
  app on generic backends.
- **Driver:** the portability CI gate (container on generic PG + MinIO + Redis, no
  Vercel env) + the per-capability adapter tests.
- **Grader:** green gate with zero Vercel env; a vendor-SDK-import lint that fails
  outside `lib/platform/adapters/`.
- **Evidence packet:** `docs/qa/evidence` — the spike packet (done) + the gate run.
- **Cadence:** as each port lands (children 2–5), then the gate (child 8) makes it
  standing.

## Notes

- **Related portability tickets (this epic sequences them):** 035 (auth-door
  unification = child 4), 041 (verify/read/recover = the agent-ops half), 042 (delete
  dead infra, incl. `@vercel/functions`), 047 (vector-dim drift = pairs with child 3),
  049 (asset→DTO mapper = where blob-URL derivation should centralize for child 2).
- Keep **pgvector** through any move — standard `<=>`/HNSW, zero Neon-proprietary SQL;
  it rides every Postgres with no code change. Don't move to a vector DB (lock-in).
- **Reusable beyond sploot:** the `lib/platform/` + doctrine + portability-CI pattern
  is meant to be lifted into a shared starter so new projects are portable by default.
  A harness-kit backlog item asks our shared agent doctrine/skills to encourage this
  design (ports-and-adapters, protocol-not-product, reversible-by-config).
- **Supersedes 036's child-3** (platform-fit ADR → now ADR-009). Builds on 036
  (migrate-on-deploy) and 046 (cost cap, shipped).
- Research lanes (2026-06-22): cloudflare-substrate · fly-substrate · do-vps ·
  embeddings · cost-danger · portability. Coupling-map lanes (2026-06-24): storage ·
  data+platform · auth · runtime/build/observability · embeddings/deps.
