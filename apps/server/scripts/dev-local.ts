import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { closeSync, constants, openSync } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, mkdtemp, open, readdir, readFile, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { createServer as createHTTPServer, request } from 'node:http';
import type { Server as HTTPServer } from 'node:http';
import { createServer as createTCPServer } from 'node:net';
import type { Server as TCPServer } from 'node:net';
import { userInfo } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { runDoctor } from './dev-local-doctor.js';

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(SERVER_ROOT, '../..');
const WEB_ROOT = join(REPO_ROOT, 'apps/web');
const GUARDIAN = join(SERVER_ROOT, 'scripts/dev-local-child.mjs');
const IMAGE = 'pgvector/pgvector:pg15';
const HOST = '127.0.0.1';
const FORMAT = 'sploot-go-local-v1';
const SESSION_LABEL = 'app.sploot.local.session';
const OWNER_LABEL = 'app.sploot.local.uid';
const LOG_LIMIT = 128 * 1024;

const HELP = `Isolated, provider-free Go Sploot development

  pnpm --filter server dev:local [--port 3001] [--db-port 0]
  pnpm --filter server dev:local --doctor [--port 3001] [--db-port 0]
  pnpm --filter server dev:local --status --session /tmp/sploot-go-UID-XXXXXX
  pnpm --filter server dev:local --doctor --session /tmp/sploot-go-UID-XXXXXX
  pnpm --filter server dev:local --down --session /tmp/sploot-go-UID-XXXXXX

--port       Exact loopback HTTP port (default 3001; 1..65535).
--db-port    Exact loopback Postgres port, or 0 for Docker allocation (default 0).
--session    Explicit private launch directory; never a global/local-state guess.
--doctor     Boot, verify and tear down, or verify an existing --session.
--status     Read that live launch's status without modifying it.
--down       Stop only that launch and remove its database, media, secrets and logs.
--help       Show this help without provisioning anything.

Requires Linux/macOS, Node 22+, workspace pnpm 10.22.0 dependencies installed,
Go 1.26+, FFmpeg/ffprobe, and Docker Engine 28+ on a local Unix socket. The first
boot may download the pgvector image and Go modules. No package installation,
remote Docker context, .env file, inherited port, database, provider, Clerk,
Stripe or migration authority is accepted. This command cannot enable providers.

Every boot applies the existing web db:migrate command to a new owned Postgres15
database and runs the existing curated qa:seed script in a private working
directory. Its 24 GIF/video/image fixtures and cached "reaction face meme" query
exercise real pgvector, not provider quality. Newly saved media is durable for
this launch, but is not indexed; novel queries fail closed without a provider.
Ctrl-C, SIGTERM, or --down deletes this launch's data. Never store irreplaceable
media here. Production migrations remain the separate Node PRE_DEPLOY job.
`;

type Mode = 'boot' | 'status' | 'doctor' | 'down' | 'help';
type Options = { mode: Mode; port: number; dbPort: number; session?: string };
type Session = {
  format: typeof FORMAT;
  id: string;
  uid: number;
  pid: number;
  directory: string;
  repository: string;
  token: string;
  port: number;
  dbPort: number;
  database: string;
  qaUser: string;
  container: string;
  dockerHost: string;
};
type CommandOptions = { cwd?: string; timeout?: number; cleanup?: boolean; env?: NodeJS.ProcessEnv };
type Completion = { code: number | null; signal: string | null; error: string | null };
type Command = { child: ChildProcess; result: Promise<string> };

function parseArgs(argv: string[]): Options {
  const options: Options = { mode: 'boot', port: 3001, dbPort: 0 };
  let portSelected = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--') continue;
    if (flag === '--help' || flag === '--status' || flag === '--doctor' || flag === '--down') {
      if (options.mode !== 'boot') throw new Error('choose only one of --status, --doctor, --down, --help');
      options.mode = flag.slice(2) as Mode;
    } else if (flag === '--session') {
      if (!argv[i + 1] || options.session) throw new Error('--session requires one explicit launch directory');
      options.session = argv[++i];
    } else if (flag === '--port' || flag === '--db-port') {
      const value = argv[++i];
      const minimum = flag === '--port' ? 1 : 0;
      if (!value || !/^\d+$/.test(value) || Number(value) < minimum || Number(value) > 65535) throw new Error(`${flag} must be ${minimum}..65535`);
      if (flag === '--port') options.port = Number(value);
      else options.dbPort = Number(value);
      portSelected = true;
    } else throw new Error(`unknown option ${flag}; use --help (env files and provider opt-ins are deliberately unsupported)`);
  }
  if (options.mode === 'boot' && options.session) throw new Error('boots always create a new session; --session is only for --status, --doctor or --down');
  const targetsSession = options.mode === 'status' || options.mode === 'down' || options.mode === 'doctor' && options.session !== undefined;
  if (targetsSession && (!options.session || portSelected)) throw new Error('session operations require --session and do not accept port overrides');
  if (options.port === options.dbPort) throw new Error('HTTP and Postgres ports must differ');
  return options;
}

// Allowlist, not object-spread-and-delete: future production variables have no
// authority here. Empty sentinels also prevent Prisma/dotenv from filling known
// provider or privileged DB keys from a checkout .env during migration/seeding.
function childEnvironment(directory: string, dockerHost: string): NodeJS.ProcessEnv {
  const empty = [
    'DATABASE_URL', 'DATABASE_URL_DIRECT', 'DIRECT_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING',
    'STRIPE_LEDGER_BOOTSTRAP_DATABASE_URL', 'STRIPE_LEDGER_MIGRATION_DATABASE_URL', 'STRIPE_LEDGER_ADMIN_DATABASE_URL',
    'STRIPE_LEDGER_ISSUER_DATABASE_URL', 'STRIPE_LEDGER_CONSUMER_DATABASE_URL', 'STRIPE_LEDGER_RECONCILER_DATABASE_URL',
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_PUBLISHABLE_KEY', 'CLERK_AUTHORIZED_PARTIES',
    'REPLICATE_API_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'SENTRY_DSN', 'SENTRY_AUTH_TOKEN', 'NEXT_PUBLIC_SENTRY_DSN',
    'SPLOOT_API_TOKEN', 'SPLOOT_QA_SEED_FORCE', 'SPLOOT_QA_AUTH_SECRET', 'SPLOOT_QA_USER_ID', 'SEARCH_CURSOR_SECRET',
    'NODE_OPTIONS', 'NODE_PATH', 'PGOPTIONS', 'PGSERVICE', 'PGSERVICEFILE', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE',
  ];
  const env: NodeJS.ProcessEnv = Object.fromEntries(empty.map((key) => [key, '']));
  return Object.assign(env, {
    PATH: [dirname(process.execPath), join(WEB_ROOT, 'node_modules/.bin'), join(SERVER_ROOT, 'node_modules/.bin'), process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'].join(':'),
    HOME: join(directory, 'home'), TMPDIR: join(directory, 'tmp'),
    XDG_CONFIG_HOME: join(directory, 'config'), XDG_CACHE_HOME: join(directory, 'cache'),
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', CI: '1', NO_COLOR: '1',
    NODE_ENV: 'development', DOTENV_CONFIG_PATH: '/dev/null', PGPASSFILE: '/dev/null',
    GOENV: 'off', GOTOOLCHAIN: 'local', GOWORK: 'off', GOFLAGS: '-mod=readonly -modcacherw',
    DOCKER_HOST: dockerHost, DOCKER_CONFIG: join(directory, 'docker'),
    SPLOOT_DEPLOYMENT_ENV: 'development', DEPLOYMENT_ENV: 'local-qa', SPLOOT_QA_AUTH_MODE: 'enabled',
    SPLOOT_QA_BIND_HOST: HOST, SPLOOT_UPLOADS_ENABLED: 'true', SPLOOT_EMBEDDINGS_ENABLED: 'false',
    SPLOOT_COST_ADMISSION_HALT: 'true', STRIPE_LEDGER_BOOTSTRAP_REQUIRED: 'false',
  });
}

function redact(text: string, secrets: string[]): string {
  for (const secret of secrets) if (secret.length >= 16) text = text.replaceAll(secret, '[redacted]');
  return text.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://[redacted]');
}

class Processes {
  readonly active = new Set<Command>();
  private sequence = 0;
  constructor(private directory: string, readonly env: NodeJS.ProcessEnv, private signal: AbortSignal, private secrets: string[]) {}

  private async readLog(path: string): Promise<string> {
    const file = await open(path, 'r');
    try {
      const info = await file.stat();
      const buffer = Buffer.alloc(Math.min(info.size, LOG_LIMIT));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, Math.max(0, info.size - buffer.length));
      return redact(buffer.subarray(0, bytesRead).toString(), this.secrets);
    } finally { await file.close(); }
  }

  start(label: string, executable: string, args: string[], options: CommandOptions = {}): Command {
    if (!options.cleanup) this.signal.throwIfAborted();
    const logPath = join(this.directory, 'logs', `${process.pid}-${String(++this.sequence).padStart(3, '0')}-${label.replace(/[^a-zA-Z0-9-]/g, '-')}-${randomBytes(4).toString('hex')}.log`);
    const fd = openSync(logPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    const stdoutPath = `${logPath}.stdout`;
    const stdoutFD = openSync(stdoutPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    let child: ChildProcess;
    try {
      child = spawn(process.execPath, [GUARDIAN, executable, ...args], {
        cwd: options.cwd ?? SERVER_ROOT, env: options.env ?? this.env,
        detached: true, stdio: ['ignore', stdoutFD, fd, 'ipc'],
      });
    } finally { closeSync(fd); closeSync(stdoutFD); }
    const completion = Promise.withResolvers<string>();
    let reported: Completion | undefined;
    let spawnError = '';
    let timedOut = false;
    let escalation: NodeJS.Timeout | undefined;
    const stop = () => {
      child.kill('SIGTERM');
      escalation ??= setTimeout(() => {
        if (child.pid) {
          try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already reaped. */ }
        }
      }, 25_000);
    };
    const timeout = options.timeout ?? 120_000;
    const timer = timeout > 0 ? setTimeout(() => { timedOut = true; stop(); }, timeout) : undefined;
    const command: Command = { child, result: completion.promise };
    this.active.add(command);
    if (!options.cleanup) this.signal.addEventListener('abort', stop, { once: true });
    child.on('message', (message: Completion) => { reported = message; });
    child.once('error', (error: NodeJS.ErrnoException) => { spawnError = error.code ?? 'spawn error'; });
    child.once('close', () => {
      clearTimeout(timer);
      clearTimeout(escalation);
      this.signal.removeEventListener('abort', stop);
      void (async () => {
        const output = await this.readLog(stdoutPath);
        const diagnostic = await this.readLog(logPath);
        if (timedOut || spawnError || !reported || reported.code !== 0 || reported.error) {
          throw new Error(`${label} failed (${timedOut ? 'timeout' : spawnError || reported?.error || reported?.signal || `exit ${reported?.code ?? 'unknown'}`}).\n${`${output}\n${diagnostic}`.slice(-8_000).trim()}`);
        }
        completion.resolve(output.trim());
      })().catch(completion.reject).finally(() => this.active.delete(command));
    });
    // A persistent process may fail while another startup step is awaited.
    void command.result.catch(() => {});
    return command;
  }

  async run(label: string, executable: string, args: string[], options: CommandOptions = {}): Promise<string> {
    return await this.start(label, executable, args, options).result;
  }

  async stopAll(): Promise<void> {
    const commands = [...this.active];
    for (const { child } of commands) child.kill('SIGTERM');
    await Promise.allSettled(commands.map(({ result }) => result));
  }
}

async function reservePort(port: number): Promise<TCPServer> {
  const { promise, resolve: ready, reject } = Promise.withResolvers<TCPServer>();
  const server = createTCPServer((socket) => socket.destroy());
  server.once('error', () => reject(new Error(`${HOST}:${port} is unavailable; refusing to reuse a listener or select another port`)));
  server.listen({ host: HOST, port, exclusive: true }, () => ready(server));
  return await promise;
}

async function closeListener(server?: TCPServer): Promise<void> {
  if (!server?.listening) return;
  const { promise, resolve: closed, reject } = Promise.withResolvers<void>();
  server.close((error) => error ? reject(error) : closed());
  await promise;
}

async function localDockerHost(): Promise<string> {
  const user = userInfo();
  for (const socket of ['/var/run/docker.sock', `/run/user/${user.uid}/docker.sock`, join(user.homedir, '.docker/run/docker.sock')]) {
    try { if ((await lstat(socket)).isSocket()) return `unix://${socket}`; } catch { /* Try the next local installation. */ }
  }
  throw new Error('no local Docker Unix socket found; start Docker Engine/Desktop (remote Docker contexts are never used)');
}

async function removeSessionDirectory(directory: string): Promise<void> {
  // Keep the recovery authority until every fallible child removal succeeds.
  // A partial recursive rm must not destroy the marker needed by --down.
  for (const entry of await readdir(directory)) {
    if (entry !== 'session.json') await rm(join(directory, entry), { recursive: true, force: true });
  }
  await rm(join(directory, 'session.json'), { force: true });
  await rmdir(directory);
}

async function writeSession(session: Session): Promise<void> {
  const temporary = join(session.directory, 'session.next');
  await writeFile(temporary, `${JSON.stringify(session)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temporary, join(session.directory, 'session.json'));
}

async function readSession(path: string): Promise<Session> {
  const directory = resolve(path);
  const uid = userInfo().uid;
  const temporaryRoot = await realpath('/tmp');
  if (dirname(directory) !== temporaryRoot || !new RegExp(`^sploot-go-${uid}-[A-Za-z0-9]{6}$`).test(basename(directory))) throw new Error('not an explicit owned Sploot Go session directory');
  const info = await lstat(directory);
  const stateInfo = await lstat(join(directory, 'session.json'));
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== uid || (info.mode & 0o077) !== 0 || !stateInfo.isFile() || stateInfo.isSymbolicLink() || stateInfo.uid !== uid || (stateInfo.mode & 0o077) !== 0) throw new Error('session directory/marker must be private and owned by the current user');
  const value: unknown = JSON.parse(await readFile(join(directory, 'session.json'), 'utf8'));
  if (!value || typeof value !== 'object') throw new Error('session marker is not an object');
  const field = (name: string): unknown => Reflect.get(value, name);
  const format = field('format'), id = field('id'), token = field('token'), dockerHost = field('dockerHost');
  const pid = field('pid'), port = field('port'), dbPort = field('dbPort');
  const database = field('database'), qaUser = field('qaUser'), container = field('container');
  const repository = await realpath(REPO_ROOT);
  if (format !== FORMAT || field('directory') !== directory || field('uid') !== uid || field('repository') !== repository || typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || container !== `sploot-go-${uid}-${id}` || typeof dockerHost !== 'string' || !/^unix:\/\/\/[^\r\n]+$/.test(dockerHost) || typeof pid !== 'number' || !Number.isInteger(pid) || pid < 1 || typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535 || typeof dbPort !== 'number' || !Number.isInteger(dbPort) || dbPort < 0 || dbPort > 65535 || database !== `sploot_local_${id.replaceAll('-', '')}` || qaUser !== `qa-local-${id}`) throw new Error('session ownership marker is invalid or belongs to another checkout');
  return { format, id, uid, pid, directory, repository, token, port, dbPort, database, qaUser, container, dockerHost };
}

async function removeContainer(session: Session, processes: Processes): Promise<void> {
  let output: string;
  try {
    output = await processes.run('container-ownership', 'docker', ['inspect', '--format', '{"id":{{json .Id}},"labels":{{json .Config.Labels}}}', session.container], { cleanup: true, timeout: 15_000 });
  } catch (error) {
    if (error instanceof Error && /No such (object|container):/i.test(error.message)) return;
    throw error;
  }
  const container: unknown = JSON.parse(output);
  if (!container || typeof container !== 'object' || !('id' in container) || typeof container.id !== 'string' || !/^[a-f0-9]{64}$/.test(container.id) || !('labels' in container) || !container.labels || typeof container.labels !== 'object' || !(SESSION_LABEL in container.labels) || container.labels[SESSION_LABEL] !== session.id || !(OWNER_LABEL in container.labels) || container.labels[OWNER_LABEL] !== String(session.uid)) throw new Error('container ownership labels differ; refusing to remove it');
  await processes.run('remove-owned-container', 'docker', ['rm', '--force', '--volumes', container.id], { cleanup: true, timeout: 30_000 });
}

async function copySeedMedia(directory: string): Promise<number> {
  const source = join(directory, 'seed/public/qa-blob-seed');
  const destination = join(directory, 'media/qa-blob-seed');
  const info = await lstat(source);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('QA seed did not create a confined media directory');
  await mkdir(destination, { mode: 0o700 });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/^[A-Za-z0-9._-]+$/.test(entry.name) || entry.name === '.' || entry.name === '..') throw new Error('QA media contains a non-regular or unconfined entry');
    await copyFile(join(source, entry.name), join(destination, entry.name), constants.COPYFILE_EXCL);
    await chmod(join(destination, entry.name), 0o600);
  }
  if (entries.length < 26) throw new Error('QA seed did not produce all 24 originals and animated posters');
  await rm(join(directory, 'seed'), { recursive: true });
  return entries.length;
}

async function controlRequest(session: Session, mode: Exclude<Mode, 'boot' | 'help'>): Promise<Record<string, unknown>> {
  const { promise, resolve: done, reject } = Promise.withResolvers<Record<string, unknown>>();
  const req = request({ socketPath: join(session.directory, 'control.sock'), path: `/${mode}`, method: mode === 'status' ? 'GET' : 'POST', headers: { Authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(mode === 'doctor' ? 180_000 : 10_000) }, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 64 * 1024) response.destroy(new Error('control response exceeded its limit'));
    });
    response.once('error', reject);
    response.once('end', () => {
      try {
        const result = JSON.parse(body) as Record<string, unknown>;
        if (result.format !== FORMAT || result.id !== session.id) throw new Error('control endpoint belongs to a different launch');
        if (response.statusCode !== 200 && response.statusCode !== 202) throw new Error(String(result.error ?? `control returned HTTP ${response.statusCode}`));
        done(result);
      } catch (error) { reject(error); }
    });
  });
  req.once('error', reject);
  req.end();
  return await promise;
}

async function sessionCommand(options: Options): Promise<void> {
  const session = await readSession(options.session!);
  let reply: Record<string, unknown>;
  try { reply = await controlRequest(session, options.mode as 'status' | 'doctor' | 'down'); } catch (error) {
    if (options.mode !== 'down' || !(error instanceof Error) || !('code' in error) || error.code !== 'ECONNREFUSED' && error.code !== 'ENOENT') throw error;
    // Never signal a PID read from disk: PID reuse cannot kill an unrelated app.
    try { process.kill(session.pid, 0); } catch (failure) {
      if (!(failure instanceof Error) || !('code' in failure) || failure.code !== 'ESRCH') throw failure;
      await delay(22_000); // Parent-death guardians finish before any disk removal.
      const reservation = await reservePort(session.port);
      try {
        const processes = new Processes(session.directory, childEnvironment(session.directory, session.dockerHost), new AbortController().signal, [session.token]);
        await removeContainer(session, processes);
        await readSession(session.directory);
        await removeSessionDirectory(session.directory);
      } finally { await closeListener(reservation); }
      console.log('[dev-local] STOPPED orphaned owned session; no other container, process or directory was touched');
      return;
    }
    throw new Error('supervisor PID is still present but its control socket is unavailable; use Ctrl-C in its original terminal (no PID-based kill attempted)');
  }
  if (options.mode === 'down') {
    for (let attempt = 0; attempt < 300; attempt++) {
      try { await lstat(session.directory); } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          console.log('[dev-local] STOPPED owned session, database, media and secrets removed');
          return;
        }
        throw error;
      }
      await delay(200);
    }
    throw new Error(`shutdown was requested but cleanup did not finish; inspect the original terminal and private logs in ${session.directory}`);
  }
  console.log(JSON.stringify(reply, null, 2));
}

async function boot(options: Options): Promise<void> {
  const user = userInfo();
  const temporaryRoot = await realpath('/tmp');
  const repository = await realpath(REPO_ROOT);
  const outside = relative(repository, temporaryRoot);
  if (!outside.startsWith('../') && outside !== '..') throw new Error('private runtime directory must be outside the checkout');
  const directory = await mkdtemp(join(temporaryRoot, `sploot-go-${user.uid}-`));
  await chmod(directory, 0o700);
  const rootInfo = await lstat(directory);
  const id = randomUUID();
  const controller = new AbortController();
  const stopped = Promise.withResolvers<void>();
  const password = randomBytes(32).toString('hex');
  const qaSecret = randomBytes(32).toString('hex');
  const cursorSecret = randomBytes(32).toString('hex');
  const secrets = [password, qaSecret, cursorSecret];
  let phase = 'provisioning';
  let failure: Error | undefined;
  let session: Session | undefined;
  let processes: Processes | undefined;
  let applicationReservation: TCPServer | undefined;
  let databaseReservation: TCPServer | undefined;
  let control: HTTPServer | undefined;
  let containerAttempted = false;
  let doctorBusy = false;
  let verified = false;
  const stop = (reason?: Error) => {
    if (controller.signal.aborted) return;
    failure = reason ?? (options.mode === 'doctor' && !verified ? new Error('finite doctor stopped before completing its checks') : undefined);
    phase = 'stopping';
    controller.abort(reason ?? new Error('local shutdown requested'));
    stopped.resolve();
  };
  const onSignal = () => stop();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, onSignal);

  try {
    for (const name of ['secrets', 'media', 'seed', 'home', 'tmp', 'config', 'cache', 'docker', 'logs', 'bin']) await mkdir(join(directory, name), { mode: 0o700 });
    const dockerHost = await localDockerHost();
    session = { format: FORMAT, id, uid: user.uid, pid: process.pid, directory, repository, token: randomBytes(32).toString('hex'), port: options.port, dbPort: options.dbPort, database: `sploot_local_${id.replaceAll('-', '')}`, qaUser: `qa-local-${id}`, container: `sploot-go-${user.uid}-${id}`, dockerHost };
    secrets.push(session.token);
    await writeSession(session);
    const env = childEnvironment(directory, dockerHost);
    processes = new Processes(directory, env, controller.signal, secrets);
    const baseURL = `http://${HOST}:${options.port}`;
    const revision = `local-${id}`;
    const status = () => ({ format: FORMAT, id, phase, baseURL, databasePort: session!.dbPort, qaUser: session!.qaUser, mediaDirectory: join(directory, 'media'), container: session!.container, providerMode: 'disabled', cachedQuery: 'reaction face meme' });
    const doctor = async () => {
      if (doctorBusy) throw new Error('doctor is already running');
      doctorBusy = true;
      try {
        return await runDoctor({ baseURL, revision, mediaDirectory: join(directory, 'media'), runtimeDirectory: join(directory, 'tmp'), signal: controller.signal, run: (label, command, args) => processes!.run(label, command, args), report: (message) => console.log(`[dev-local] ${message}`) });
      } finally { doctorBusy = false; }
    };
    control = createHTTPServer((req, res) => {
      const supplied = Buffer.from(req.headers.authorization ?? '');
      const expected = Buffer.from(`Bearer ${session!.token}`);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { res.writeHead(403).end(); return; }
      res.setHeader('Content-Type', 'application/json');
      void (async () => {
        if (req.url === '/status' && req.method === 'GET') res.end(JSON.stringify(status()));
        else if (req.url === '/down' && req.method === 'POST') {
          res.writeHead(202).end(JSON.stringify({ ...status(), phase: 'stopping' }));
          setImmediate(() => stop());
        } else if (req.url === '/doctor' && req.method === 'POST' && phase === 'ready') {
          res.end(JSON.stringify({ ...status(), checks: await doctor() }));
        } else res.writeHead(409).end(JSON.stringify({ format: FORMAT, id, error: 'unknown action or launch is not ready' }));
      })().catch((error: Error) => res.writeHead(500).end(JSON.stringify({ format: FORMAT, id, error: redact(error.message, secrets) })));
    });
    const listening = Promise.withResolvers<void>();
    control.once('error', listening.reject);
    control.listen(join(directory, 'control.sock'), listening.resolve);
    await listening.promise;
    await chmod(join(directory, 'control.sock'), 0o600);
    console.log(`[dev-local] SESSION ${directory}\n[dev-local] Isolated ${baseURL}; no inherited database, migration, provider or auth authority`);
    applicationReservation = await reservePort(options.port);
    if (options.dbPort > 0) databaseReservation = await reservePort(options.dbPort);

    const workspacePackage: unknown = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
    if (!workspacePackage || typeof workspacePackage !== 'object' || !('packageManager' in workspacePackage) || typeof workspacePackage.packageManager !== 'string' || !workspacePackage.packageManager.startsWith('pnpm@')) throw new Error('workspace must declare its pinned pnpm package manager');
    const expectedPnpm = workspacePackage.packageManager.slice('pnpm@'.length);
    const pnpmVersion = await processes.run('pnpm-version', 'pnpm', ['--version']);
    if (pnpmVersion !== expectedPnpm) throw new Error(`requires workspace pnpm ${expectedPnpm}; found ${pnpmVersion}`);
    const goVersion = await processes.run('go-version', 'go', ['version']);
    const goMatch = /go version go(\d+)\.(\d+)/.exec(goVersion);
    if (!goMatch || Number(goMatch[1]) < 1 || Number(goMatch[1]) === 1 && Number(goMatch[2]) < 26) throw new Error('Go 1.26+ is required; automatic toolchain downloads are disabled');
    await processes.run('ffmpeg-version', 'ffmpeg', ['-version']);
    await processes.run('ffprobe-version', 'ffprobe', ['-version']);
    const dockerVersion = await processes.run('docker-version', 'docker', ['version', '--format', '{{.Server.Version}}']);
    if (!/^\d+\./.test(dockerVersion) || Number(dockerVersion.split('.')[0]) < 28) throw new Error('Docker Engine 28+ is required for loopback-only published port isolation');
    await processes.run('shared-contract', 'pnpm', ['--filter', 'server', 'check:contracts'], { cwd: REPO_ROOT });

    phase = 'database';
    const dbEnvPath = join(directory, 'secrets/postgres.env');
    await writeFile(dbEnvPath, `POSTGRES_USER=sploot_local\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${session.database}\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n`, { mode: 0o600, flag: 'wx' });
    console.log(`[dev-local] Creating owned ${IMAGE} database (no existing container or volume is reused)`);
    containerAttempted = true;
    await processes.run('create-postgres', 'docker', ['create', '--name', session.container, '--label', `${SESSION_LABEL}=${id}`, '--label', `${OWNER_LABEL}=${user.uid}`, '--publish', `${HOST}:${options.dbPort || ''}:5432`, '--env-file', dbEnvPath, '--mount', 'type=tmpfs,destination=/var/lib/postgresql/data,tmpfs-mode=0700', '--shm-size', '256m', IMAGE]);
    await closeListener(databaseReservation);
    databaseReservation = undefined;
    await processes.run('start-postgres', 'docker', ['start', session.container]);
    const databaseWait = processes.start('postgres-lifetime', 'docker', ['wait', session.container], { timeout: 0 });
    void databaseWait.result.then(() => stop(new Error('owned Postgres container exited')), (error: Error) => stop(error));
    const ports = JSON.parse(await processes.run('postgres-port', 'docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', session.container])) as Record<string, Array<{ HostIp: string; HostPort: string }>>;
    const bindings = ports['5432/tcp'];
    if (bindings?.length !== 1 || bindings[0].HostIp !== HOST || !/^\d+$/.test(bindings[0].HostPort)) throw new Error('Docker did not bind Postgres exclusively to the requested loopback address');
    session.dbPort = Number(bindings[0].HostPort);
    if (options.dbPort && session.dbPort !== options.dbPort) throw new Error('Docker changed the requested Postgres port');
    await writeSession(session);
    let databaseReady = false;
    for (let attempt = 0; attempt < 45; attempt++) {
      try {
        await processes.run('postgres-ready', 'docker', ['exec', session.container, 'pg_isready', '-h', HOST, '-U', 'sploot_local', '-d', session.database], { timeout: 10_000 });
        databaseReady = true;
        break;
      } catch (error) {
        controller.signal.throwIfAborted();
        if (attempt === 44) throw error;
        await delay(500, undefined, { signal: controller.signal });
      }
    }
    if (!databaseReady) throw new Error('owned Postgres did not become ready');
    const databaseURL = `postgresql://sploot_local:${password}@${HOST}:${session.dbPort}/${session.database}?sslmode=disable`;
    const applicationEnv: NodeJS.ProcessEnv = {
      ...env, DATABASE_URL: databaseURL, SPLOOT_LISTEN_ADDR: `${HOST}:${options.port}`, NEXT_PUBLIC_BASE_URL: baseURL,
      SPLOOT_QA_AUTH_SECRET: qaSecret, SPLOOT_QA_USER_ID: session.qaUser, SEARCH_CURSOR_SECRET: cursorSecret,
      SPLOOT_MEDIA_DIRECTORY: join(directory, 'media'), SPLOOT_DEPLOYMENT_COMMIT: revision,
    };
    const envFile = join(directory, 'secrets/server.env');
    await writeFile(envFile, Object.entries(applicationEnv).map(([key, value]) => `${key}=${JSON.stringify(value ?? '')}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
    phase = 'migrating';
    console.log(`[dev-local] Applying named migrations to owned Postgres ${HOST}:${session.dbPort}/${session.database}`);
    await processes.run('named-migrations', 'pnpm', ['db:migrate'], { cwd: WEB_ROOT, env: applicationEnv, timeout: 300_000 });
    phase = 'seeding';
    await processes.run('curated-qa-seed', process.execPath, [join(WEB_ROOT, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', join(WEB_ROOT, 'tsconfig.json'), join(WEB_ROOT, 'scripts/qa-seed.ts'), '--user-id', session.qaUser, '--count', '24'], { cwd: join(directory, 'seed'), env: applicationEnv, timeout: 180_000 });
    const copied = await copySeedMedia(directory);
    console.log(`[dev-local] Seeded 24 curated assets; ${copied} originals/posters copied to ${join(directory, 'media/qa-blob-seed')}`);
    phase = 'building';
    const executable = join(directory, 'bin/sploot');
    await processes.run('build-go-service', 'go', ['build', '-mod=readonly', '-trimpath', '-o', executable, './cmd/sploot'], { timeout: 300_000 });
    phase = 'starting';
    await closeListener(applicationReservation);
    applicationReservation = undefined;
    const service = processes.start('go-service', executable, ['-env-file', envFile], { timeout: 0 });
    void service.result.then(() => stop(new Error('Go service exited unexpectedly')), (error: Error) => stop(error));
    // Readiness is an owned HTTP response, not merely successful process spawn.
    for (let attempt = 0; ; attempt++) {
      controller.signal.throwIfAborted();
      try {
        const ready = Promise.withResolvers<void>();
        const req = request(`${baseURL}/api/health/live`, { agent: false, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2_000)]) }, (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => { body += chunk; if (body.length > 4096) res.destroy(new Error('liveness response is oversized')); });
          res.once('error', ready.reject);
          res.once('end', () => {
            try { if (res.statusCode !== 200 || JSON.parse(body).commit !== revision) throw new Error('liveness is not this launch'); ready.resolve(); } catch (error) { ready.reject(error); }
          });
        });
        req.once('error', ready.reject);
        req.end();
        await ready.promise;
        break;
      } catch (error) {
        if (attempt >= 59) throw error;
        await delay(500, undefined, { signal: controller.signal });
      }
    }
    phase = 'doctor';
    const checks = await doctor();
    await writeFile(join(directory, 'doctor.json'), `${JSON.stringify({ ...status(), checks, verifiedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    phase = 'ready';
    verified = true;
    if (options.mode === 'doctor') {
      console.log(`[dev-local] DOCTOR PASS ${checks.length} real-surface checks; tearing down isolated session`);
      stop();
      return;
    }
    console.log(`[dev-local] READY ${baseURL}/qa-auth/login → /app\n[dev-local] Cached query: reaction face meme. New media is saved locally but not indexed; uncached queries return 503. No provider credentials are loaded.\n[dev-local] Private logs: ${join(directory, 'logs')}\n[dev-local] Ctrl-C removes ONLY this launch's database/media/secrets. Separate terminal: pnpm --filter server dev:local --down --session ${directory}`);
    await stopped.promise;
    if (failure) throw failure;
  } catch (error) {
    if (!controller.signal.aborted || failure) {
      failure ??= error instanceof Error ? error : new Error('local launch failed');
      console.error(`[dev-local] FAILED ${phase}: ${redact(failure.message, secrets)}`);
    }
    stop(failure);
  } finally {
    phase = 'stopping';
    if (!controller.signal.aborted) controller.abort(new Error('local cleanup'));
    let cleanupFailed = false;
    try {
      await processes?.stopAll();
      if (control) { control.closeAllConnections(); await closeListener(control); }
      await closeListener(applicationReservation);
      await closeListener(databaseReservation);
      if (session && processes && containerAttempted) await removeContainer(session, processes);
      const current = await lstat(directory);
      if (current.dev !== rootInfo.dev || current.ino !== rootInfo.ino || current.isSymbolicLink()) throw new Error('runtime directory identity changed; refusing deletion');
      await removeSessionDirectory(directory);
      console.log('[dev-local] STOPPED owned process groups, database, media, secrets and logs removed');
    } catch (error) {
      cleanupFailed = true;
      console.error(`[dev-local] CLEANUP FAILED: ${redact(error instanceof Error ? error.message : 'unknown failure', secrets)}\n[dev-local] State retained at ${directory}; retry --down --session ${directory}. No global cleanup was attempted.`);
    }
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.off(signal, onSignal);
    if (failure || cleanupFailed) process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === 'help') { console.log(HELP); return; }
  if (process.platform !== 'linux' && process.platform !== 'darwin') throw new Error('local process-group supervision requires Linux or macOS');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22+ is required');
  process.umask(0o077);
  if (options.mode === 'boot' || options.mode === 'doctor' && !options.session) await boot(options);
  else await sessionCommand(options);
}

main().catch((error: Error) => {
  console.error(`[dev-local] FAILED: ${error.message}`);
  process.exitCode = 1;
});
