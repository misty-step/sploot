# ADR-006: Personal Upload Tokens (upload-only, scope-by-policy)

**Status:** Accepted
**Date:** 2026-06-18
**Deciders:** Sploot maintainer
**Technical Story:** Backlog 033 — get Sploot into the iPhone share sheet. iOS
(WebKit) has no Web Share Target API, so the Android `share_target` can't reach
it. Apple Shortcuts are the sanctioned escape hatch, but they cannot carry a
Clerk session — they need a credential.

## Context

We need a credential a non-session client (an Apple Shortcut, later a CLI) can
present to the upload API. Requirements from the ticket: mintable/revocable from
settings, stored hashed, and **upload-only** (it must not be able to read or
delete the library). Sploot had no token/API-key concept; auth initially ran
through two paths — `authenticateRequest` (policy-based,
`lib/auth/request-auth.ts`) and `getAuth*` (`lib/auth/server.ts`). Protected
product routes now share the policy-based boundary; `getAuth*` remains
page-only and token-blind.

## Decision

**1. Opaque hashed PAT, not a stateless signed token.** A token is
`splt_` + 32 random bytes (base64url). Only `sha256(token)` is stored in a new
`upload_tokens` table; the plaintext is shown once at mint. A fast hash is
correct: at 256 bits of entropy there is no low-entropy secret to stretch and
online guessing is infeasible (the GitHub-PAT rationale), so no bcrypt/argon and
no constant-time compare — the lookup is an indexed equality on the hash. This
is required over a stateless HMAC token (qa-local style) because the ticket
demands *revocable* and *stored hashed*; a stateless token is neither.

**2. Scope is enforced by policy, not a scope field.** `AuthPolicy` gains
`allowUploadToken` (default `false`). `authenticateRequest` checks an upload
token only when a route opts in. Three route handlers opt in (`POST
/api/upload`, `POST /api/upload/url`, and `POST /api/search`); every other
policy-based route denies by default, and the `getAuth*` path never calls the
verifier at all. Deny-by-default plus a single-function verifier *is* the
upload-only guarantee. We rejected a generic
`scopes` column / API-key platform as speculative — there is one scope today.

**3. Verification is throw-safe and revoked ≡ unknown.** A DB error (including a
not-yet-migrated table) resolves to `401`, never `500`; revoked and unknown
tokens are indistinguishable (matched by `revokedAt IS NULL`, so a revoked row
is simply "not found"). The stable `{ "error": "Unauthorized" }` / `401`
contract is preserved.

**4. Management endpoints are session-only.** `/api/upload-tokens` (mint/list)
and `/api/upload-tokens/{id}` (revoke) use the default policy, so an upload
token cannot manage tokens.

## Consequences

- **Positive:** the iPhone share-sheet path ships; the token also unlocks
  CLI/automation ingestion. No new ingestion pipeline — `ingestImage()` is
  reused, so dedupe/quota/embeddings are unchanged. The blast radius of the new
  credential is one grep (`allowUploadToken`) plus one verifier function.
- **Invariant to protect:** product routes cannot import
  `lib/auth/server.ts` or `lib/auth/verify-bearer.ts`; `auth:guard` enforces
  that inventory. The existing token-blind check on `server.ts` remains defense
  in depth.
- **Operational:** the `upload_tokens` migration must be applied
  (`prisma migrate deploy`) before the mint route works in an environment; on
  Vercel, migrations do not auto-run. Verification is throw-safe, so a token
  before the table exists returns `401`, not `500` — but the settings card
  should not be exposed until the migration lands.
- **Accepted residual:** no per-request rate limiter; storage quota is the
  volume bound on a leaked token and revoke is the kill switch.
- **Negative:** Sploot now owns a credential lifecycle (mint, hash, revoke,
  leak response) it did not before.
