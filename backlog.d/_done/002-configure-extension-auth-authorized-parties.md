---
id: 002-configure-extension-auth-authorized-parties
title: Configure Extension Auth Authorized Parties
status: done
lifecycle_stage: Feedback
owner: local
acceptance:
  - Hardcoded Chrome extension authorized party is replaced with environment-backed configuration.
  - At least one non-primary extension origin is covered by tests or documented local verification.
  - Invalid origins still receive 401.
  - CI parity gate passes or narrower verification is justified.
evidence_required:
  - bearer auth tests
  - extension build evidence
  - real Chrome workflow notes
  - verification command output
refs:
  - apps/web/lib/auth/verify-bearer.ts
  - apps/extension/shared/env.ts
  - apps/extension/shared/api-client.ts
---

# Configure Extension Auth Authorized Parties

Priority: high
Status: done
Estimate: M

## Goal

Valid extension session tokens authenticate across development, staging, and
production extension IDs without code changes.

## Non-Goals

- Replacing Clerk
- Weakening authorized-party checks
- Accepting arbitrary extension origins

## Oracle

- [x] The hardcoded Chrome extension authorized party is replaced with an
      environment-backed allowlist or equivalent runtime configuration.
- [x] At least one non-primary extension origin is covered by tests or documented
      local verification.
- [x] Invalid origins still receive `401`.
- [x] `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`
      passes, or any narrower verified command is justified in the delivery note.

## Scope

- `apps/web/lib/auth/verify-bearer.ts`
- `apps/extension/shared/env.ts`
- `apps/extension/shared/api-client.ts`
- Extension auth/config docs if the operator contract changes

## Why Now

`/api/upload` supports Bearer tokens for the Chrome extension, but
`verifyBearerOrThrow` currently hardcodes one extension ID. That is brittle for
unpacked development, staging builds, and production extension ID changes.

## Delivery Notes

- Replaced the web bearer authorized-party constant with default origins plus
  `CLERK_AUTHORIZED_PARTIES`.
- Added focused tests for default parties, env-provided extension origins, and
  invalid token rejection.
- Wired extension `VITE_CLERK_SYNC_HOST` into popup and background Clerk clients.
- Added `build:prod:unpacked` with `INCLUDE_CRX_KEY=true` so production-like QA
  can keep the stable unpacked extension ID.
- Verified real Chrome workflow on 2026-05-15:
  extension popup signed in via production Clerk sync host
  `https://clerk.sploot.app`; right-click Rawganique image -> **Save to Sploot**;
  web library count changed `3,019 -> 3,020`, top asset
  `1778864505009-4jqsm82.jpg`, last upload `2026-05-15T17:01:45Z`.
- Verified focused commands:
  `pnpm --filter extension test`,
  `pnpm --filter extension type-check`,
  `pnpm --filter extension build`,
  `pnpm --filter extension build:prod:unpacked`,
  `pnpm --filter web exec vitest run __tests__/lib/auth/verify-bearer.test.ts`,
  `pnpm --filter web type-check`.
- Verified the full gate with a local `pgvector/pgvector:pg15` service:
  `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable CI=1 pnpm lint && DATABASE_URL=... CI=1 pnpm type-check && DATABASE_URL=... CI=1 pnpm --filter web test && DATABASE_URL=... CI=1 pnpm --filter extension build`.

## What Was Built

Bearer auth now passes Clerk an authorized-party set made from Sploot defaults
plus `CLERK_AUTHORIZED_PARTIES`, and extension builds now carry the Clerk sync
host through popup, background auth, manifest host permissions, and production
unpacked QA scripts. The local QA skill documents the repeatable Chrome
extension workflow that proved a real right-click meme save reached the web app.
