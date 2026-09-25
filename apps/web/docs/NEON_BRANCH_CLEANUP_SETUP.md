# Neon branch cleanup

use `neonctl` or the Neon API to inventory branches. before deletion, compare
each branch endpoint with the `DATABASE_URL` values held by local development,
CI, and any retained predecessor deployment references without printing
credentials. there is no longer a DigitalOcean Sploot app to check.

keep `main`. remove a preview branch only when it has no active connection,
deployment reference, or recovery purpose. verify the selected Neon endpoint
directly after cleanup; `https://www.sploot.app/api/health` now returns `410`
and cannot prove Postgres health. `pnpm --filter web validate:deployment` only
applies to an explicitly started Next.js predecessor instance with
`DEPLOYMENT_URL` set to that instance, not the hosted Go library.

Neon is an independent data plane; its branch lifecycle does not depend on a
compute-provider integration.
