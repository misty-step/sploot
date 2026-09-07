#!/usr/bin/env node

import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const SCHEMA = 'sploot.release-verification.v1';
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_KEY_BYTES = 1024 * 1024;
const MAX_HTTP_TIMEOUT_MS = 30_000;
const MAX_HEALTH_AGE_MS = 5 * 60 * 1000;
const MAX_EVIDENCE_WINDOW_MS = 5 * 60 * 1000;
const EMBEDDINGS_PATH = '/api/embeddings/text';

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const values = new Map();
  const flags = new Set();
  const aliases = new Map([
    ['--transaction-id', 'transaction_id'],
    ['--estate-transaction-id', 'transaction_id'],
    ['--estate-transaction', 'transaction_id'],
    ['--mode', 'mode'],
    ['--target-commit', 'target_commit'],
    ['--target-deployment', 'target_deployment_id'],
    ['--target-deployment-id', 'target_deployment_id'],
    ['--target-change', 'target_change_id'],
    ['--target-change-id', 'target_change_id'],
    ['--target-marker', 'target_marker'],
    ['--base-url', 'base_url'],
    ['--observed-at', 'observed_at'],
    ['--expires-at', 'expires_at'],
    ['--expiry', 'expires_at'],
    ['--signing-key', 'signing_key_file'],
    ['--signing-key-file', 'signing_key_file'],
    ['--timeout-ms', 'timeout_ms'],
    ['--checks', 'checks'],
    ['--required-checks', 'checks'],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === '--') {
      continue;
    }
    if (raw === '--help' || raw === '-h') {
      return { help: true };
    }
    if (raw === '--test-mode' || raw === '--allow-insecure-test-http') {
      flags.add('test_mode');
      continue;
    }
    if (raw === '--bearer-token' || raw === '--token') {
      fail('bearer token must be provided only by SPLOOT_RELEASE_VERIFIER_BEARER_TOKEN');
    }
    const key = aliases.get(raw);
    if (!key) fail('unknown argument');
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('argument value is missing');
    if (values.has(key)) fail('duplicate argument');
    values.set(key, value);
    index += 1;
  }

  return { values, flags };
}

function usage() {
  return [
    'usage: pnpm release:verify -- --transaction-id <id> --mode <forward|rollback_safety>',
    '  --target-commit <sha> --target-deployment-id <id> --target-change-id <id>',
    '  --target-marker <marker> --base-url <https://...> --observed-at <iso> --expires-at <iso>',
    '  --signing-key-file <path> [--checks liveness,health,enrollment] [--test-mode] [--timeout-ms <1..30000>]',
  ].join('\n');
}

function required(values, key) {
  const value = values.get(key);
  if (!value) fail('required argument missing');
  if (value.length > 512) fail('argument is too long');
  return value;
}

function optional(values, key) {
  const value = values.get(key);
  if (value !== undefined && value.length > 512) fail('argument is too long');
  return value;
}

function iso(value, label) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail(label + ' must be an ISO-8601 UTC timestamp');
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail(label + ' is invalid');
  return { value, time };
}

function text(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) fail(label + ' is invalid');
  return value;
}

function baseUrl(value, testMode) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('base URL is invalid');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') fail('base URL must be an origin');
  if (parsed.protocol !== 'https:' && !(testMode && parsed.protocol === 'http:')) fail('base URL must use HTTPS');
  if (testMode && parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) fail('test-mode HTTP must target loopback');
  return parsed.origin;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' is malformed');
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(label + ' contains unknown fields');
}

function exactObject(value, expected, label) {
  exactKeys(value, Object.keys(expected), label);
  for (const [key, predicate] of Object.entries(expected)) {
    if (!predicate(value[key])) fail(label + ' is malformed');
  }
}

function isString(value) {
  return typeof value === 'string';
}
function isBoolean(value) {
  return typeof value === 'boolean';
}
function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateLiveness(body) {
  exactObject(body, { service: isString, status: isString }, 'liveness response');
  if (body.status !== 'alive' || body.service !== 'sploot-web') fail('liveness response is not healthy');
  return { http_status: 200, status: body.status, service: body.service };
}

function validateReadiness(body, observedTime, expiresTime, now) {
  exactKeys(body, ['status', 'timestamp', 'dependencies', 'diagnostics', 'version'], 'readiness response');
  if (body.status !== 'ok' || !isString(body.timestamp) || !isString(body.version)) fail('readiness response is malformed');
  const timestamp = iso(body.timestamp, 'readiness timestamp');
  if (timestamp.time < now - MAX_HEALTH_AGE_MS || timestamp.time > now + 30_000 || timestamp.time > expiresTime || timestamp.time < observedTime - MAX_HEALTH_AGE_MS) fail('readiness response is stale');
  exactObject(body.dependencies, { database: isString, embedding_limiter: isString, share_slug_cache: isString }, 'readiness dependencies');
  if (body.dependencies.database !== 'up' || body.dependencies.embedding_limiter !== 'up' || body.dependencies.share_slug_cache !== 'local') fail('readiness dependencies are unhealthy');
  exactKeys(body.diagnostics, ['canary_configured', 'database_url_configured', 'env_vars', 'prisma_connection_test', 'embedding_limiter_schema', 'connection_latency_ms'], 'readiness diagnostics');
  if (!isBoolean(body.diagnostics.canary_configured) || body.diagnostics.database_url_configured !== true || body.diagnostics.prisma_connection_test !== true || body.diagnostics.embedding_limiter_schema !== true || !isNumber(body.diagnostics.connection_latency_ms)) fail('readiness diagnostics are malformed');
  exactObject(body.diagnostics.env_vars, { DATABASE_URL: isString }, 'readiness environment diagnostics');
  if (body.diagnostics.env_vars.DATABASE_URL !== 'configured') fail('readiness environment is not configured');
  return { http_status: 200, status: body.status, timestamp: body.timestamp, version: body.version, dependencies: body.dependencies };
}

function validateEnrollment(body, expectedMode) {
  exactObject(body, { configuration: isString, mode: isString, status: isString }, 'enrollment response');
  if (body.configuration !== 'valid' || body.mode !== expectedMode || body.status !== (expectedMode === 'ga' ? 'open' : 'paused')) fail('enrollment response does not match requested mode');
  return { http_status: 200, configuration: body.configuration, mode: body.mode, status: body.status };
}

function validateSafety(body) {
  exactKeys(body, ['action', 'code', 'error', 'retryable'], 'embedding response');
  if (body.code !== 'embeddings_disabled' || body.error !== 'Embedding generation is temporarily paused' || body.retryable !== true) fail('embedding response is not the typed disabled contract');
  exactObject(body.action, { label: isString, type: isString }, 'embedding action');
  if (body.action.type !== 'try_later' || body.action.label !== 'Try again later') fail('embedding response action is malformed');
  return { route: EMBEDDINGS_PATH, http_status: 503, code: body.code, retryable: body.retryable };
}

async function fetchJson(base, endpoint, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(base + endpoint, { ...init, redirect: 'manual', signal: controller.signal });
    if (response.status >= 300 && response.status < 400) fail('redirect refused');
    const declaredLength = response.headers.get('content-length');
    if (declaredLength && Number(declaredLength) > MAX_RESPONSE_BYTES) fail('response is oversized');
    const reader = response.body?.getReader();
    if (!reader) fail('response body is missing');
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > MAX_RESPONSE_BYTES - totalBytes) {
        await reader.cancel();
        fail('response is oversized');
      }
      chunks.push(value);
      totalBytes += value.byteLength;
    }
    const bodyText = Buffer.concat(chunks, totalBytes).toString('utf8');
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      fail('response is not valid JSON');
    }
    return { response, body };
  } catch (error) {
    if (error?.name === 'AbortError') fail('request timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


async function collectProbe(name, run, failures) {
  try {
    return { ok: true, value: await run() };
  } catch {
    failures.push(name);
    return { ok: false, value: { ok: false, error: 'probe_failed' } };
  }
}

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('evidence contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
  }
  fail('evidence contains an unsupported value');
}


async function readSigningKey(file) {
  let bytes;
  try {
    bytes = await readFile(file);
  } catch {
    fail('signing key file is unavailable');
  }
  if (bytes.length > MAX_KEY_BYTES) fail('signing key file is oversized');
  let key;
  try {
    key = createPrivateKey(bytes);
  } catch {
    fail('signing key is invalid');
  }
  if (key.asymmetricKeyType !== 'ed25519') fail('signing key must be Ed25519');
  return key;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(usage());
    return;
  }
  const { values, flags } = parsed;
  const testMode = flags.has('test_mode') || process.env.SPLOOT_RELEASE_VERIFIER_TEST_MODE === '1';
  const mode = required(values, 'mode');
  if (mode !== 'forward' && mode !== 'rollback_safety') fail('mode is invalid');
  const transactionId = text(required(values, 'transaction_id'), 'transaction id');
  const targetCommit = text(required(values, 'target_commit'), 'target commit');
  const targetDeploymentId = text(required(values, 'target_deployment_id'), 'target deployment id');
  const targetChangeId = text(required(values, 'target_change_id'), 'target change id');
  const targetMarker = text(required(values, 'target_marker'), 'target marker');
  const origin = baseUrl(required(values, 'base_url'), testMode);
  const observed = iso(required(values, 'observed_at'), 'observed_at');
  const expires = iso(required(values, 'expires_at'), 'expires_at');
  if (expires.time <= observed.time) fail('expires_at must be after observed_at');
  if (expires.time - observed.time > MAX_EVIDENCE_WINDOW_MS) fail('evidence window is too long');
  const now = Date.now();
  if (expires.time <= now) fail('expires_at is stale');
  if (observed.time > now + MAX_HEALTH_AGE_MS) fail('observed_at is in the future');
  if (now - observed.time > MAX_HEALTH_AGE_MS) fail('observed_at is stale');
  const keyFile = required(values, 'signing_key_file');
  const checkValue = optional(values, 'checks');
  const checkNames = checkValue === undefined ? ['liveness', 'health', 'enrollment', ...(mode === 'rollback_safety' ? ['rollback_safety'] : [])] : checkValue.split(',').map((name) => name.trim()).filter(Boolean);
  if (checkNames.length === 0 || new Set(checkNames).size !== checkNames.length || checkNames.some((name) => !['liveness', 'health', 'enrollment', 'rollback_safety'].includes(name))) fail('checks are invalid');
  if (!checkNames.includes('liveness') || !checkNames.includes('health') || !checkNames.includes('enrollment')) fail('checks omit a required public probe');
  if (mode === 'rollback_safety' && !checkNames.includes('rollback_safety')) fail('checks omit rollback safety');
  if (mode === 'forward' && checkNames.includes('rollback_safety')) fail('rollback safety check requires rollback_safety mode');
  const timeoutValue = optional(values, 'timeout_ms');
  const timeoutMs = timeoutValue === undefined ? 10_000 : Number(timeoutValue);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_HTTP_TIMEOUT_MS) fail('timeout is invalid');

  let bearer;
  if (mode === 'rollback_safety') {
    bearer = process.env.SPLOOT_RELEASE_VERIFIER_BEARER_TOKEN;
    if (!bearer) fail('rollback safety requires SPLOOT_RELEASE_VERIFIER_BEARER_TOKEN');
    if (bearer.length > 8192) fail('rollback safety bearer token is invalid');
  }

  const privateKey = await readSigningKey(keyFile);
  const publicKey = createPublicKey(privateKey);
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const rawPublicKey = spki.subarray(-32);
  const verifierIdentity = 'ed25519:' + createHash('sha256').update(rawPublicKey).digest('hex');
  const failures = [];

  const livenessProbe = await collectProbe('liveness', async () => {
    const result = await fetchJson(origin, '/api/health/live', { headers: { accept: 'application/json' } }, timeoutMs);
    if (result.response.status !== 200) fail('liveness probe failed');
    return validateLiveness(result.body);
  }, failures);
  const healthProbe = await collectProbe('health', async () => {
    const result = await fetchJson(origin, '/api/health', { headers: { accept: 'application/json' } }, timeoutMs);
    if (result.response.status !== 200) fail('readiness probe failed');
    return validateReadiness(result.body, observed.time, expires.time, Date.now());
  }, failures);
  const enrollmentProbe = await collectProbe('enrollment', async () => {
    const result = await fetchJson(origin, '/api/health/enrollment', { headers: { accept: 'application/json' } }, timeoutMs);
    if (result.response.status !== 200) fail('enrollment probe failed');
    return validateEnrollment(result.body, 'closed');
  }, failures);

  let safetyProbe = { ok: true, value: null };
  if (mode === 'rollback_safety') {
    safetyProbe = await collectProbe('rollback_safety', async () => {
      const result = await fetchJson(origin, EMBEDDINGS_PATH, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', authorization: 'Bearer ' + bearer },
        body: JSON.stringify({ query: 'release-verification-rollback-safety' }),
      }, timeoutMs);
      if (result.response.status === 401 || result.response.status === 403) fail('rollback safety authentication failed');
      if (result.response.status !== 503) fail('rollback safety returned an unexpected status');
      return validateSafety(result.body);
    }, failures);
  }

  const completedAt = Date.now();
  if (expires.time <= completedAt || completedAt - observed.time > MAX_HEALTH_AGE_MS) fail('evidence window expired during probes');
  const checks = Object.fromEntries(checkNames.map((name) => [name, !failures.includes(name)]));
  const evidence = {
    schema: SCHEMA,
    verifier_identity: verifierIdentity,
    ok: failures.length === 0,
    transaction_id: transactionId,
    mode,
    requested: {
      target_commit: targetCommit,
      target_deployment_id: targetDeploymentId,
      target_change_id: targetChangeId,
      target_marker: targetMarker,
      base_url: origin,
    },
    observed_at: observed.value,
    expires_at: expires.value,
    checks,
    runtime: {
      liveness: livenessProbe.value,
      readiness: healthProbe.value,
      enrollment: enrollmentProbe.value,
    },
    safety: mode === 'rollback_safety' ? (safetyProbe.ok ? safetyProbe.value : { route: EMBEDDINGS_PATH, ok: false, error: 'probe_failed' }) : null,
    redaction: 'provider secrets, bearer credentials, and signing private bytes omitted',
  };
  exactKeys(evidence, ['checks', 'expires_at', 'mode', 'observed_at', 'ok', 'redaction', 'requested', 'runtime', 'safety', 'schema', 'transaction_id', 'verifier_identity'], 'evidence');
  const canonicalBytes = Buffer.from(canonicalize(evidence), 'utf8');
  const signature = sign(null, canonicalBytes, privateKey).toString('base64url');
  const output = {
    schema: SCHEMA,
    evidence,
    signature,
    public_key: rawPublicKey.toString('base64url'),
  };
  exactKeys(output, ['evidence', 'public_key', 'schema', 'signature'], 'signed envelope');
  process.stdout.write(JSON.stringify(output) + '\n');
  if (failures.length > 0) {
    console.error('release verifier failed: one or more probes failed');
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error('release verifier failed: ' + (error instanceof Error ? error.message : 'unexpected failure'));
  process.exitCode = 1;
}
