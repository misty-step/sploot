# db vibes: keep it single-track, keep it loud

## tl;dr
- trunk is `master`. prod DB should always be the `master` Neon branch.
- previews hit a read-only replica (default) unless you *explicitly* opt-in to a writable preview.
- **Credentials live in GitHub Secrets and Vercel environment variables only** - never committed to repo.
- CI drift gate runs `prisma migrate status` against prod (uses `PROD_DB_URL` secret).

## what exists now
- **GitHub Secrets**: `PROD_DB_URL` for CI drift checks.
- **Vercel env vars**: `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING` per environment.
- CI drift gate (`.github/workflows/db-drift-check.yml`) runs `prisma migrate status` against prod.
- Scripts:
  - `pnpm db:fingerprint` — prints host + migration hash.
  - `pnpm db:drift` — drift check.
  - `scripts/neon-create-preview-read.sh` — makes a read-only `preview-read` branch from `master`.

## how to keep us safe
1) **Store credentials securely**
   - Production URLs → GitHub Secrets (`PROD_DB_URL`)
   - All envs → Vercel environment variables (via dashboard or `vercel env`)
   - Never commit connection strings to the repo.

2) **Preview strategy (recommended)**
   - Create `preview-read` from `master` (read-only): `NEON_API_KEY=... NEON_PROJECT_ID=... ./scripts/neon-create-preview-read.sh`.
   - Add URLs to Vercel Preview env vars via `vercel env add`.

3) **Clean old branches**
   - `scripts/cleanup-old-neon-branches.sh` (needs `neonctl`, `NEON_API_KEY`).
   - Automate nightly via GH Action if you're feeling spicy.

4) **Detect drift fast**
   - CI: drift gate fails the build if prod schema doesn't match migrations.
   - `/api/assets` logs zero-count with `db_drift` tag (potential indicator).

## recipes
### new deploy (prod)
```bash
pnpm db:fingerprint   # sanity
pnpm db:drift         # drift gate
pnpm build && vercel deploy --prebuilt --prod
```

### set up preview-read once
```bash
export NEON_API_KEY=...
export NEON_PROJECT_ID=...
./scripts/neon-create-preview-read.sh
# Add connection strings to Vercel Preview env vars
vercel env add POSTGRES_URL preview
vercel env add POSTGRES_URL_NON_POOLING preview
```

### bust a suspected drift
- Check `/api/health` and Canary for `assets:zero-count` / `db-drift` metadata.
- If drift: update Vercel env vars, redeploy.

## invariants
- Credentials only in GitHub Secrets + Vercel env vars.
- No secrets committed to git. No "quick fixes" via dashboard edits without updating secrets.
