# Configure Extension Auth Authorized Parties

Priority: high
Status: ready
Estimate: M

## Goal

Valid extension session tokens authenticate across development, staging, and
production extension IDs without code changes.

## Non-Goals

- Replacing Clerk
- Weakening authorized-party checks
- Accepting arbitrary extension origins

## Oracle

- [ ] The hardcoded Chrome extension authorized party is replaced with an
      environment-backed allowlist or equivalent runtime configuration.
- [ ] At least one non-primary extension origin is covered by tests or documented
      local verification.
- [ ] Invalid origins still receive `401`.
- [ ] `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`
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
