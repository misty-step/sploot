# ADR 0002: Move Extension into Monorepo

- Status: Accepted
- Date: 2026-01-15

## Context

- The Chrome extension and web app now share upload limits, API types, and
  auth assumptions.
- Keeping two repos caused drift (constants, env names, build docs) and made
  coordinated changes expensive.
- CI and deploy workflows already run from this repo, so cross-repo coupling
  added overhead without clear benefit.

## Decision

Move the extension into this monorepo under `apps/extension` and share code
via `packages/common`.

## Consequences

**Positive**
- Single source of truth for upload limits and types.
- One set of docs and ADRs for cross-app changes.
- Faster local dev: one install, shared lint/type-check.

**Negative**
- Vercel installs now include extension `postinstall` (mitigated by ADR 0001).
- Monorepo adds a small amount of tooling overhead.

## Alternatives Considered

1. **Keep separate repos**
   - Rejected due to constant drift and duplicated setup.
2. **Split shared code into a separate package repo**
   - Rejected due to extra publishing/versioning burden.
