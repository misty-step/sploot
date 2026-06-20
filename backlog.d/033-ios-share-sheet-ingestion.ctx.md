# Context Packet: iPhone Share-Sheet Ingestion via Personal Upload Tokens

## PRD Summary

- User: an iPhone owner with images scattered across Photos, Reddit, Safari,
  etc., who wants them in Sploot without switching to a desktop.
- Problem: WebKit does not implement the Web Share Target API, so the Android
  `share_target` (PR #216, epic 026) can never surface Sploot in the iOS share
  sheet. The only sanctioned escape hatch is an Apple Shortcut — but Shortcuts
  cannot carry a Clerk session, so there is no credential they can present to
  the upload API.
- Why now: 026's iOS path is currently "copy → paste into the upload zone,"
  which fails for the common case (an app offers *Share* but not *Copy*, or the
  user is many taps from the Sploot tab). The missing primitive is a
  non-session credential.
- UX enabled: tap *Share → Save to Sploot* on any image; it lands in the
  library (deduped) in one or two taps. The same credential unlocks future
  CLI/automation ingestion.
- Deliverable type: code (new auth credential + DB model + management UI +
  API) plus a user-facing Shortcut recipe doc plus an evidence packet.
- Success signal: with a minted token, `curl -F file=@meme.png -H
  "Authorization: Bearer splt_…" https://sploot.app/api/upload` returns `201`,
  a repeat returns `409` (dedupe), revoking the token makes the same call
  return the stable `401 {"error":"Unauthorized"}`, and that token cannot read
  or delete anything.

## Goal

Give Sploot a hashed, revocable, **upload-only** personal token that an Apple
Shortcut (or any HTTP client) can present to the existing upload pipeline, so
an iPhone user can save images from the native share sheet.

## Non-Goals

- No native iOS app, App Clip, or App Store submission.
- No generic scoped-token / OAuth-app / API-key platform. Exactly one scope
  exists today (upload); do not build a scopes column or permission system.
- No change to how the web app or Chrome extension authenticate (both keep
  Clerk session/bearer). This adds a credential; it replaces nothing.
- No new ingestion *pipeline*. Reuse `ingestImage()` unchanged — dedupe, quota,
  embedding, blob upload, and response contracts come for free.
- Do not ship a signed binary `.shortcut` file from this lane (see Design →
  Shortcut artifact). The step-by-step recipe satisfies the oracle.
- Do not loosen or fork the `401 {"error":"Unauthorized"}` contract.

## Constraints / Invariants

- Sploot is a pnpm Turborepo; use pnpm. `DATABASE_URL` is the Prisma var.
- Product JSON APIs preserve `401 {"error":"Unauthorized"}`
  (`apps/web/lib/auth/api.ts:26`; oracle:
  `apps/web/__tests__/api/auth-unauthorized-contracts.test.ts`).
- **Two auth front doors exist** (verified): (1) policy-based
  `authenticateRequest(req, policy)` / `withAuthenticatedApi` — used by only 5
  routes (`/api/upload`, `/api/upload/url`, `/api/piles`, `/api/taste/profile`,
  `/api/cache/stats`); (2) `lib/auth/server.ts`
  `getAuth`/`getAuthWithUser`/`requireUserId*` (qa-local short-circuit, then
  Clerk `auth()` directly) — used by ~16 routes incl. `/api/assets`,
  `/api/assets/[id]` DELETE, `/api/search`, `/api/tags`, `/api/stats`. Door (2)
  has **no policy parameter and never calls the token verifier**, so it cannot
  accept a `splt_` token at all. Upload-token verification therefore lives in
  **exactly one** function (`authenticateRequest`, via
  `lib/auth/upload-token.ts`); `server.ts` must **never** learn the `splt_`
  token. The auth-import lint guard (`pnpm lint`, see AUTH.md) bans direct
  Clerk/`verifyBearerOrThrow` imports in product routes — the new branch lives
  inside `lib/auth`, not in routes.
- The token plaintext is shown exactly once (at mint) and is **never** stored,
  logged, or returned again. Only `sha256(token)` is persisted. Observability
  already redacts token/cookie/secret/session/api-key-shaped keys
  (apps/web/CLAUDE.md → Error Tracking); log token **id/prefix** only, never the
  secret.
- Schema change is **additive** (one new table). No existing table is altered;
  no `users.id` rewrite.
- Migrations do not auto-run on Vercel deploy and prod `DATABASE_URL` is
  build-withheld — see memory `sploot-vercel-migrations`. The new table must be
  applied to prod before the feature is usable (Risk + Rollout).
- Upload-only is enforced **two ways, not one**: door-(1) routes are
  deny-by-default (`allowUploadToken` defaults false; only the 2 upload routes
  opt in), and door-(2) routes physically cannot reach the verifier. A `splt_`
  token presented anywhere except the opted-in upload routes returns the stable
  401.
- `verifyUploadToken` is **throw-safe**: any DB/Prisma error (including a
  not-yet-migrated `upload_tokens` table) returns `null` → 401, never a 500. An
  auth decision must never throw.
- Revoked and unknown tokens are **indistinguishable**: both resolve to `null`
  with the same response body, the same log line, and no reason-string or
  latency tell (achieved by matching `revokedAt IS NULL` in the lookup, so a
  revoked row is simply "not found").

## Authority Order

tests > type system > code > docs > lore

## Repo Anchors

- `apps/web/lib/auth/request-auth.ts` — central resolver; the new branch goes
  here, after qa-local and before Clerk.
- `apps/web/lib/auth/types.ts` — `AuthProvider` / `AuthSource` /
  `AuthCredentialKind` / `AuthPolicy`; extend each (`'upload-token'`,
  `allowUploadToken?`).
- `apps/web/lib/auth/qa-local.ts` — **exemplar** for a custom credential:
  Web Crypto `sha256`/hex, base64url, `RequestAuthResult` union. Reuse the hash
  + token-extraction idioms; this token differs in being DB-backed + per-user.
  Do **not** copy `constantTimeEqual` — it guards an HMAC signature compare;
  here the lookup is an indexed equality on a 256-bit-entropy hash, so a
  timing-safe compare buys nothing (no low-entropy secret; an attacker cannot
  iterate 2^256).
- `apps/web/lib/auth/server.ts` — the **second auth door**
  (`getAuth`/`getAuthWithUser`/`requireUserId*`), the path `/api/assets`,
  `/api/search`, `/api/tags`, `/api/stats`, etc. use. It must stay
  token-blind (guard test asserts no `splt_`/upload-token reference).
- `apps/web/lib/auth/api.ts` — `unauthorizedResponse()`; the stable 401.
- `apps/web/app/api/upload/route.ts:40` — change `authenticateRequest(req)` →
  `authenticateRequest(req, { allowUploadToken: true })`.
- `apps/web/app/api/upload/url/route.ts:21` — pass `{ allowUploadToken: true }`
  to `withAuthenticatedApi` (recommended include).
- `apps/web/lib/upload/ingest-image.ts` — the shared pipeline; **do not touch**,
  just call it (dedupe via `Asset @@unique([ownerUserId, checksumSha256])`).
- `apps/web/prisma/schema.prisma:37-51` — `UserIdentity` is the precedent for an
  auxiliary credential row hanging off `User` (cuid id, FK cascade, `@@map`,
  snake_case `@map`). Model the new `UploadToken` the same way.
- `apps/web/app/app/settings/page.tsx:113-141` — the storage-meter card is the
  UI exemplar (client component, `fetch` + state, `bg-card`/`border-border`
  shadcn aliases, lowercase meme voice). Add the tokens card here.
- `apps/web/__tests__/api/upload-url.test.ts` — exemplar route test: `vi.hoisted`
  mocks for `authenticateRequest`, crafted `NextRequest`, status+body asserts.
  Pure (no DB).
- `apps/web/__tests__/lib/auth/verify-bearer.test.ts` — exemplar for unit-testing
  a verifier in isolation (mock `@clerk/backend`, `resetModules`).
- `apps/extension/shared/api-client.ts` — prior art for the HTTP recipe:
  `POST /api/upload`, `Authorization: Bearer …`, multipart `file` (+ optional
  `metadata` JSON `{source}`); do **not** set Content-Type manually.
- `apps/web/docs/AUTH.md` (Modes table) and `apps/web/docs/API.md` (auth +
  upload recipe) — docs to extend with the third credential + Shortcut recipe.

## Alternatives Considered

| Option | Shape | Strength | Failure mode | Verdict |
|---|---|---|---|---|
| **Upload token + Apple Shortcut** | Opaque hashed PAT, upload-only; documented Shortcut posts to `/api/upload` | Hits the real outcome; no new pipeline; token reusable for CLI/automation | We own a credential lifecycle (mint/revoke/leak) | **Choose** |
| Copy → paste into upload zone (status quo) | No build; document the manual path | Zero cost; already works for *copyable* images | Many apps offer Share but not Copy; multi-tap; not "from where they live" | Keep as documented fallback; insufficient alone |
| Stateless HMAC token (qa-local style) | Sign `{userId}` with an env secret, no DB row | Smallest code; no migration | **Cannot revoke** and **cannot store hashed** — both are explicit oracle requirements | Reject |
| Scoped-token / API-key platform | `scopes` column + generic scope middleware | Future-proof for read/delete tokens | Speculative generality; one scope exists; larger surface, more to secure | Reject (YAGNI); revisit if a second scope appears |
| Clerk OAuth device flow into the Shortcut | Shortcut drives a Clerk auth handshake | Reuses Clerk; no new credential | Shortcuts can't hold a session; heavy, Clerk-coupled, fragile | Reject |
| Email-to-Sploot (share → Mail → inbound parse) | Unique address ingests attachments | Uses a share-sheet target that exists on iOS | New inbound-email infra + dependency; latency; spam surface | Reject now; note as a separate ingestion idea |

Scope enforcement sub-decision — **scope by policy** (only ingestion routes set
`allowUploadToken: true`) vs **scope on token** (a `scopes` column checked by
middleware): choose scope-by-policy. It matches the existing
`allowClerk`/`allowQaLocal` grain exactly, adds no token field, and makes the
blast radius a grep (`allowUploadToken` appears on exactly the upload routes).
Deny-by-default everywhere else *is* the upload-only guarantee.

## Technical Design

Chosen architecture: an opaque, per-user, DB-backed personal access token,
verified by a new branch inside the existing auth resolver and accepted only by
routes that explicitly opt in.

**Token primitive**
- Format: `splt_` + `base64url(32 random bytes)` (high entropy → fast hash is
  safe; no bcrypt/argon needed, as there is no low-entropy secret to stretch —
  same reasoning GitHub uses for PATs).
- At rest: store only `sha256(token)` (hex) in `tokenHash` (unique). Plaintext
  is returned once from the mint call and never again.
- Display: store a non-secret `prefix` (e.g. `splt_` + first 6 of the random
  part) + a user-supplied `name` so the settings list is identifiable.
- Revocation: soft — `revokedAt DateTime?`. Verification matches
  `revokedAt IS NULL`. (Hard-delete is the alternative; soft-revoke keeps an
  audit/last-used trail and a clean "revoked" state in the list.)
- `lastUsedAt DateTime?`: best-effort update on successful auth (never blocks or
  throws; matches the observability "never throw" ethos). Throttle to ≥60s
  staleness if write volume is a concern.

**New Prisma model** (additive; mirror `UserIdentity`):
```prisma
model UploadToken {
  id         String    @id @default(cuid())
  userId     String    @map("user_id")
  name       String
  tokenHash  String    @unique @map("token_hash")
  prefix     String
  lastUsedAt DateTime? @map("last_used_at")
  revokedAt  DateTime? @map("revoked_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@map("upload_tokens")
}
```
(Add the back-relation `uploadTokens UploadToken[]` to `User`.)

**Verification path** (`apps/web/lib/auth/upload-token.ts`, new)
- `extractUploadToken(req): string | null` — read `Authorization: Bearer …`,
  return the value iff it starts with the `splt_` prefix.
- `verifyUploadToken(token): Promise<AuthenticatedPrincipal | null>` —
  `sha256(token)` (hex), then a single
  `prisma.uploadToken.findFirst({ where: { tokenHash, revokedAt: null } })`
  (revoked ≡ not-found). On a hit, best-effort bump `lastUsedAt`
  (`update({ where: { id, revokedAt: null }, … })`, errors swallowed, never
  blocks). Return a principal `{ userId, provider: 'upload-token', source:
  'upload-token', credentialKind: 'upload-token' }` or `null`. **The whole body
  is wrapped so any DB error returns `null`** (→ 401), never throws (→ 500).
- `lib/auth/types.ts`: add `'upload-token'` to the three unions; add
  `allowUploadToken?: boolean` to `AuthPolicy` (default false).
- `lib/auth/request-auth.ts`: after qa-local, before Clerk — if
  `resolvedPolicy.allowUploadToken` and a `splt_` bearer is present, verify it;
  on success return authenticated; on failure return
  `{ status: 'unauthenticated', reason: 'upload-token-invalid' }` **without**
  falling through to Clerk (a `splt_` bearer is unambiguously a token attempt).
  If no `splt_` bearer, fall through to Clerk unchanged. Default policy keeps
  `allowUploadToken: false`, so no existing route is affected.

**Scope enforcement (opt-in)**
- `app/api/upload/route.ts` POST → `authenticateRequest(req, { allowUploadToken: true })`.
- `app/api/upload/url/route.ts` → `withAuthenticatedApi(handler, { allowUploadToken: true })`.
- Leave `app/api/upload/check` Clerk-only (uses `verifyBearerOrThrow` directly;
  the Shortcut posts to `/api/upload` which dedupes server-side anyway — out of
  scope).
- All other routes untouched. Door-(1) routes (`/api/piles`,
  `/api/taste/profile`, `/api/cache/stats`) keep `allowUploadToken:false` → the
  token branch is not entered → 401. Door-(2) routes (`server.ts`) never reach
  the verifier → 401. The scope guarantee is proven at the `authenticateRequest`
  unit level (see Verification), **not** by hitting routes that cannot reach the
  branch.

**Token management API** (Clerk-session authed via `withAuthenticatedApi`
default policy → upload tokens **cannot** manage tokens):
- `POST /api/upload-tokens` — body `{ name }`; mint; return
  `{ id, name, token, prefix, createdAt }` (plaintext `token` once). Enforce a
  cap (max 10 active tokens/user → 422 with a lowercase message).
- `GET /api/upload-tokens` — list `{ id, name, prefix, lastUsedAt, createdAt }`
  (never plaintext).
- `DELETE /api/upload-tokens/[id]` — ownership-checked soft revoke; idempotent.

**Settings UI** (`app/app/settings/page.tsx`, new card after storage)
- Follows the storage-meter card grammar (`<section className="bg-card border
  border-border p-5 space-y-4">`, shadcn aliases, lowercase meme voice — e.g.
  "shortcut keys", "mint one, paste it into the Save-to-Sploot shortcut, never
  see it again").
- States: list (name, prefix, last used, revoke button); "mint token" →
  reveals plaintext once with a copy button + a link to the Shortcut recipe;
  empty state nudges iOS users to the recipe.

**Apple Shortcut recipe** (`apps/web/docs/shortcuts/save-to-sploot.md`, new)
- Step-by-step build in the iOS Shortcuts app: *Accept images from share sheet*
  → *Get Contents of URL* `POST https://sploot.app/api/upload`, header
  `Authorization: Bearer <token>`, request body `Form`, field `file` = Shortcut
  Input, optional field `metadata` = `{"source":"apple-shortcut"}` → branch on
  status (201 toast "saved", 409 "already in sploot").
- Shortcut **artifact decision**: ship the recipe doc (satisfies the oracle's
  "step-by-step recipe"). A shareable signed `.shortcut`/iCloud link can only be
  generated from an Apple device by the user; note it as an optional
  user-generated follow-up, do not block on producing a binary.
- Cross-link from settings, `docs/API.md` (new "Personal upload tokens"
  section), and `docs/AUTH.md` (third Modes row: `upload-token`).

ADR decision: lightweight ADR in `apps/web/docs/adr/` — this adds a new
credential class and security surface. Record the scope-by-policy and
hashed-PAT decisions.

## Verification System

- **Claim:** a valid upload token can POST an image to `/api/upload` (lands,
  deduped); a revoked/garbage token gets the stable 401; an upload token cannot
  read or delete anything.
- **Falsifier:** a revoked token still uploads; a `splt_` token authenticates
  against `/api/assets` (read) or a DELETE route; a bad token returns non-401;
  plaintext appears in any log/DB column other than the one-time mint response.
- **Driver (automated):**
  - `pnpm --filter web vitest run` over new tests:
    - `__tests__/lib/auth/upload-token.test.ts` — verify valid / revoked /
      unknown-hash / non-`splt_` bearer; `lastUsedAt` best-effort.
    - `__tests__/api/upload-tokens.test.ts` — mint returns plaintext once + cap;
      list never returns plaintext; revoke is ownership-checked + idempotent
      (pure, mocked prisma + auth, per `upload-url.test.ts`).
    - `__tests__/lib/auth/upload-token-scope.test.ts` (**the real scope
      falsifier**) — a *valid* `splt_` token through
      `authenticateRequest(req, {})` and `{ allowUploadToken: false }` returns
      `unauthenticated` and `verifyUploadToken` is **not called** (spy); only
      `{ allowUploadToken: true }` enters the branch. Plus a guard: grep
      `lib/auth/server.ts` for `splt_`/upload-token → none.
    - extend `__tests__/api/auth-unauthorized-contracts.test.ts` — **smoke**: a
      `splt_` token to a door-(1) non-opted route (`/api/piles`) and a door-(2)
      route (`/api/assets` DELETE) returns `401 {"error":"Unauthorized"}`
      (redundant end-to-end confirmation, not the guarantee itself).
  - A live credential cycle (the oracle's mint → POST → revoke → 401), runnable
    against the `qa-local`/`qa:seed` local stack:
    `mint → curl -F file=@fixture.png -H "Authorization: Bearer splt_…"
    /api/upload (201) → repeat (409) → DELETE the token → same curl (401)`.
- **Driver (manual / stop condition):** the real-device share-sheet tap (oracle
  item 3, "verified on a real device") is **human-in-the-loop**, exactly like
  026's open item. The agent cannot tap an iPhone share sheet headlessly. The
  curl cycle is the automatable proxy; the device test is a documented user
  checklist in the evidence packet. **Stop and hand off** rather than claim the
  device path.
- **Grader:** route/unit tests green; the curl-cycle transcript; `pnpm
  lint && pnpm type-check && pnpm --filter web test` green.
- **Evidence packet:** `pnpm --filter web qa:evidence` →
  `docs/qa/evidence/2026-06-18-upload-tokens/packet.md` (mint UI screenshot,
  curl transcript, the four-step cycle, manual device checklist).
- **Cadence:** report after the token primitive + branch lands (milestone 1
  critic gate), and again after the UI/recipe land.
- **Gaps / waiver:** the route/unit tests are mocked (no DB), so they do **not**
  prove DB-backed verification — the live curl cycle on the qa-local stack is the
  only real proof that `verifyUploadToken` resolves a real row, and it is part of
  the evidence packet. Real-device share-sheet verification is deferred to the
  user (human-in-the-loop).

## Oracle

- [ ] `POST /api/upload-tokens` mints a token, returns plaintext exactly once,
      persists only `sha256`; `GET` lists metadata without plaintext; `DELETE`
      revokes (ownership-checked, idempotent). Cap enforced.
- [ ] A valid `splt_` token POSTs an image to `/api/upload` → `201`; a repeat →
      `409` (dedupe via `ingestImage`); after revoke → `401 {"error":
      "Unauthorized"}`. (Live curl transcript in the evidence packet.)
- [ ] Scope proven at the unit level: a valid `splt_` token through
      `authenticateRequest` with default / `allowUploadToken:false` policy stays
      `unauthenticated` and never calls the verifier; only explicit opt-in enters
      the branch. `lib/auth/server.ts` carries no token reference (guard).
      End-to-end smoke: `splt_` → `/api/piles` and `/api/assets` DELETE → `401`.
- [ ] `verifyUploadToken` is throw-safe (prisma error → `null` → 401, not 500)
      and revoked ≡ unknown (indistinguishable). (Unit tests.)
- [ ] Settings shows a tokens card (mint reveals once + copy + recipe link;
      list; revoke); `pnpm lint:design` green.
- [ ] `apps/web/docs/shortcuts/save-to-sploot.md` documents the share-sheet
      Shortcut; settings + `docs/API.md` + `docs/AUTH.md` link/row updated.
- [ ] `pnpm lint && pnpm type-check && pnpm --filter web test` green.
- [ ] Evidence packet at `docs/qa/evidence/2026-06-18-upload-tokens/` with the
      mint→POST→revoke→401 cycle and a manual real-device checklist.

## Premise Source

Premise Source: `sha256:58994f5d7c2ff54518a7f356c5efd1d311fd7ba3bf577514fd190209d8951166 backlog.d/033-ios-share-sheet-ingestion.md`

The platform reality (WebKit lacks Web Share Target; Apple Shortcuts are the
sanctioned escape hatch) was confirmed on the user's iPhone on 2026-06-11 and
is recorded in the ticket Notes.

## HTML Plan

`/tmp/upload-tokens-plan.html` — authored from `skills/shape/templates/html-plan.html`,
opened for rendered review before execution.

## Critique

A fresh-context adversarial security critic (separate lane, artifact-only)
reviewed this packet against the live auth code. It found the original scope
oracle **non-falsifiable**: it named routes (`/api/assets`, `/api/search`) that
use the *second* auth door (`lib/auth/server.ts`) and can never reach the new
branch, so the test would pass with zero implementation. Folded in: the two-door
reality + the token-blind invariant on `server.ts` (Constraints, Anchors), the
re-anchored unit-level scope falsifier (Verification, Oracle), throw-safe
verification + revoked-≡-unknown (Constraints, Design), and the explicit
no-rate-limit residual (Risk). Confirmed solid by the critic and left as-is: the
sha256/entropy choice (no constant-time compare needed), Clerk/extension
non-regression, storage quota as the real volume bound, and the honest
human-in-the-loop scoping of the device test.

## Risk + Rollout

- **Leaked token → silent uploads to a user's library.** Mitigate: upload-only
  scope (can't read/delete/exfiltrate), one-tap revoke, `lastUsedAt` surfaced in
  settings, cap on active tokens, never log the secret. **Accepted residual:**
  the repo has no per-request rate limiter and this lane adds none — storage
  quota (`ingestImage` reserves bytes) is the only volume bound on a leaked
  token, and revoke is the only kill switch. The token's 256-bit entropy makes
  online guessing infeasible, so no brute-force limiter on verification is
  needed; a mint-attempt cap bounds abuse of the management route.
- **Plaintext accidentally logged.** Mitigate: log id/prefix only; rely on the
  existing redaction of token-shaped keys; a test asserts the mint response is
  the sole place plaintext appears.
- **Scope leak via a future route forgetting deny-by-default.** Mitigate: it is
  deny-by-default — a new route would have to *opt in*; the scope test enumerates
  protected routes; ADR records the rule.
- **Clerk-bearer regression.** Mitigate: the branch only triggers on a `splt_`
  prefix; Clerk JWTs (`eyJ…`) and the extension path are untouched; the 401
  contract test guards the boundary.
- **Migration not applied in prod** (memory `sploot-vercel-migrations`: no
  auto-run, prod `DATABASE_URL` build-withheld). Mitigate: rollout step —
  apply `upload_tokens` to the prod Neon branch via `prisma migrate deploy`
  with the prod URL before/at release. Because `verifyUploadToken` is
  throw-safe, a `splt_` token before the table exists returns the stable 401
  (not a 500); only the *mint* route (which must write) errors, so ship the
  migration before exposing the settings card.
- **Real-device path unverified by the agent.** Mitigate: documented user
  checklist + the curl cycle as proxy; explicit stop/hand-off, not a false
  "verified" claim.
- **Rollback:** additive and self-contained — revert the routes/UI/branch; the
  `upload_tokens` table is inert if unused and can be dropped in a follow-up
  migration. No existing flow depends on it.

## Implementation Sequence

1. Add the `UploadToken` model + `User.uploadTokens` back-relation;
   `db:migrate:dev` to create `upload_tokens`.
2. `lib/auth/upload-token.ts` (extract + throw-safe verify + sha256 + scoped
   best-effort lastUsed; revoked ≡ unknown) + unit tests
   (valid / revoked / unknown / non-`splt_` / prisma-throws). Extend
   `lib/auth/types.ts` unions + `allowUploadToken`.
3. Wire the branch into `authenticateRequest` (after qa-local, before Clerk);
   default policy unchanged. **Milestone-1 critic gate** (auth/security diff).
4. Opt the upload routes in (`/api/upload`, `/api/upload/url`). Add the
   unit-level scope falsifier (default policy doesn't enter the branch; verifier
   not called), the `server.ts` token-blind guard test, and the end-to-end
   smoke in `auth-unauthorized-contracts`.
5. Token management routes (`/api/upload-tokens` mint/list, `[id]` revoke) +
   route tests (cap, plaintext-once, ownership).
6. Settings tokens card (mint-once reveal + copy + revoke + recipe link).
7. `docs/shortcuts/save-to-sploot.md` + AUTH.md row + API.md section + ADR.
8. Live curl cycle + `qa:evidence` packet; document the real-device checklist.
9. Gates green; report; hand off the device test.
