# Sploot sticky rules

Read `AGENTS.md` for the repository map. Keep these invariants visible while working:

- Use pnpm and `origin/master`; do not add npm/yarn workflows.
- The local Go product uses persistent SQLite, private media and local CLIP. Acceptance owns fresh directories, never the operator's library. The retained Next predecessor still uses Prisma: `DATABASE_URL` is read at Rust-engine initialization; never invent an alias. Pooled Neon URLs require a `-pooler` host and `pgbouncer=true`; shipping Prisma schema changes use named migrations and pgvector-backed CI.
- Keep every gate intact. Diagnose environment, database, migration, WXT, and auth failures instead of weakening checks or hiding skips.
- `@sploot/common` owns shared upload limits, MIME validation, and API types. Update both web and extension consumers when it changes.
- Web deploy (DigitalOcean) and extension release (Chrome Web Store) are separate surfaces.
- Work from the operator's current request, check current code and overlapping work, and report exact proof, links, and acceptance evidence. Linear owns current work and prioritization; the session and PR record execution. Do not maintain a replacement backlog in repository docs.

## Local gate

```sh
pnpm lint
pnpm type-check
pnpm lint:design
pnpm test:economics
CI=1 pnpm --filter web test
pnpm --filter web eval:search
pnpm --filter extension lint
pnpm --filter extension test
pnpm --filter extension build
```

DB-backed predecessor paths require `DATABASE_URL` against pgvector Postgres; label them `DB path unverified` when that evidence is unavailable. CI also runs frozen install, migration, and the required `merge-gate` aggregate. The additional Go SQLite/local-inference and real extension acceptance commands are maintained in `.omp/commands/gate.md`; keep both runtime gates until a production cutover retires the predecessor.
