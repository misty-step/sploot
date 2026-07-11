# Neon database branching

production uses the Neon `main` branch through `DATABASE_URL`. local and CI
tests use disposable pgvector Postgres databases. create a Neon preview branch
only when a change needs production-shaped data or pooler behavior, then pass
its pooled URL explicitly to the command being tested.

never copy a production connection string into a committed file. never invent
aliases for Prisma: application code always reads `DATABASE_URL`, and migrations
may additionally read `DATABASE_URL_DIRECT`.

before deleting a preview branch, prove no application environment or active
operator session references it. branch lifecycle is a Neon data-plane action;
it is independent of the DigitalOcean compute deployment.
