# Evidence Packet: upload-tokens

- Date: 2026-06-18
- Branch: `deliver-033-ios-share-sheet-tokens`
- Ticket: `backlog.d/033-ios-share-sheet-ingestion.md` (+ `.ctx.md`)

> Hand-authored. `pnpm --filter web qa:evidence` (the browser+seed harness) was
> not runnable in the delivery environment — no local Postgres, Vercel Blob
> token, or Clerk keys. Automated checks below were run; the live cycle, browser
> walk, and real-device test are operator steps with exact commands.

## Intent

An iPhone user can mint a hashed, revocable, **upload-only** personal token and
use a "Save to Sploot" Apple Shortcut to share images from the iOS share sheet
into their library (deduped). A token presented to any non-upload route, or
after revocation, returns the stable `401`.

## Checks — automated (run)

### PASS — type-check

```
pnpm --filter web type-check        # tsc --noEmit, exit 0
```

### PASS — lint + auth boundary guard

```
pnpm --filter web lint              # next lint: no warnings/errors; auth:guard exit 0
```

### PASS — auth core unit + scope falsifier (17 tests)

```
CI=1 pnpm --filter web vitest run \
  __tests__/lib/auth/upload-token.test.ts \
  __tests__/lib/auth/upload-token-scope.test.ts
```

Covers: mint format + hash match + uniqueness; `splt_` extraction (rejects Clerk
`eyJ…` JWTs, non-Bearer); verify valid/revoked/unknown; **throw-safety** (DB
error → null → 401, not 500); **revoked ≡ unknown**; the **deny-by-default scope
falsifier** (verifier is not even called under default/`allowUploadToken:false`
policy; entered only on explicit opt-in); and the `server.ts` token-blind guard.

### PASS — token management routes (9 tests)

```
CI=1 pnpm --filter web vitest run __tests__/api/upload-tokens.test.ts
```

Covers: mint returns plaintext once + persists only the hash; name validation;
active-token cap (422); list excludes the hash; ownership-scoped + idempotent
revoke; 401 when unauthenticated.

### PASS — /api/upload opt-in wiring (2 tests)

```
CI=1 pnpm --filter web vitest run __tests__/api/upload-token-opt-in.test.ts
```

Proves `/api/upload` calls `authenticateRequest` with `{ allowUploadToken: true }`
and returns the stable 401 when the token is rejected.

### PASS — regression sweep (196 tests, 22 files)

```
CI=1 pnpm --filter web vitest run __tests__/lib/auth __tests__/api \
  --exclude '**/*.integration.test.ts'
```

All auth + API route tests pass; no regression in the existing 401 contract,
Clerk bearer path, or upload routes.

## Checks — live (operator steps, pending)

These need a running server with a migrated DB, a Vercel Blob token, and an
authenticated session (Clerk or `qa-local`). Apply the migration first:
`pnpm --filter web db:migrate` (or `db:migrate:dev` locally).

### PENDING — mint → upload → dedupe → revoke → 401 cycle

```
# 1. Mint in the UI (Settings → Upload tokens) or via the session API, copy splt_…
# 2. Upload:
curl -i -X POST "$BASE/api/upload" -H "Authorization: Bearer splt_…" -F "file=@meme.png"   # expect 201
# 3. Repeat the same file:
curl -i -X POST "$BASE/api/upload" -H "Authorization: Bearer splt_…" -F "file=@meme.png"   # expect 409 (dedupe)
# 4. Scope: same token at a read/delete route:
curl -i "$BASE/api/assets" -H "Authorization: Bearer splt_…"                                # expect 401
# 5. Revoke in the UI, then re-run step 2:
curl -i -X POST "$BASE/api/upload" -H "Authorization: Bearer splt_…" -F "file=@meme.png"   # expect 401
```

### PENDING — browser walk of the settings card

`/app/settings` → Upload tokens card: mint reveals the token once with copy;
list shows name/prefix/last-used; revoke removes it; recipe `<details>` renders.

### PENDING — real-device share-sheet test (human-in-the-loop)

Build the shortcut from `apps/web/docs/shortcuts/save-to-sploot.md`, share a
photo from the iOS share sheet, confirm it lands in the library. (Cannot be
automated; same class as epic 026's open device-verification item.)

## Verdict

Auth core, management API, UI, and docs implemented and proven by 196 automated
tests + type-check + lint. The milestone-1 fresh-context security critic cleared
the auth core (no blocker). Live end-to-end cycle, browser walk, and real-device
test are documented operator steps, pending an environment with DB/blob/session.

## Residual Risk

- Live upload success (201) is unproven by automation (needs a Blob token); the
  auth/scope/revoke/401 paths are proven by tests and reject before any blob
  write.
- The `upload_tokens` migration must be applied to an environment before its
  mint route works there (verify is throw-safe, so a token pre-migration returns
  401, not 500). On Vercel, migrations do not auto-run.
- `pnpm lint:design` is red on `docs/design/component-library.md` — pre-existing
  and unrelated to this change (verified by stashing); tracked separately.
