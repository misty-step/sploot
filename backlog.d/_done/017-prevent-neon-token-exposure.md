# Prevent Neon Token Exposure

Status: done

## Problem

Neon sent a security alert on 2026-06-03 for a database credential exposed in
tracked investigation prose at `apps/web/INVESTIGATION.md`. The local controls
were too shallow: gitleaks only scanned staged files, CI had no secret gate, and
the app env validator explicitly excluded the incident artifact.

## What Was Built

- Deleted the tracked investigation artifact that contained the exposed
  credential.
- Added `scripts/check-secrets.mjs` as the repo-root secret boundary for
  real-looking Neon/Postgres URLs and high-risk service token assignments.
- Added `scripts/check-secrets.test.mjs` fixtures proving the scanner allows
  placeholders, blocks real-looking Neon Postgres URLs, and redacts findings.
- Added root `.gitleaks.toml` with Sploot-specific Neon, Vercel Blob, and
  Replicate rules plus placeholder allowlists.
- Wired `pnpm secrets:check`, `pnpm secrets:test`, and `pnpm secrets:gitleaks`
  into local hooks and CI.
- Added CI event-range scanning so a credential added and removed within a PR
  still fails the `secrets` job and therefore `merge-gate`.
- Removed the stale `INVESTIGATION.md` exclusion from the web env validator.

## Verification

- `pnpm secrets:check`
- `pnpm secrets:test`
- `pnpm secrets:gitleaks`
- `pnpm secrets:check -- --git-range HEAD~1..HEAD`
- `bash scripts/validate-env-vars.sh` from `apps/web`

## Residual Risk

- The exposed Neon password still must be rotated in Neon and the replacement
  connection strings updated in deployment environments.
- The public Git history still contains the old blob. Do not rewrite history
  silently; rotate credentials and rely on the new gates for recurrence
  prevention.
- Dagger is still absent. Treat Dagger migration as a separate CI-hardening
  follow-up rather than an incident-day patch.

Ships-backlog: backlog.d/_done/017-prevent-neon-token-exposure.md
