#!/usr/bin/env node

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const baseUrl = (argument('--url') || process.env.DEPLOYMENT_URL || '').replace(/\/$/, '');
const expectedMode = argument('--expect-mode');
const expectedStatus = argument('--expect-status') || (expectedMode === 'ga' ? 'open' : 'paused');

function boundedTimeout(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

if (!baseUrl || !expectedMode || !['closed', 'capped', 'ga'].includes(expectedMode) || !['open', 'paused'].includes(expectedStatus)) {
  console.error('Usage: probe-enrollment.mjs --url <exact-deployment-url> --expect-mode <closed|capped|ga> [--expect-status <open|paused>]');
  process.exit(2);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), boundedTimeout(process.env.SPLOOT_ENROLLMENT_PROBE_TIMEOUT_MS, 10000, 30000));
let response;
try {
  response = await fetch(`${baseUrl}/api/health/enrollment`, {
    headers: { accept: 'application/json' },
    signal: controller.signal,
  });
} catch {
  console.error(JSON.stringify({ ok: false, error: 'enrollment probe timed out or was unavailable' }));
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
const payload = await response.json().catch(() => null);

const mismatches = [];
if (!response.ok) mismatches.push(`http_status=${response.status}`);
if (!payload) mismatches.push('missing_json');
if (payload?.configuration !== 'valid') mismatches.push(`configuration=${payload?.configuration ?? 'missing'}`);
if (payload?.mode !== expectedMode) mismatches.push(`mode=${payload?.mode ?? 'missing'}`);
if (payload?.status !== expectedStatus) mismatches.push(`status=${payload?.status ?? 'missing'}`);
if (Object.keys(payload ?? {}).sort().join(',') !== 'configuration,mode,status') mismatches.push('public_shape_mismatch');

if (mismatches.length > 0) {
  console.error(JSON.stringify({
    ok: false,
    status: response.status,
    expectedMode,
    mismatches,
    payload,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  url: baseUrl,
  status: payload.status,
  mode: payload.mode,
  configuration: payload.configuration,
}, null, 2));
