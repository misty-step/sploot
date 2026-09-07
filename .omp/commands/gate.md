Run all Sploot CI-parity ship-gate commands from the repository root, in order, and report each exit result:

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

DB-backed web paths require `DATABASE_URL` against pgvector Postgres. If that
path was not exercised, report `DB path unverified`; a skipped DB test is not a
pass. CI additionally runs frozen install, Prisma migration, and the required
`merge-gate` aggregate. Keep design, economics, retrieval, and extension gates
intact; report the first real error for every failure.
