# Neon branch cleanup

use `neonctl` or the Neon API to inventory branches. before deletion, compare
each branch endpoint with the `DATABASE_URL` values held by local development,
CI, and the DigitalOcean web component without printing credentials.

keep `main`. remove a preview branch only when it has no active connection,
deployment reference, or recovery purpose. after cleanup, verify the production
database through `https://www.sploot.app/api/health` and run
`pnpm --filter web validate:deployment`.

Neon is an independent data plane; its branch lifecycle does not depend on a
compute-provider integration.
