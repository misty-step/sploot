#!/usr/bin/env node

/**
 * Repo-owned authenticated gallery oracle.
 *
 * This gate owns the production build, standalone front door, isolated seed,
 * provenance manifest, and Playwright matrix. It intentionally has no dev
 * server branch: a gallery capture is invalid unless the browser is pointed
 * at the loopback-only standalone artifact through the signed QA seam.
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const webRoot = process.cwd();
const databaseUrl = process.env.QA_GALLERY_DB_URL;
const secret = process.env.SPLOOT_QA_AUTH_SECRET;
const publicPort = Number(process.env.QA_GALLERY_PORT ?? 3474);
const appPort = Number(process.env.QA_GALLERY_APP_PORT ?? publicPort + 1);
const baseURL = `http://127.0.0.1:${publicPort}`;
const lifecyclePath = join(webRoot, '.next/qa-evidence-lifecycle.json');

function fail(message) {
  console.error(`[qa:gallery] ${message}`);
  process.exit(1);
}

if (!databaseUrl) fail('QA_GALLERY_DB_URL is required and must point at the fresh isolated pgvector database');
let parsedDatabaseUrl;
try { parsedDatabaseUrl = new URL(databaseUrl); } catch { fail('QA_GALLERY_DB_URL is malformed'); }
if (!['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname)) {
  fail('QA_GALLERY_DB_URL must be loopback-only');
}
if (!parsedDatabaseUrl.pathname || parsedDatabaseUrl.pathname === '/' || parsedDatabaseUrl.pathname.includes('postgres')) {
  fail('QA_GALLERY_DB_URL must name an isolated database, not the postgres maintenance database');
}
if (!secret || secret.length < 16) fail('SPLOOT_QA_AUTH_SECRET must be an explicit short-lived-proof signing secret');
if (process.env.CLERK_SECRET_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  fail('QA evidence cannot coexist with Clerk credentials');
}
if ((process.env.PLAYWRIGHT_SERVER_MODE ?? 'production') !== 'production') {
  fail('gallery evidence refuses a non-production Playwright server mode');
}

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  SPLOOT_QA_AUTH_MODE: 'enabled',
  SPLOOT_QA_EVIDENCE_MODE: 'enabled',
  SPLOOT_QA_DEPLOYMENT_ID: 'sploot-gallery-qa-local',
  SPLOOT_QA_DEPLOYMENT_AUDIENCE: 'sploot-gallery-evidence',
  DEPLOYMENT_ENV: 'qa-local',
  NEXT_PUBLIC_SPLOOT_QA_AUTH_MODE: 'enabled',
  NEXT_PUBLIC_SPLOOT_QA_EVIDENCE_MODE: 'enabled',
  NEXT_PUBLIC_SPLOOT_QA_DEPLOYMENT_ID: 'sploot-gallery-qa-local',
  SPLOOT_QA_AUTH_SECRET: secret,
  SEARCH_CURSOR_SECRET: secret,
  PLAYWRIGHT_SERVER_MODE: 'production',
  PLAYWRIGHT_BASE_URL: baseURL,
  QA_EVIDENCE_LIFECYCLE_PATH: lifecyclePath,
};

function run(command, args) {
  console.log(`[qa:gallery] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: webRoot, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function findCapturePacket(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findCapturePacket(path);
      if (found) return found;
    } else if (entry.name === 'matrix-provenance.json') {
      return path;
    }
  }
  return null;
}

function bindTeardownToCapturePacket() {
  if (!readdirSync(join(webRoot, 'test-results'), { withFileTypes: true }).length) return;
  const packetPath = findCapturePacket(join(webRoot, 'test-results'));
  if (!packetPath) return;
  const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
  const lifecycle = JSON.parse(readFileSync(lifecyclePath, 'utf8'));
  writeFileSync(packetPath, `${JSON.stringify({
    ...packet,
    captureCommand: 'pnpm --filter web qa:gallery',
    standaloneStartCommand: `${process.execPath} scripts/qa-evidence-server.mjs`,
    lifecycle,
    teardownRecordedAfterCapture: true,
  }, null, 2)}\n`);
  console.log(`[qa:gallery] bound post-teardown lifecycle to ${packetPath}`);
}

rmSync(join(webRoot, 'test-results'), { recursive: true, force: true });
mkdirSync(join(webRoot, 'test-results'), { recursive: true });
rmSync(lifecyclePath, { force: true });
run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
run('pnpm', ['exec', 'tsx', 'scripts/qa-seed.ts', '--user-id', 'qa-design-user', '--count', '100']);
run('pnpm', ['exec', 'next', 'build', '--webpack']);
rmSync(join(webRoot, '.next/standalone/apps/web/public'), { recursive: true, force: true });
rmSync(join(webRoot, '.next/standalone/apps/web/.next/static'), { recursive: true, force: true });
cpSync(join(webRoot, 'public'), join(webRoot, '.next/standalone/apps/web/public'), { recursive: true });
cpSync(join(webRoot, '.next/static'), join(webRoot, '.next/standalone/apps/web/.next/static'), { recursive: true });
run('pnpm', ['exec', 'tsx', 'scripts/qa-provenance.ts', '.next/qa-provenance.json', '.next/standalone/apps/web']);

const server = spawn(process.execPath, ['scripts/qa-evidence-server.mjs'], {
  cwd: webRoot,
  env: { ...env, PORT: String(publicPort), QA_NEXT_PORT: String(appPort) },
  stdio: 'inherit',
});
let stopped = false;
const stop = async () => {
  if (stopped) return;
  stopped = true;
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('close', resolve));
};
process.on('SIGINT', () => void stop().finally(() => process.exit(130)));
process.on('SIGTERM', () => void stop().finally(() => process.exit(143)));

for (let attempt = 0; attempt < 120; attempt += 1) {
  try {
    const readiness = await fetch(`${baseURL}/api/version`, { redirect: 'manual' });
    if (readiness.ok) break;
    if (attempt === 119) {
      await stop();
      fail(`standalone loopback server readiness returned HTTP ${readiness.status}, expected 2xx`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  } catch {
    if (attempt === 119) {
      await stop();
      fail('standalone loopback server did not become ready');
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

let exitCode = 1;
try {
  const result = spawnSync('pnpm', ['exec', 'playwright', 'test', 'e2e/gallery.spec.ts', '--config', 'playwright.config.ts'], {
    cwd: webRoot,
    env,
    stdio: 'inherit',
  });
  exitCode = result.status ?? 1;
} finally {
  await stop();
  bindTeardownToCapturePacket();
}
process.exit(exitCode);
