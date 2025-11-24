# db vibes: keep it single-track, keep it loud

## tl;dr
- trunk is `master`. prod DB should always be the `master` Neon branch.
- previews hit a read-only replica (default) unless you *explicitly* opt-in to a writable preview.
- one source of truth: `config/database.env`. scripts sync it to Vercel; dashboards are noise.
- runtime fingerprint guard 503s if the DB host drifts. env header `x-env-fingerprint` shows what you’re really hitting.

## what exists now
- Canonical URLs live in `config/database.env`.
- `pnpm db:sync prod|preview` pushes those URLs into Vercel envs (no manual clicks).
- Middleware checks `DB_FINGERPRINT_HOST` in prod; mismatch → 503 + Sentry tag.
- CI drift gate (`.github/workflows/db-drift-check.yml`) runs `prisma migrate status` against prod (needs `PROD_DB_URL` secret).
- Scripts:
  - `pnpm db:fingerprint` — prints host + migration hash.
  - `pnpm db:drift` — drift check.
  - `scripts/neon-create-preview-read.sh` — makes a read-only `preview-read` branch from `master`.

## how to keep us safe
1) **Pin envs from git**  
   - Edit `config/database.env`.  
   - Run `pnpm db:sync prod` and `pnpm db:sync preview`.  
   - Set `DB_FINGERPRINT_HOST` in Vercel prod to the prod host.

2) **Preview strategy (recommended)**  
   - Create `preview-read` from `master` (read-only): `NEON_API_KEY=... NEON_PROJECT_ID=... ./scripts/neon-create-preview-read.sh`.  
   - Drop its URLs into `config/database.env` → `pnpm db:sync preview`.

3) **Clean old branches**  
   - `scripts/cleanup-old-neon-branches.sh` (needs `neonctl`, `NEON_API_KEY`).  
   - Automate nightly via GH Action if you’re feeling spicy.

4) **Detect drift fast**  
   - Runtime: fingerprint guard + `/api/assets` logs zero-count with `db_drift` tag.  
   - CI: drift gate fails the build if prod schema doesn’t match migrations.

## recipes
### new deploy (prod)
```
pnpm db:fingerprint   # sanity
pnpm db:drift         # drift gate
pnpm db:sync prod     # ensure env matches git
pnpm build && vercel deploy --prebuilt --prod
```

### set up preview-read once
```
export NEON_API_KEY=...
export NEON_PROJECT_ID=...
./scripts/neon-create-preview-read.sh
# paste connection strings into config/database.env
pnpm db:sync preview
```

### bust a suspected drift
- Check `/api/health/user-sync` and `x-env-fingerprint` header.
- If host mismatch: update `config/database.env`, run `pnpm db:sync prod`, redeploy.

## invariants
- prod DB host == `DB_FINGERPRINT_HOST` == `config/database.env` PROD host.
- No “quick fixes” via dashboard edits. Change the file, sync, deploy.

