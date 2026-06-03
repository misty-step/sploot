# Sploot — sticky invariants

These are re-injected every turn. Violating one breaks prod or the build. Full
contract: read `AGENTS.md` (loaded as context) and `CLAUDE.md`.

- **pnpm + Turborepo only.** Never `npm`/`yarn`. Base branch is `origin/master`.
- **Prisma reads `DATABASE_URL`** at Rust-engine init — never invent aliases
  (`POSTGRES_URL`, etc.). Pooled Neon URL needs `pgbouncer=true` + `-pooler`.
- **Never lower a gate** to go green. No skipped tests, loosened lint, weakened
  thresholds. Diagnose env/DB/migration/WXT/auth setup instead.
- **`@sploot/common` is the source of truth** for upload limits, MIME
  validation, and shared API types. Change it there, then update both apps.
- **Web deploy (Vercel) and extension release (Chrome Web Store) are separate
  surfaces.** Do not couple them.
- **Work tracking lives in `backlog.d/`** (local markdown), not GitHub Issues.
  Closure = move to `backlog.d/_done/` with `Status: done`, a `## What Was
  Built` note, and a conventional-commit `Backlog:`/`Closes-backlog:` trailer.
- **Ship gate = CI parity:** `pnpm lint && pnpm type-check && pnpm --filter web
  test && pnpm --filter extension build` (run the web step as `CI=1 pnpm --filter
  web test` so Vitest stays one-shot under omp's PTY). CI adds a frozen install,
  `db:migrate`, and extension lint/test on top, so green local ≈ (not =) green CI.
