# Achieve stack sovereignty: an agent-operable substrate, no self-hosted Postgres

Priority: P1 · Status: ready · Estimate: XL

## Goal

sploot runs on a consolidated, agent-operable, cost-safe substrate — ideally one
CLI, one token, one invoice — with **managed** Postgres+pgvector, zero-egress
object storage, and hosted embeddings; an agent can deploy, migrate, verify, and
recover end-to-end.

## Context

A 2026-06-22 research swarm (Cloudflare / Fly / DigitalOcean / embeddings / cost /
portability lanes) evaluated leaving the managed-serverless stack. Findings that
shape this epic:

- **Do NOT self-host Postgres via an agent.** Every lane said no: Fly's unmanaged
  PG is deprecated/unsupported; on a VPS the danger *moves, not disappears*
  (backups, PITR, patching, tested restores = a data-loss blast radius on an
  unattended personal library). Use **managed** Postgres wherever we land — Fly
  MPG, DO Managed PG, and Neon all support pgvector. The agent operates it
  declaratively; the provider owns the dangerous stateful recovery.
- **The real cost bomb is Vercel Image Optimization + CDN bandwidth**, not
  Blob/Replicate — solo ~$30–40/mo, ~$500–1,100 at 1k users, uncapped on a viral
  share. **Fixable in place** (ticket 046), independent of any migration.
- **R2's zero egress** is a win for an image library on every target.
- **pgvector + a hosted CLIP travel across all stacks** — keep them. Jina CLIP v2
  is ~7× cheaper than Replicate (047 / child 3).
- **Clerk in the React UI + the extension is the migration long pole**; the
  server-side principal seam (`request-auth.ts` + upload tokens) is nearly
  portable already.

So the cost problem is mostly an in-place fix; the migration is really about
**agent-operability, consolidation, and escaping vendor danger** — and it should
be **port-first, then a measured spike, not a big-bang**.

## Lead candidate

**Fly** — one `fly` CLI + token already on disk, `release_command` = atomic
migrate-on-deploy, Fly Managed Postgres keeps the Prisma+pgvector model intact,
Tigris/R2 blob; ~$45–55/mo. **Cloudflare** is cheapest + best egress but the
biggest rewrite (no image-embedding model → CLIP stays off-platform; Clerk×
OpenNext friction). **DigitalOcean** is the lowest-lock-in middle (~$39/mo,
droplet + managed PG + R2). The spike decides; don't pre-commit.

## Oracle

- [ ] Cost blast-radius capped in place first (046) — no uncapped image/CDN bill.
- [ ] Each vendor boundary sits behind a port so the host swap is config, not a
      rewrite: storage (R2-capable), embeddings (provider seam), auth (Clerk
      isolated), Vercel platform services (KV / cron / analytics).
- [ ] A spike stands the app up on ONE target (lead: Fly) with managed
      Postgres+pgvector, R2 blob, and hosted embeddings, proving: an agent
      deploys + migrates from a token on disk; semantic search works; measured
      monthly cost. Recorded in an ADR.
- [ ] A go/no-go decision is made from the spike's evidence. No self-hosted
      Postgres in any chosen path.

## Children (ordered: port-first, then spike)

1. **Cap the cost blast-radius in place** — ticket 046 (do now, independent).
2. **Storage-agnostic blob refs + R2 cutover.** Drop the Vercel-URL CHECK
   constraint (`20250929_add_blob_url_validation/migration.sql:8` pins
   `*.blob.vercel-storage.com`), centralize the base URL, widen `next.config`
   remotePatterns + the Workbox cache regex; move blob read/write to R2 (S3 API)
   behind the existing `BlobUploaderService` port. The #1 migration unlock and it
   independently kills the egress cost. Size: M.
3. **Embeddings provider seam + pilot Jina CLIP v2.** Keep the `EmbeddingService`
   interface (already clean — Replicate is in one file); add a provider behind
   env; side-by-side meme-retrieval + cost eval before any cutover. ~7× cheaper,
   no cold-start, stack-agnostic. (Pairs with 047, the dim-drift fix.) Size: M.
4. **Isolate Clerk / finish the auth policy boundary** — the long pole; extends
   035. Collapse `@clerk/*` (~10 files, all layers + the extension) to one server
   + one client + one extension adapter so a future identity swap is bounded.
   Size: L.
5. **Port Vercel platform services** — KV (rate-limit, slug cache), cron (4 jobs),
   analytics — behind portable adapters; drop the unused `@vercel/functions` dep.
   Size: M.
6. **Spike the lead target (Fly) and decide.** Stand up web + Fly MPG (pgvector) +
   R2 + hosted embeddings in a branch; prove agent deploy/migrate/verify + search
   + cost; write the ADR; go/no-go. Size: L.

## Verification System

- **Claim:** sploot can run end-to-end on an agent-operable substrate an agent
  deploys, migrates, and recovers without sequestered credentials.
- **Falsifier:** the spike needs a human to run a DDL/secret step; search
  regresses; cost is worse without an agent-ops payoff; any path requires
  self-hosted Postgres.
- **Driver:** the Fly spike branch — `fly deploy` applies migrations via
  `release_command`; a seeded semantic-search QA walk; a measured cost readout.
- **Grader:** agent-only deploy+migrate; search parity; an ADR with the
  cost/ops/lock-in comparison.
- **Evidence packet:** `docs/qa/evidence` — spike deploy log, search transcript,
  cost table, ADR.
- **Cadence:** after the ports land (children 2–5), and again after the spike.

## Notes

- **Supersedes 036's child-3** (platform-fit ADR) — that paper decision becomes
  this measured spike. Relates to 041 (verify/read/recover) and builds on 036
  (migrate-on-deploy already shipped — its `release_command`-style pattern is the
  agent-ops thesis proven in miniature).
- Keep **Clerk and pgvector** through the migration; only host / storage /
  embeddings-host change. Don't move to a vector DB (lock-in); pgvector rides
  every target with zero code change.
- Research lanes (2026-06-22): cloudflare-substrate · fly-substrate · do-vps ·
  embeddings · cost-danger · portability. Cross-cutting verdict: leaving is about
  agent-ops + consolidation, not cost (cost is an in-place fix).
