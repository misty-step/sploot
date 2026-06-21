# Make Schema-To-Prod Fully Agent-Deployable

Priority: P2 · Status: ready · Estimate: L

## Goal

An agent can take a schema or infra change from merged PR to verified-in-prod
with zero human credential step — migrations ride the deploy, and every
boundary's secret is reachable by a token already on disk.

## Context

Delivering 033 exposed the seam: the agent can build, test, review, and merge a
migration, but cannot apply it to prod. Vercel runs `next build`, not
`prisma migrate deploy`; the prod `DATABASE_URL` is a Vercel **Sensitive** var
(withheld from build and from `vercel env pull`); and the prod Neon project
(`lively-lake-63852609`) lives on a Neon account this machine's `neonctl` / `op`
are not logged into. Net: a merged schema change strands at the prod boundary
and needs a human holding the sequestered credential.

The friction is not a missing capability — it is that the deploy loop is
"dashboard + sequestered secret" where it needs to be "token-on-disk + one
command." This epic closes that gap for the current stack first (cheap, high
leverage), then decides whether a runtime move makes the whole loop
structurally agent-native.

## Oracle

- [ ] A migration merged to `master` is applied to prod with **no human running
      a DDL command and no agent ever handling the prod connection string**
      (CI/release-time `prisma migrate deploy`, secret held by the runner).
- [ ] `prisma migrate status` against prod reports no pending migrations after a
      deploy completes.
- [ ] The live QA loop (mint → `POST` 201 → 409 dedupe → revoke → 401) is
      runnable by the agent against a non-prod environment without a human
      handing over a secret (agent-readable secret store or seeded preview).
- [ ] An ADR records the platform decision: "stay on Vercel+Neon and glue the
      seam" vs "consolidate the runtime onto a token-on-disk platform" (Fly,
      already authed here; or Supabase), with criteria and, if a move is chosen,
      a sequenced migration path.

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

1. **Migrate-on-deploy (the immediate fix; do first).** Add a release/CI step
   that runs `prisma migrate deploy` against prod on merge to `master`, with the
   prod `DATABASE_URL` held as a GitHub Actions secret (or Vercel deploy hook)
   the agent never reads. One-time human secret placement; permanent agent
   autonomy after. Directly unblocks 033's pending prod migration.
2. **Agent-readable secret store.** Put the boundary secrets (DB, Blob, Clerk,
   Canary) behind a token-on-disk store (1Password **service-account** token, or
   Doppler) so the agent can run the live QA loop and reach every boundary
   without an interactive login. Document the bootstrap in AGENTS/CLAUDE.
3. **Platform-fit spike + ADR.** Evaluate three futures against the criteria
   below: (a) **stay + glue** — Vercel+Neon+Clerk with children 1–2; (b) **move
   to Fly** — `FLY_API_TOKEN` is already on this disk, migrations ride
   `release_command`, pgvector supported, aligns with the Canary-on-Fly
   footprint and the Rust-by-default doctrine; (c) **consolidate on Supabase** —
   DB + pgvector + auth + storage behind one CLI/key, but replaces Clerk and
   Vercel Blob. Output an ADR with a recommendation and, if a move is chosen, a
   sequenced migration epic.

## Notes

- **Decision criteria (child 3):** fewest sequestered secrets · migrations
  included in the deploy · one account/CLI not five partial auths · pgvector and
  the embedding pipeline preserved · preview/staging the agent can spin and test
  against.
- **Evidence (2026-06-20 delivery session):** `vercel env pull --environment
  production` returns `DATABASE_URL` empty (Sensitive); `neonctl` authed as
  `phraznikov@gmail.com` / org `phaedrus` (projects `memory-engine-prod`,
  `moneta-prod`) has no access to `lively-lake-63852609` (direct fetch → "could
  not be authorized"); `op` installed but signed out. The prod-Neon credential
  is on a `mistystep`-associated account unreachable from this machine.
- **Do child 1 first regardless of the child-3 decision** — auto-migrate pays
  off even if a runtime move happens later.
- Related: memory `sploot-vercel-migrations` records the no-auto-migrate +
  build-withheld facts this epic closes. Distinct from 035 (unify auth doors),
  which is code architecture, not infra.
