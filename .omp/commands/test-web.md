Run the web Vitest suite once:

```sh
CI=1 pnpm --filter web test
```

For one file, append its path. DB-backed tests need `DATABASE_URL` against
pgvector Postgres; report skipped DB paths explicitly. On failure, report the
first real error and repair the behavior rather than weakening the assertion.
