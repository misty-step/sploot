# Make sploot agent-operable end to end: verify, read, recover

Priority: P2 · Status: ready · Estimate: M

## Goal

Beyond deploying (036), an agent can verify a deploy succeeded, read prod
errors/SLOs, and recover from a bad deploy — all from on-disk tokens and CLIs.

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
- [ ] Rollback runbooks exist for a bad deploy and a failed migration, using the
      already-authed `vercel rollback`.
- [ ] Ops docs reconciled and de-staled: one observability doc (not two), and
      `docs/DEPLOYMENT.md` no longer references the banned `POSTGRES_URL`,
      `vercel postgres *` (Neon is the DB), or Replicate-as-required.

## Notes

Evidence lane: groom 2026-06-21 "agent-operability + ops". Distinct from 036
(deploy/migrate/secret-reach) — this is verify/read/recover. Canary is currently
write-only for the agent (`lib/canary-reporter.ts` POSTs ingest only). Stale docs
actively misdirect: `docs/DEPLOYMENT.md`'s rollback section uses non-existent
`vercel postgres restore`. `scripts/db-drift-check.sh` also uses the banned
`POSTGRES_URL` alias — fold into the post-migrate CI gate and delete the standalone
script.
