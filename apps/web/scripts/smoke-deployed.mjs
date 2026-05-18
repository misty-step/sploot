#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const baseUrl = (process.env.DEPLOYED_SMOKE_URL ?? 'https://www.sploot.app').replace(/\/$/, '');
const reportPath = path.resolve(
  process.cwd(),
  process.env.DEPLOYED_SMOKE_REPORT ?? 'docs/deployed-smoke-report.json'
);
const extensionDist = path.resolve(
  process.cwd(),
  process.env.EXTENSION_DIST ?? '../extension/dist/chrome-mv3'
);

const startedAt = new Date().toISOString();
const checks = [];

async function record(name, run) {
  const started = Date.now();
  try {
    const details = await run();
    const check = {
      name,
      status: 'pass',
      duration_ms: Date.now() - started,
      details,
    };
    checks.push(check);
    console.log(`ok ${name}`);
  } catch (error) {
    const check = {
      name,
      status: 'fail',
      duration_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
    checks.push(check);
    console.error(`fail ${name}: ${check.error}`);
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`expected JSON from ${url}, got: ${text.slice(0, 120)}`);
    }
  }
  return { response, json };
}

async function readJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      contents.push(...await readJavaScriptFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      contents.push(await readFile(entryPath, 'utf8'));
    }
  }

  return contents;
}

await record('production health', async () => {
  const { response, json } = await fetchJson(`${baseUrl}/api/health`, {
    headers: { accept: 'application/json' },
  });

  if (response.status !== 200) {
    throw new Error(`expected HTTP 200, got ${response.status}`);
  }
  if (json?.status !== 'ok') {
    throw new Error(`expected status ok, got ${json?.status}`);
  }
  if (json?.dependencies?.database !== 'up') {
    throw new Error(`expected database up, got ${json?.dependencies?.database}`);
  }
  if (json?.diagnostics?.database_url_configured !== true) {
    throw new Error('expected DATABASE_URL to be configured');
  }

  return {
    database: json.dependencies.database,
    redis: json.dependencies.redis,
    database_latency_ms: json.diagnostics?.connection_latency_ms ?? null,
    version: json.version ?? null,
  };
});

await record('production service health', async () => {
  const { response, json } = await fetchJson(`${baseUrl}/api/health/services`, {
    headers: { accept: 'application/json' },
  });

  if (response.status !== 200) {
    throw new Error(`expected HTTP 200, got ${response.status}`);
  }
  if (!json?.services?.database || !json?.services?.blobStorage || !json?.services?.embeddings) {
    throw new Error('expected database, blobStorage, and embeddings service entries');
  }
  if (json.services.database.status !== 'healthy') {
    throw new Error(`expected database healthy, got ${json.services.database.status}`);
  }

  return {
    status: json.status,
    all_services_configured: json.allServicesConfigured,
    database: json.services.database.status,
    blob_storage: json.services.blobStorage.status,
    embeddings: json.services.embeddings.status,
    can_upload: json.readiness?.canUpload ?? null,
    can_search: json.readiness?.canSearch ?? null,
  };
});

await record('signed-out app route protection', async () => {
  const response = await fetch(`${baseUrl}/app`, {
    method: 'GET',
    redirect: 'manual',
  });
  const location = response.headers.get('location') ?? '';

  if (![301, 302, 303, 307, 308].includes(response.status)) {
    throw new Error(`expected redirect to sign-in, got HTTP ${response.status}`);
  }
  if (!location.includes('/sign-in')) {
    throw new Error(`expected sign-in redirect, got ${location || '<missing location>'}`);
  }

  return {
    status: response.status,
    location,
  };
});

await record('signed-out api auth contract', async () => {
  const { response, json } = await fetchJson(`${baseUrl}/api/assets?limit=1`, {
    headers: { accept: 'application/json' },
  });

  if (response.status !== 401) {
    throw new Error(`expected HTTP 401, got ${response.status}`);
  }
  if (json?.error !== 'Unauthorized') {
    throw new Error(`expected Unauthorized payload, got ${JSON.stringify(json)}`);
  }

  return {
    status: response.status,
    error: json.error,
  };
});

await record('production extension artifact', async () => {
  const manifestPath = path.join(extensionDist, 'manifest.json');
  const popupPath = path.join(extensionDist, 'popup.html');
  const backgroundPath = path.join(extensionDist, 'background.js');

  for (const requiredPath of [manifestPath, popupPath, backgroundPath]) {
    if (!existsSync(requiredPath)) {
      throw new Error(`missing ${path.relative(process.cwd(), requiredPath)}`);
    }
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const javascriptBundle = (await readJavaScriptFiles(extensionDist)).join('\n');
  const hostPermissions = new Set(manifest.host_permissions ?? []);
  const requiredHosts = [
    'https://sploot.app/*',
    'https://www.sploot.app/*',
    'https://clerk.sploot.app/*',
  ];

  for (const host of requiredHosts) {
    if (!hostPermissions.has(host)) {
      throw new Error(`manifest missing host permission ${host}`);
    }
  }

  const devClerkHost = [...hostPermissions].find(host => String(host).includes('clerk.accounts.dev'));
  if (devClerkHost) {
    throw new Error(`manifest contains development Clerk host ${devClerkHost}`);
  }

  if (manifest.action?.default_popup !== 'popup.html') {
    throw new Error('manifest action.default_popup is not popup.html');
  }

  const liveKeys = javascriptBundle.match(/pk_live_[A-Za-z0-9_-]{20,}/g) ?? [];
  const testKeys = javascriptBundle.match(/pk_test_[A-Za-z0-9_-]{20,}/g) ?? [];

  if (liveKeys.length === 0) {
    throw new Error('production artifact does not contain a live Clerk publishable key');
  }

  if (testKeys.length > 0) {
    throw new Error('production artifact contains a test Clerk publishable key');
  }

  return {
    manifest: path.relative(process.cwd(), manifestPath),
    version: manifest.version,
    host_permissions: requiredHosts,
    clerk_publishable_key: 'pk_live_*',
  };
});

const failed = checks.filter(check => check.status !== 'pass');
const report = {
  base_url: baseUrl,
  extension_dist: path.relative(process.cwd(), extensionDist),
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  status: failed.length === 0 ? 'pass' : 'fail',
  checks,
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), reportPath)}`);

if (failed.length > 0) {
  process.exitCode = 1;
}
