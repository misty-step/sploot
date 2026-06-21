#!/usr/bin/env node
// Run `prisma migrate deploy` so schema and code cannot ship apart
// (incident 2026-06-09: a user_identities migration never ran).
//
// Invoked from two places:
//   - the production `build` script, which SKIPS here because Vercel marks the
//     prod DATABASE_URL as Sensitive (injected at runtime, withheld at build);
//   - the `migrate-prod` GitHub Actions job, which runs on merge to master with
//     the prod URL held as a repo secret — the path that actually applies prod
//     migrations. See docs/adr/007-prod-migrations-via-github-actions.md.
//
// Prisma migrations need a direct (non-pooler) connection. Prefer
// DATABASE_URL_DIRECT when set; otherwise derive it from DATABASE_URL by
// stripping the Neon `-pooler` host suffix and the `pgbouncer` query param.
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function deriveDirectUrl(raw) {
  const url = new URL(raw);
  url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.delete('pgbouncer');
  return url.toString();
}

export function runMigrateDeploy(env = process.env) {
  const pooled = env.DATABASE_URL;

  if (!pooled) {
    console.log('[migrate-deploy] DATABASE_URL not set; skipping migrations (local/CI build without database).');
    return;
  }

  const directUrl = env.DATABASE_URL_DIRECT || deriveDirectUrl(pooled);

  console.log('[migrate-deploy] running prisma migrate deploy...');
  execSync('prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...env, DATABASE_URL: directUrl },
  });
  console.log('[migrate-deploy] migrations applied.');
}

// Run only when invoked directly (`node scripts/migrate-deploy.mjs`), so that
// importing this module from a test does not trigger a migration.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrateDeploy();
}
