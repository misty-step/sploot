#!/usr/bin/env node
// Run `prisma migrate deploy` so schema and code cannot ship apart
// (incident 2026-06-09: a user_identities migration never ran).
//
// Invoked only by the singleton DigitalOcean PRE_DEPLOY job. It fails closed
// without DATABASE_URL; build, local development, and the long-lived service
// start do not invoke this runner.
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
    throw new Error('[migrate-deploy] DATABASE_URL is required; refusing to start without migrations.');
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
  runMigrateDeploy(process.env);
}
