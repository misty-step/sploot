import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = join(process.cwd(), 'scripts/verify-release.mjs');
const OBSERVED_AT = new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
const EXPIRES_AT = new Date(Date.now() + 4 * 60_000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
const HEALTH_TIMESTAMP = new Date(Date.now() - 30_000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
const TOKEN = 'bearer-test-value-that-must-not-leak';
const targetArgs = [
  '--transaction-id', 'estate-tx-123',
  '--target-commit', '9c2ff5c9',
  '--target-deployment-id', 'deployment-123',
  '--target-change-id', 'change-123',
  '--target-marker', 'marker-123',
  '--observed-at', OBSERVED_AT,
  '--expires-at', EXPIRES_AT,
];

let tempRoot;
let servers = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  servers = [];
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = undefined;
});

function fixture({ enrollmentMode = 'closed', enrollmentStatus = 'paused', readinessTimestamp = HEALTH_TIMESTAMP, redirect = false, safety = true } = {}) {
  return (request, response) => {
    if (redirect && request.url === '/api/health/live') {
      response.writeHead(302, { location: '/api/health/live' });
      response.end();
      return;
    }
    if (request.url === '/api/health/live') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ status: 'alive', service: 'sploot-web' }));
      return;
    }
    if (request.url === '/api/health') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        status: 'ok',
        timestamp: readinessTimestamp,
        dependencies: { database: 'up', embedding_limiter: 'up', share_slug_cache: 'local' },
        diagnostics: {
          prisma_connection_test: true,
          embedding_limiter_schema: true,
          database_url_configured: true,
          connection_latency_ms: 2,
          env_vars: { DATABASE_URL: 'configured' },
          canary_configured: false,
        },
        version: '0.1.0',
      }));
      return;
    }
    if (request.url === '/api/health/enrollment') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ configuration: 'valid', mode: enrollmentMode, status: enrollmentStatus }));
      return;
    }
    if (request.url === '/api/embeddings/text' && request.method === 'POST') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        assert.equal(request.headers.authorization, 'Bearer ' + TOKEN);
        assert.deepEqual(JSON.parse(body), { query: 'release-verification-rollback-safety' });
        response.setHeader('content-type', 'application/json');
        response.statusCode = safety ? 503 : 401;
        response.end(JSON.stringify(safety ? {
          error: 'Embedding generation is temporarily paused',
          code: 'embeddings_disabled',
          retryable: true,
          action: { type: 'try_later', label: 'Try again later' },
        } : { error: 'Unauthorized' }));
      });
      return;
    }
    response.statusCode = 404;
    response.end('{}');
  };
}

async function startServer(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port;
}

async function keyFile() {
  tempRoot = await mkdtemp(join(tmpdir(), 'sploot-release-verifier-'));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const file = join(tempRoot, 'signing-key.pem');
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  await writeFile(file, privatePem);
  return { file, publicKey, privatePem };
}

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
}


function assertSignedFailure(result, publicKey) {
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.evidence.ok, false);
  assert.equal(verify(null, Buffer.from(canonicalize(packet.evidence)), publicKey, Buffer.from(packet.signature, 'base64url')), true);
  return packet;
}

async function successfulArgs(mode, origin, file) {
  return [...targetArgs, '--mode', mode, '--base-url', origin, '--signing-key-file', file, '--test-mode'];
}

describe('verify-release.mjs', () => {

  it('accepts pnpm argument separator before CLI flags', async () => {
    const result = await run(['--', '--help']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /usage: pnpm release:verify/);
  });

  it('emits deterministic closed forward evidence and a verifiable detached Ed25519 signature', async () => {
    const { file, publicKey, privatePem } = await keyFile();
    const origin = await startServer(fixture());
    const args = await successfulArgs('forward', origin, file);
    const first = await run(args);
    const second = await run(args);
    assert.equal(first.code, 0, first.stderr);
    assert.equal(second.code, 0, second.stderr);
    assert.equal(first.stdout, second.stdout);
    assert.equal(first.stdout.includes(privatePem), false);
    assert.equal(first.stderr.includes('BEGIN PRIVATE KEY'), false);
    const envelope = JSON.parse(first.stdout);
    assert.equal(envelope.schema, 'sploot.release-verification.v1');
    assert.deepEqual(envelope.evidence.requested, {
      target_commit: '9c2ff5c9',
      target_deployment_id: 'deployment-123',
      target_change_id: 'change-123',
      target_marker: 'marker-123',
      base_url: origin,
    });
    assert.equal(envelope.evidence.runtime.liveness.http_status, 200);
    assert.equal(envelope.evidence.safety, null);
    const canonical = canonicalize(envelope.evidence);
    assert.equal(verify(null, Buffer.from(canonical), publicKey, Buffer.from(envelope.signature, 'base64url')), true);
    assert.match(envelope.public_key, /^[A-Za-z0-9_-]{43}$/);
    assert.match(envelope.evidence.verifier_identity, /^ed25519:[a-f0-9]{64}$/);
  });

  it('proves rollback safety with the environment-only bearer and redacts it', async () => {
    const { file } = await keyFile();
    const origin = await startServer(fixture());
    const result = await run(await successfulArgs('rollback_safety', origin, file), { SPLOOT_RELEASE_VERIFIER_BEARER_TOKEN: TOKEN });
    assert.equal(result.code, 0, result.stderr);
    const envelope = JSON.parse(result.stdout);
    assert.deepEqual(envelope.evidence.safety, { route: '/api/embeddings/text', http_status: 503, code: 'embeddings_disabled', retryable: true });
    assert.equal(result.stdout.includes(TOKEN), false);
    assert.equal(result.stderr.includes(TOKEN), false);
  });

  it('fails closed for stale, wrong-target, redirects, and auth responses without leaking secrets', async () => {
    const cases = [
      { name: 'stale readiness', handler: fixture({ readinessTimestamp: new Date(Date.now() - 10 * 60_000).toISOString() }), mode: 'forward' },
      { name: 'wrong enrollment target', handler: fixture({ enrollmentMode: 'capped', enrollmentStatus: 'paused' }), mode: 'forward' },
      { name: 'redirect', handler: fixture({ redirect: true }), mode: 'forward' },
      { name: 'auth failure', handler: fixture({ safety: false }), mode: 'rollback_safety' },
    ];
    for (const item of cases) {
      const { file, publicKey } = await keyFile();
      const origin = await startServer(item.handler);
      const result = await run(await successfulArgs(item.mode, origin, file), { SPLOOT_RELEASE_VERIFIER_BEARER_TOKEN: TOKEN });
      assert.notEqual(result.code, 0, item.name);
      const packet = assertSignedFailure(result, publicKey);
      assert.equal(packet.evidence.ok, false, item.name);
      assert.equal(result.stderr.includes(TOKEN), false, item.name);
      await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
      servers = [];
    }
  });


  it('rejects expired and materially future evidence windows', async () => {
    const { file } = await keyFile();
    const origin = await startServer(fixture());
    const expired = await run(await successfulArgs('forward', origin, file).then((args) => args.map((value, index) => index === args.indexOf('--expires-at') + 1 ? new Date(Date.now() - 1_000).toISOString().replace(/\.\d{3}Z$/, '.000Z') : value)));
    assert.notEqual(expired.code, 0);
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    servers = [];
    const futureOrigin = await startServer(fixture());
    const futureArgs = await successfulArgs('forward', futureOrigin, file);
    const observedIndex = futureArgs.indexOf('--observed-at');
    futureArgs[observedIndex + 1] = new Date(Date.now() + 10 * 60_000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
    const future = await run(futureArgs);
    assert.notEqual(future.code, 0);
  });


  it('fails closed for malformed and chunked oversized responses', async () => {
    for (const body of ['{', JSON.stringify({ status: 'alive', service: 'sploot-web', padding: 'x'.repeat(70 * 1024) })]) {
      const { file, publicKey } = await keyFile();
      const origin = await startServer((request, response) => {
        response.setHeader('content-type', 'application/json');
        if (body.length > 1000) {
          response.write(body.slice(0, 1024));
          setTimeout(() => response.end(body.slice(1024)), 1);
        } else {
          response.end(body);
        }
      });
      const result = await run(await successfulArgs('forward', origin, file));
      assert.notEqual(result.code, 0);
      const packet = assertSignedFailure(result, publicKey);
      assert.equal(result.stderr.includes('BEGIN PRIVATE KEY'), false);
      await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
      servers = [];
    }
  });

  it('rejects malformed unknown payloads and has no provider mutation path', async () => {
    const { file, publicKey } = await keyFile();
    const origin = await startServer((request, response) => {
      if (request.url === '/api/health/live') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ status: 'alive', service: 'sploot-web', unknown: true }));
        return;
      }
      response.statusCode = 500;
      response.end('not-json');
    });
    const result = await run(await successfulArgs('forward', origin, file));
    assert.notEqual(result.code, 0);
    const packet = assertSignedFailure(result, publicKey);
    const source = await readFile(SCRIPT, 'utf8');
    assert.equal(source.includes('doctl'), false);
    assert.equal(source.includes('mutation'), false);
  });
});
