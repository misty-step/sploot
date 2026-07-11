# make sploot agent-operable end to end: verify, read, recover

Priority: P2 · Status: ready · Estimate: M

## Goal

Beyond deploying (036), an agent can verify a DigitalOcean deploy succeeded,
read production errors/SLOs, and recover from a bad deploy — all through
repo-owned commands backed by on-disk credentials.

## Context

036 owns *applying* migrations and *reaching* secrets. A groom sweep (2026-06-21)
found the verify / read / recover side is missing or doc-only.

## Oracle

- [ ] CI verifies migrations post-apply: a step after `migrate-prod` runs
      `prisma migrate status` (clean = pass), failing the run on drift — closes
      036's own status-verification oracle, which `migrate-prod` does not check.
- [ ] An agent can query prod errors/SLOs with one command: a `canary:query` script
      wrapping `GET /api/v1/query`, with the read key provisioned into the secret
      store (it currently exists only in `OBSERVABILITY.md`, no key anywhere on
      disk or in code).
- [ ] Recovery is agent-operable from the repository: one command lists recent
      DigitalOcean App Platform deployments and runtime logs; one guarded
      rollback command validates the target, restores the last known-good
      source deployment, and reads back deployment state before running
      `DEPLOYMENT_URL=https://www.sploot.app pnpm --filter web validate:deployment`.
- [ ] Failed-migration recovery is explicit and forward-safe for Neon: inspect
      `prisma migrate status`, apply a corrective additive migration, rerun the
      status check, and verify the public health contract. Destructive database
      restore remains operator-approved rather than an automatic agent action.
- [ ] Ops docs reconciled and de-staled: one observability doc (not two), and
      `docs/DEPLOYMENT.md` names DigitalOcean App Platform, Neon, the exact
      health/readback commands, and the one intentional Vercel Blob exception.

## Notes

Evidence lane: groom 2026-06-21 "agent-operability + ops". Distinct from 036
(deploy/migrate/secret-reach) — this is verify/read/recover. Canary is currently
write-only for the agent (`lib/canary-reporter.ts` POSTs ingest only).

The deployment doc now identifies DigitalOcean as compute and Neon as the
database, but its rollback paragraph is not yet an executable agent workflow:
it does not discover deployment IDs, validate a recovery target, read runtime
logs, or prove the recovered deployment. Fold those operations into a
repo-owned command with a dry-run/approval boundary rather than depending on a
provider dashboard.
