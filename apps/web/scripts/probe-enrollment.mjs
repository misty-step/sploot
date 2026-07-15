#!/usr/bin/env node

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const baseUrl = (argument('--url') || process.env.DEPLOYMENT_URL || '').replace(/\/$/, '');
const expectedMode = argument('--expect-mode');
const expectedAppId = argument('--expect-app-id');
const expectedChangeId = argument('--expect-change-id');
const expectedCommit = argument('--expect-commit');
const expectedMarker = argument('--expect-marker');
const expectedAccepting = argument('--expect-accepting');

function boundedTimeout(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

if (!baseUrl || !expectedMode || !expectedAppId || !expectedChangeId || !expectedCommit || !expectedMarker) {
  console.error('Usage: probe-enrollment.mjs --url <exact-deployment-url> --expect-mode <closed|capped|ga> --expect-app-id <app-id> --expect-change-id <change-id> --expect-commit <sha> --expect-marker <production|staging> [--expect-accepting <true|false>]');
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

const expectedGaLifted = expectedMode === 'ga';
const expectedAcceptingNewAccounts = expectedAccepting === undefined
  ? expectedMode === 'ga'
  : expectedAccepting === 'true';
const mismatches = [];
if (!response.ok) mismatches.push(`http_status=${response.status}`);
if (!payload) mismatches.push('missing_json');
if (payload?.configuration !== 'valid') mismatches.push(`configuration=${payload?.configuration ?? 'missing'}`);
if (payload?.mode !== expectedMode) mismatches.push(`mode=${payload?.mode ?? 'missing'}`);
if (payload?.gaLifted !== expectedGaLifted) mismatches.push(`gaLifted=${payload?.gaLifted}`);
if (payload?.acceptingNewAccounts !== expectedAcceptingNewAccounts) mismatches.push(`acceptingNewAccounts=${payload?.acceptingNewAccounts}`);
if (expectedAppId && payload?.deploymentAppId !== expectedAppId) mismatches.push(`deploymentAppId=${payload?.deploymentAppId ?? 'missing'}`);
if (expectedChangeId && payload?.deploymentChangeId !== expectedChangeId) mismatches.push(`deploymentChangeId=${payload?.deploymentChangeId ?? 'missing'}`);
if (expectedCommit && payload?.deploymentCommit !== expectedCommit) mismatches.push(`deploymentCommit=${payload?.deploymentCommit ?? 'missing'}`);
if (expectedMarker && payload?.deploymentMarker !== expectedMarker) mismatches.push(`deploymentMarker=${payload?.deploymentMarker ?? 'missing'}`);

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
  mode: payload.mode,
  gaLifted: payload.gaLifted,
  acceptingNewAccounts: payload.acceptingNewAccounts,
  deploymentMarker: payload.deploymentMarker,
  deploymentAppId: payload.deploymentAppId,
  deploymentChangeId: payload.deploymentChangeId,
  deploymentCommit: payload.deploymentCommit,
  accountCount: payload.accountCount,
  remainingAccounts: payload.remainingAccounts,
  configuration: payload.configuration,
}, null, 2));
