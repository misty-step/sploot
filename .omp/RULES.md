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
- **Web deploy (DigitalOcean) and extension release (Chrome Web Store) are separate
  surfaces.** Do not couple them.
- **Work tracking lives in Powder** via the registered MCP/API/CLI, not GitHub Issues or repository-local ticket files. Closure is a Powder card status update with proof, links, and acceptance-criterion evidence.
- **Ship gate = CI parity:** `pnpm lint && pnpm type-check && pnpm --filter web
  test && pnpm --filter extension build` (run the web step as `CI=1 pnpm --filter
  web test` so Vitest stays one-shot under omp's PTY). CI adds a frozen install,
  `db:migrate`, and extension lint/test on top, so green local ≈ (not =) green CI.
