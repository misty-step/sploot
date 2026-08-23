/**
 * Push-button local boot: one command from clone to a browsable, searchable,
 * seeded pile — no Clerk/Neon/Blob/Replicate credentials required.
 *
 * Composes the existing harness pieces (docker pgvector Postgres, prisma
 * migrations, qa:seed fixtures, qa-local auth from docs/AUTH.md) and ends
 * with a doctor pass that emits evidence, not just a green exit code.
 *
 * Usage (repo root):
 *   pnpm dev:local              # provision + migrate + seed + serve + doctor
 *   pnpm dev:local:down         # remove the local database + generated files
 *
 * Flags / env:
 *   --down                      teardown (same as dev:local:down)
 *   --port <n>                  dev server port        (default 3001, or PORT)
 *   --db-port <n>               host Postgres port     (default 5432, or SPLOOT_LOCAL_PG_PORT)
 *   --no-doctor                 skip the verify pass
 *
 * The doctor writes an evidence packet to .sploot-local/doctor/<timestamp>/
 * (gitignored): health probe, signed-in /app fetch, seeded-assets readback,
 * cached-query search response, and — when the agent-browser CLI is on PATH —
 * a rendered-grid screenshot.
 *
 * Requires: docker (for the pgvector Postgres). Everything else is pnpm.
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createQaLocalAuthToken, QA_LOCAL_AUDIENCE, QA_LOCAL_DEPLOYMENT_ENV, QA_LOCAL_DEPLOYMENT_ID } from '../lib/auth/qa-local';

const execFileAsync = promisify(execFile);

const CONTAINER = 'sploot-local-pg';
const IMAGE = 'pgvector/pgvector:pg16';
const QA_USER_ID = 'qa-design-user';
const SEARCH_PROBE_QUERY = 'reaction face meme'; // a PILE_ANCHORS query: qa:seed caches its embedding
const MIN_SEEDED_ASSETS = 20;
// One owner for the bind address: it is simultaneously the `-H` flag, the
// readiness probe host, and the SPLOOT_QA_BIND_HOST marker that
// lib/auth/qa-local.ts refuses local auth without. They must never drift.
const BIND_HOST = '127.0.0.1';
const APP_ROOT = process.cwd();
const LOCAL_STATE_DIR = join(APP_ROOT, '..', '..', '.sploot-local');
// Persisted so a separate process (e.g. `pnpm qa:evidence --base-url`) can
// sign qa-auth tokens that match the secret this server is actually running
// with, instead of guessing a fresh random one that never verifies.
const PERSISTED_SECRET_PATH = join(LOCAL_STATE_DIR, 'qa-auth-secret');

async function resolveAuthSecret(): Promise<string> {
  if (process.env.SPLOOT_QA_AUTH_SECRET) {
    return process.env.SPLOOT_QA_AUTH_SECRET;
  }
  try {
    const persisted = (await readFile(PERSISTED_SECRET_PATH, 'utf8')).trim();
    if (persisted) return persisted;
  } catch {
    // no persisted secret yet — generate one below.
  }
  return randomBytes(24).toString('hex');
}

interface Args {
  down: boolean;
  port: number;
  dbPort: number;
  doctor: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    down: false,
    port: Number(process.env.PORT ?? 3001),
    dbPort: Number(process.env.SPLOOT_LOCAL_PG_PORT ?? 5432),
    doctor: true,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--down': args.down = true; break;
      case '--port': args.port = Number(argv[++i]); break;
      case '--db-port': args.dbPort = Number(argv[++i]); break;
      case '--no-doctor': args.doctor = false; break;
    }
  }
  if (!Number.isInteger(args.port) || !Number.isInteger(args.dbPort)) {
    throw new Error('--port and --db-port must be integers');
  }
  return args;
}

function log(message: string) {
  console.log(`[dev-local] ${message}`);
}

function fail(message: string): never {
  console.error(`[dev-local] FAIL ${message}`);
  process.exit(1);
}

async function docker(...dockerArgs: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('docker', dockerArgs);
}

async function ensureDockerUp() {
  try {
    await docker('info');
  } catch {
    fail('docker is not available. Install/start Docker Desktop (or colima), then re-run `pnpm dev:local`.');
  }
}

async function containerState(): Promise<'running' | 'stopped' | 'absent'> {
  try {
    const { stdout } = await docker('inspect', '--format', '{{.State.Running}}', CONTAINER);
    return stdout.trim() === 'true' ? 'running' : 'stopped';
  } catch {
    return 'absent';
  }
}

async function ensurePostgres(dbPort: number) {
  const state = await containerState();
  if (state === 'absent') {
    log(`provisioning pgvector Postgres (${IMAGE}) as ${CONTAINER} on port ${dbPort}...`);
    try {
      await docker(
        'run', '-d', '--name', CONTAINER,
        '-e', 'POSTGRES_USER=test',
        '-e', 'POSTGRES_PASSWORD=test',
        '-e', 'POSTGRES_DB=sploot_test',
        '-p', `${dbPort}:5432`,
        IMAGE
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('port is already allocated') || message.includes('address already in use')) {
        fail(`port ${dbPort} is taken by another service. Re-run with --db-port <free-port> (DATABASE_URL follows it automatically).`);
      }
      fail(`could not start Postgres container: ${message}`);
    }
  } else if (state === 'stopped') {
    log(`starting existing ${CONTAINER} container...`);
    await docker('start', CONTAINER);
  } else {
    log(`reusing running ${CONTAINER} container.`);
  }

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await docker('exec', CONTAINER, 'pg_isready', '-U', 'test', '-d', 'sploot_test');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  fail(`Postgres in ${CONTAINER} did not become ready within 60s (docker logs ${CONTAINER}).`);
}

function runStep(name: string, command: string, commandArgs: string[], env: NodeJS.ProcessEnv): Promise<void> {
  log(`${name}: ${command} ${commandArgs.join(' ')}`);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, { env, cwd: APP_ROOT, stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${name} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

// A wedged dev server is self-limiting: next's dev proxy gives up on the
// self-rewrite loop after its own timeout and answers 500. Waiting past that
// point is what makes the two cases distinguishable by RESPONSE rather than by
// timing — a slow first compile also holds the socket open (next binds the port
// before it compiles a route), so any "no answer within Ns" heuristic would
// fail healthy boots on a cold cache.
const PROBE_TIMEOUT_MS = 45_000;

// Probes the loopback address the server is actually bound to, not `localhost`.
// The two are not interchangeable here: `next dev -H 127.0.0.1` keeps the
// literal hostname while NextURL normalizes middleware URLs to `localhost`, and
// a mismatch turns any middleware rewrite into a self-proxy loop
// (vercel/next.js#94745) — so a `localhost` probe against a `127.0.0.1` bind is
// itself a client of the bug it is supposed to detect.
async function waitForServer(probeUrl: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = 'no response yet';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(probeUrl, { redirect: 'manual', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      if (response.status < 500) return;
      // It answered, so it is compiled and listening: this is a failing route
      // or middleware, never a compile wait. Name it instead of retrying.
      throw new Error(
        `dev server at ${probeUrl} is up but answered HTTP ${response.status}. This is not a slow compile. ` +
        `Check the dev server output above: repeated "Failed to proxy ... ECONNRESET" means middleware is ` +
        `rewriting to itself (vercel/next.js#94745), which happens when Clerk owns middleware under the ` +
        `-H ${BIND_HOST} bind.`
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('dev server at')) throw error;
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server at ${probeUrl} not ready within ${timeoutMs / 1000}s (last probe: ${lastFailure})`);
}

async function hasAgentBrowser(): Promise<boolean> {
  try {
    await execFileAsync('agent-browser', ['--version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail';
  detail: string;
  evidence?: string;
}

async function runDoctor(baseUrl: string, secret: string): Promise<boolean> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const evidenceDir = join(LOCAL_STATE_DIR, 'doctor', stamp);
  await mkdir(evidenceDir, { recursive: true });
  const checks: DoctorCheck[] = [];

  const token = await createQaLocalAuthToken({
    userId: QA_USER_ID,
    email: `${QA_USER_ID}@sploot.test`,
    secret,
    expiresInSeconds: 15 * 60,
  });
  const authHeaders = { cookie: `sploot_qa_auth=${token}` };

  async function record(name: string, evidenceFile: string | undefined, run: () => Promise<{ pass: boolean; detail: string; body?: string }>) {
    try {
      const result = await run();
      if (evidenceFile && result.body !== undefined) {
        await writeFile(join(evidenceDir, evidenceFile), result.body);
      }
      checks.push({ name, status: result.pass ? 'pass' : 'fail', detail: result.detail, evidence: evidenceFile });
      log(`doctor ${result.pass ? 'PASS' : 'FAIL'} ${name} — ${result.detail}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      checks.push({ name, status: 'fail', detail, evidence: evidenceFile });
      log(`doctor FAIL ${name} — ${detail}`);
    }
  }

  await record('health green', 'health.json', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    return {
      pass: response.status === 200 && body.dependencies?.database === 'up',
      detail: `GET /api/health → ${response.status}, database=${body.dependencies?.database}`,
      body: JSON.stringify(body, null, 2),
    };
  });

  await record('browser sign-in path', 'qa-auth-login.txt', async () => {
    const response = await fetch(`${baseUrl}/api/qa-auth/login`, { redirect: 'manual' });
    const setCookie = response.headers.get('set-cookie') ?? '';
    const pass = response.status === 307 && setCookie.includes('sploot_qa_auth=');
    return {
      pass,
      detail: `GET /api/qa-auth/login → ${response.status}, cookie ${setCookie ? 'set' : 'missing'}, location=${response.headers.get('location')}`,
      body: `status: ${response.status}\nlocation: ${response.headers.get('location')}\nset-cookie: ${setCookie ? 'sploot_qa_auth=<redacted>' : '(none)'}\n`,
    };
  });

  await record('signed-in /app', 'app.txt', async () => {
    const response = await fetch(`${baseUrl}/app`, { headers: authHeaders, redirect: 'manual' });
    const html = await response.text();
    const signedIn = response.status === 200 && !html.includes('/sign-in');
    return {
      pass: signedIn,
      detail: `GET /app with qa cookie → ${response.status} (${signedIn ? 'app shell' : 'sign-in wall'})`,
      body: `status: ${response.status}\nbytes: ${html.length}\nfirst 500 chars:\n${html.slice(0, 500)}\n`,
    };
  });

  await record(`seeded pile ≥ ${MIN_SEEDED_ASSETS} assets`, 'assets.json', async () => {
    const response = await fetch(`${baseUrl}/api/assets?limit=100`, { headers: authHeaders });
    const body = await response.json();
    const count = Array.isArray(body.assets) ? body.assets.length : 0;
    return {
      pass: response.status === 200 && count >= MIN_SEEDED_ASSETS,
      detail: `GET /api/assets → ${response.status}, ${count} assets`,
      body: JSON.stringify({ statusCode: response.status, count, ids: body.assets?.map((a: { id: string }) => a.id) }, null, 2),
    };
  });

  await record('search returns results', 'search.json', async () => {
    const response = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ query: SEARCH_PROBE_QUERY, limit: 10 }),
    });
    const body = await response.json();
    const count = Array.isArray(body.results) ? body.results.length : 0;
    return {
      pass: response.status === 200 && count >= 1,
      detail: `POST /api/search "${SEARCH_PROBE_QUERY}" → ${response.status}, ${count} results`,
      body: JSON.stringify(body, null, 2),
    };
  });

  if (await hasAgentBrowser()) {
    await record('rendered grid screenshot', 'app-grid.png', async () => {
      const browser = (...browserArgs: string[]) =>
        execFileAsync('agent-browser', browserArgs, { timeout: 60_000 });
      await browser('cookies', 'set', 'sploot_qa_auth', token, '--url', baseUrl);
      await browser('open', `${baseUrl}/app`);
      await new Promise((r) => setTimeout(r, 6000));
      await browser('screenshot', join(evidenceDir, 'app-grid.png'));
      return { pass: true, detail: `screenshot of signed-in /app grid` };
    });
  } else {
    log('doctor SKIP rendered-grid screenshot (agent-browser CLI not on PATH; HTTP evidence above still proves the loop)');
  }

  const failed = checks.filter((check) => check.status === 'fail');
  const summary = [
    `# dev:local doctor — ${new Date().toISOString()}`,
    '',
    `Base URL: ${baseUrl}`,
    `Verdict: ${failed.length === 0 ? 'PASS' : `FAIL (${failed.length} of ${checks.length} checks)`}`,
    '',
    '| Check | Status | Detail | Evidence |',
    '|---|---|---|---|',
    ...checks.map((check) => `| ${check.name} | ${check.status.toUpperCase()} | ${check.detail.replace(/\|/g, '\\|')} | ${check.evidence ?? '—'} |`),
    '',
  ].join('\n');
  await writeFile(join(evidenceDir, 'doctor.md'), summary);
  log(`doctor evidence: ${evidenceDir}`);

  return failed.length === 0;
}

async function teardown() {
  const state = await containerState();
  if (state === 'absent') {
    log(`no ${CONTAINER} container to remove.`);
  } else {
    log(`removing ${CONTAINER} container and its database volume...`);
    await docker('rm', '--force', '--volumes', CONTAINER);
  }
  log('removing generated local files (.sploot-local/, public/qa-blob-seed/)...');
  await rm(LOCAL_STATE_DIR, { recursive: true, force: true });
  await rm(join(APP_ROOT, 'public', 'qa-blob-seed'), { recursive: true, force: true });
  log('teardown complete. `git status` should show no dev:local artifacts.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.down) {
    await teardown();
    return;
  }

  await ensureDockerUp();
  await ensurePostgres(args.dbPort);

  const secret = await resolveAuthSecret();
  await mkdir(LOCAL_STATE_DIR, { recursive: true });
  await writeFile(PERSISTED_SECRET_PATH, secret);
  log(`qa-auth secret persisted to ${PERSISTED_SECRET_PATH} (read automatically by \`qa:evidence --base-url\`)`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: `postgresql://test:test@localhost:${args.dbPort}/sploot_test?sslmode=disable`,
    // isQaLocalAuthEnabled() (lib/auth/qa-local-enabled.ts) gates the
    // sign-in page's QA auto-login redirect on SPLOOT_DEPLOYMENT_ENV being
    // 'development' or 'test', not on SPLOOT_QA_DEPLOYMENT_ENV (a distinct
    // marker identifying *which* QA deployment/environment, consumed by
    // qa-client.ts and friends). Without this, `pnpm dev:local` never
    // redirects and the standalone local dev flow has no Clerk keys to
    // fall back to.
    SPLOOT_DEPLOYMENT_ENV: 'development',
    SPLOOT_QA_AUTH_MODE: 'enabled',
    SPLOOT_QA_AUTH_SECRET: secret,
    SPLOOT_QA_DEPLOYMENT_ID: QA_LOCAL_DEPLOYMENT_ID,
    SPLOOT_QA_DEPLOYMENT_ENV: QA_LOCAL_DEPLOYMENT_ENV,
    SPLOOT_QA_AUDIENCE: QA_LOCAL_AUDIENCE,
    SPLOOT_QA_BIND_HOST: BIND_HOST,
    SPLOOT_QA_LOCAL_CAPABILITY: randomBytes(24).toString('hex'),
    NEXT_PUBLIC_SPLOOT_QA_AUTH_MODE: 'enabled',
    NEXT_PUBLIC_SPLOOT_QA_DEPLOYMENT_ID: QA_LOCAL_DEPLOYMENT_ID,
    NEXT_PUBLIC_SPLOOT_QA_DEPLOYMENT_ENV: QA_LOCAL_DEPLOYMENT_ENV,
    NEXT_PUBLIC_SPLOOT_QA_AUDIENCE: QA_LOCAL_AUDIENCE,
    PORT: String(args.port),
  };

  await runStep('migrate', 'pnpm', ['db:migrate'], env);
  await runStep('seed', 'pnpm', ['qa:seed'], env);

  // baseUrl is what the operator types and what the doctor exercises; probeUrl
  // is the address the server is actually bound to. Keep them distinct.
  const baseUrl = `http://localhost:${args.port}`;
  const probeUrl = `http://${BIND_HOST}:${args.port}`;
  log(`starting dev server on ${baseUrl}...`);
  const server: ChildProcess = spawn('pnpm', ['dev', '-H', BIND_HOST], { env, cwd: APP_ROOT, stdio: 'inherit' });
  const serverExit = new Promise<number | null>((resolvePromise) => {
    server.on('close', (code) => resolvePromise(code));
  });

  const stop = () => {
    if (!server.killed) server.kill('SIGINT');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  try {
    await waitForServer(probeUrl);
  } catch (error) {
    stop();
    fail(error instanceof Error ? error.message : String(error));
  }

  let healthy = true;
  if (args.doctor) {
    healthy = await runDoctor(baseUrl, secret);
    if (!healthy) {
      stop();
      await serverExit;
      fail('doctor found failing checks — see the evidence packet above.');
    }
  }

  log('');
  log(`ready. open ${baseUrl}/api/qa-auth/login to land signed-in on /app with the seeded pile.`);
  log(`teardown later with: pnpm dev:local:down`);
  log('Ctrl-C stops the server; the database container keeps running for fast restarts.');

  await serverExit;
}

main().catch((error) => {
  fail(error instanceof Error ? error.stack ?? error.message : String(error));
});
