# Make Schema-To-Prod Fully Agent-Deployable

Priority: P2 · Status: in-progress · Estimate: L

## Goal

An agent can take a schema or infra change from merged PR to verified-in-prod
with zero human credential step — migrations ride the deploy, and every
boundary's secret is reachable by a token already on disk.

## Context

Delivering 033 exposed a schema-to-production seam on the retired compute
host. The DigitalOcean cutover removed that host boundary: the production
build runs `prisma migrate deploy`, while the independent `migrate-prod` CI job
remains a second explicit path with the connection string held by the runner.
The remaining work is proof and operability: migration status readback, live QA
credentials reachable from the agent secret store, and repository-owned
recovery commands (tracked by 041).

The friction is not a missing capability — it is that the deploy loop is
"dashboard + sequestered secret" where it needs to be "token-on-disk + one
command." The runtime decision is now DigitalOcean App Platform + Neon; this
card closes the remaining verification and credential gaps on that stack.

## Oracle

- [ ] A migration merged to `master` is applied to prod with **no human running
      a DDL command and no agent ever handling the prod connection string**
      (CI/release-time `prisma migrate deploy`, secret held by the runner).
- [ ] `prisma migrate status` against prod reports no pending migrations after a
      deploy completes.
- [ ] The live QA loop (mint → `POST` 201 → 409 dedupe → revoke → 401) is
      runnable by the agent against a non-prod environment without a human
      handing over a secret (agent-readable secret store or seeded preview).
- [x] ADR-009 records the measured platform decision, and ADR-010 records the
      DigitalOcean runtime-control cutover while retaining Neon.

## Verification System

- **Claim:** an agent can ship a schema change to prod end-to-end with no human
  credential step.
- **Falsifier:** a merged migration leaves prod's schema stale, OR applying it
  requires a human to run a command or paste a secret.
- **Driver:** merge a trivial additive migration (e.g. an inert comment column
  on a throwaway table), observe it land in prod via the automated path, then
  revert it the same way.
- **Grader:** `prisma migrate status` clean against prod post-deploy; the run
  log shows the migration applied by the runner, not a human.
- **Evidence packet:** the CI/release run log + `migrate status` output under
  `docs/qa/evidence/`.
- **Cadence:** after child 1 lands (the migrate-on-deploy path), and again if a
  platform move ships.

## Children

1. **Migrate-on-deploy (the immediate fix; do first).** ✅ **Delivered.** The
   `migrate-prod` job runs `prisma migrate deploy` after the merge gate with the
   production URL held as a repository secret, and the DigitalOcean production
   build invokes the same repo-owned migration runner before `next build`.
2. **Agent-readable secret store.** Put the boundary secrets (DB, Blob, Clerk,
   Canary) behind a token-on-disk store (1Password **service-account** token, or
   Doppler) so the agent can run the live QA loop and reach every boundary
   without an interactive login. Document the bootstrap in AGENTS/CLAUDE.
3. **Platform-fit spike + ADR.** ✅ **Superseded and resolved by epic 044.** The
   measured spike selected DigitalOcean App Platform for compute while keeping
   Neon, Clerk, pgvector, and the existing embedding provider. ADR-009 records
   the decision and ADR-010 records the final runtime-control shape.

## Notes

- **Decision criteria (child 3):** fewest sequestered secrets · migrations
  included in the deploy · one account/CLI not five partial auths · pgvector and
  the embedding pipeline preserved · preview/staging the agent can spin and test
  against.
- **Historical evidence:** the retired host withheld the production connection
  string from builds and local agent tooling. ADR-009 retains the dated spike
  evidence; this active card now describes only the current DigitalOcean path.
- **Do child 1 first regardless of the child-3 decision** — auto-migrate pays
  off even if a runtime move happens later.
- Related: ADR-009 records the retired host's no-auto-migrate and
  build-withheld facts. Distinct from 035 (unify auth doors),
  which is code architecture, not infra.
