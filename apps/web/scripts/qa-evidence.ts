/**
 * One-command QA evidence packet.
 *
 * Composes the existing QA harness (qa:seed fixtures + qa-local auth from
 * docs/AUTH.md) with test runs and authenticated agent-browser walks, then
 * writes a structured evidence packet to docs/qa/evidence/<date>-<slug>/:
 * packet.md, screenshots, and full command transcripts.
 *
 * Usage (from apps/web, local pgvector postgres running):
 *   pnpm qa:evidence --slug share-target --intent "share-target saves images"
 *   pnpm qa:evidence --slug grid --routes /app,/ --tests __tests__/lib/qa
 *   pnpm qa:evidence --slug smoke --base-url http://localhost:3001  # reuse server
 *
 * Flags:
 *   --slug <slug>        required; packet directory suffix
 *   --intent <text>      what this run is meant to prove
 *   --routes <csv>       routes to walk (default: /app)
 *   --viewports <csv>    WxH list (default: 1440x900,390x844)
 *   --tests <csv>        vitest paths to run as checks
 *   --gates              also run lint + type-check as checks
 *   --base-url <url>     use an already-running server instead of booting one
 *   --no-seed            skip qa:seed
 *   --risk <text>        residual risk line (repeatable)
 *
 * DATABASE_URL defaults to the local test container
 * (postgresql://test:test@localhost:5432/sploot_test) when unset.
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createQaLocalAuthToken } from '../lib/auth/qa-local';
import {
  renderEvidencePacket,
  packetVerdict,
  type BrowserWalk,
  type EvidenceCheck,
  type EvidencePacketInput,
} from '../lib/qa/evidence-packet';

const execFileAsync = promisify(execFile);

const DEFAULT_DB_URL = 'postgresql://test:test@localhost:5432/sploot_test?sslmode=disable';
const QA_USER_ID = 'qa-design-user';
const REPO_ROOT = resolve(process.cwd(), '..', '..');

interface Args {
  slug: string;
  intent: string;
  routes: string[];
  viewports: string[];
  tests: string[];
  gates: boolean;
  baseUrl?: string;
  seed: boolean;
  risks: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    slug: '',
    intent: '',
    routes: ['/app'],
    viewports: ['1440x900', '390x844'],
    tests: [],
    gates: false,
    seed: true,
    risks: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case '--slug': args.slug = next() ?? ''; break;
      case '--intent': args.intent = next() ?? ''; break;
      case '--routes': args.routes = (next() ?? '').split(',').filter(Boolean); break;
      case '--viewports': args.viewports = (next() ?? '').split(',').filter(Boolean); break;
      case '--tests': args.tests = (next() ?? '').split(',').filter(Boolean); break;
      case '--gates': args.gates = true; break;
      case '--base-url': args.baseUrl = next(); break;
      case '--no-seed': args.seed = false; break;
      case '--risk': { const risk = next(); if (risk) args.risks.push(risk); break; }
    }
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(args.slug)) {
    throw new Error('--slug is required (kebab-case)');
  }
  if (!args.intent) {
    throw new Error('--intent is required: state what this run proves');
  }
  return args;
}

interface RunResult {
  status: 'pass' | 'fail';
  output: string;
  durationMs: number;
}

async function runCommand(command: string, commandArgs: string[], env: NodeJS.ProcessEnv): Promise<RunResult> {
  const started = Date.now();
  return new Promise((resolvePromise) => {
    const child = spawn(command, commandArgs, { env, cwd: process.cwd() });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => {
      resolvePromise({
        status: code === 0 ? 'pass' : 'fail',
        output,
        durationMs: Date.now() - started,
      });
    });
    child.on('error', (error) => {
      resolvePromise({
        status: 'fail',
        output: `${output}\nspawn error: ${error.message}`,
        durationMs: Date.now() - started,
      });
    });
  });
}

async function browser(...browserArgs: string[]): Promise<string> {
  const { stdout } = await execFileAsync('agent-browser', browserArgs, { timeout: 60_000 });
  return stdout.trim();
}

async function waitForServer(baseUrl: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server at ${baseUrl} not ready within ${timeoutMs / 1000}s`);
}

// Wait until at least one image exists and every image visible in the
// viewport has decoded (lazy below-fold images are excluded). An empty
// document.images means the grid is still fetching/compiling — keep waiting.
async function waitForImages(timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const probe = `(() => {
    const imgs = Array.from(document.images).filter(i => i.src);
    if (imgs.length === 0) return 'empty';
    const visible = imgs.filter(i => {
      const r = i.getBoundingClientRect();
      return r.top < innerHeight && r.bottom > 0 && r.width > 0;
    });
    return visible.every(i => i.complete && i.naturalWidth > 0) ? 'ready' : 'loading';
  })()`;
  while (Date.now() < deadline) {
    const result = await browser('eval', probe).catch(() => 'error');
    if (result.includes('ready')) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  // Screenshot proceeds regardless; the packet shows whatever loaded.
}

function errorLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && /\berror\b/i.test(line));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const packetDir = join(REPO_ROOT, 'docs', 'qa', 'evidence', `${date}-${args.slug}`);
  const transcriptsDir = join(packetDir, 'transcripts');
  await mkdir(transcriptsDir, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
    SPLOOT_QA_AUTH_MODE: 'enabled',
    SPLOOT_QA_AUTH_SECRET: process.env.SPLOOT_QA_AUTH_SECRET ?? randomBytes(24).toString('hex'),
    CI: '1',
  };

  const [branch, commit] = await Promise.all([
    execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD']).then((r) => r.stdout.trim()),
    execFileAsync('git', ['rev-parse', '--short', 'HEAD']).then((r) => r.stdout.trim()),
  ]);

  const checks: EvidenceCheck[] = [];
  const walks: BrowserWalk[] = [];
  let server: ChildProcess | undefined;

  async function recordCheck(name: string, displayCommand: string, command: string, commandArgs: string[], transcriptName: string) {
    const result = await runCommand(command, commandArgs, env);
    const transcript = `transcripts/${transcriptName}.txt`;
    await writeFile(join(packetDir, transcript), result.output);
    checks.push({
      name,
      command: displayCommand,
      status: result.status,
      durationMs: result.durationMs,
      transcript,
      ...(result.status === 'fail'
        ? { detail: result.output.split('\n').filter(Boolean).slice(-5).join('\n') }
        : {}),
    });
    console.log(`[qa-evidence] ${result.status.toUpperCase()} ${name} (${(result.durationMs / 1000).toFixed(1)}s)`);
    return result.status;
  }

  try {
    if (args.seed) {
      await recordCheck('qa seed', 'pnpm --filter web qa:seed', 'pnpm', ['qa:seed'], 'qa-seed');
    }

    if (args.gates) {
      await recordCheck('type-check', 'pnpm --filter web type-check', 'pnpm', ['type-check'], 'type-check');
      await recordCheck('lint', 'pnpm --filter web lint', 'pnpm', ['lint'], 'lint');
    }

    for (const [index, testPath] of args.tests.entries()) {
      await recordCheck(
        `tests: ${testPath}`,
        `CI=1 pnpm --filter web vitest run ${testPath}`,
        'pnpm',
        ['vitest', 'run', testPath],
        `tests-${index}`
      );
    }

    let baseUrl = args.baseUrl;
    if (!baseUrl) {
      const port = 3100 + Math.floor(Math.random() * 400);
      baseUrl = `http://localhost:${port}`;
      console.log(`[qa-evidence] booting dev server at ${baseUrl}`);
      server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(port)], {
        env,
        cwd: process.cwd(),
        stdio: 'ignore',
        detached: true,
      });
      await waitForServer(baseUrl);
    }

    const token = await createQaLocalAuthToken({
      userId: QA_USER_ID,
      secret: env.SPLOOT_QA_AUTH_SECRET as string,
      expiresInSeconds: 60 * 60,
    });
    await browser('cookies', 'set', 'sploot_qa_auth', token, '--url', baseUrl);

    for (const viewport of args.viewports) {
      const [width, height] = viewport.split('x');
      await browser('set', 'viewport', width, height);
      for (const route of args.routes) {
        await browser('console', '--clear').catch(() => '');
        await browser('errors', '--clear').catch(() => '');
        await browser('open', `${baseUrl}${route}`);
        await browser('wait', '2500');
        await waitForImages();
        const screenshot = `${route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'root'}-${viewport}.png`;
        await browser('screenshot', join(packetDir, screenshot));
        const [consoleRaw, errorsRaw] = await Promise.all([
          browser('console').catch(() => ''),
          browser('errors').catch(() => ''),
        ]);
        walks.push({
          route,
          viewport,
          screenshot,
          consoleErrors: errorLines(consoleRaw),
          pageErrors: errorsRaw && !/no errors/i.test(errorsRaw) ? errorLines(errorsRaw) : [],
        });
        console.log(`[qa-evidence] walked ${route} @ ${viewport}`);
      }
    }
  } finally {
    await browser('close').catch(() => '');
    if (server?.pid) {
      try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
    }
  }

  const input: EvidencePacketInput = {
    slug: args.slug,
    date,
    branch,
    commit,
    intent: args.intent,
    checks,
    browser: walks,
    residualRisk: args.risks,
  };
  await writeFile(join(packetDir, 'packet.md'), renderEvidencePacket(input));

  const verdict = packetVerdict(input);
  console.log(`[qa-evidence] packet: ${packetDir}/packet.md`);
  console.log(`[qa-evidence] verdict: ${verdict.toUpperCase()}`);
  process.exit(verdict === 'pass' ? 0 : 1);
}

main().catch((error) => {
  console.error(`[qa-evidence] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
