#!/usr/bin/env node
// Run `prisma migrate deploy` before the production build so schema and code
// cannot ship apart (incident 2026-06-09: user_identities migration never ran).
//
// Prisma migrations need a direct (non-pooler) connection. Prefer
// DATABASE_URL_DIRECT when set; otherwise derive it from DATABASE_URL by
// stripping the Neon `-pooler` host suffix and the `pgbouncer` query param.
import { execSync } from 'node:child_process';

const pooled = process.env.DATABASE_URL;

if (!pooled) {
  console.log('[migrate-deploy] DATABASE_URL not set; skipping migrations (local/CI build without database).');
  process.exit(0);
}

function deriveDirectUrl(raw) {
  const url = new URL(raw);
  url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.delete('pgbouncer');
  return url.toString();
}

const directUrl = process.env.DATABASE_URL_DIRECT || deriveDirectUrl(pooled);

console.log('[migrate-deploy] running prisma migrate deploy...');
execSync('prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: directUrl },
});
console.log('[migrate-deploy] migrations applied.');
