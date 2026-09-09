import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { UPLOAD } from '@sploot/common';
import { unzipSync } from 'fflate';

// This command owns only its freshly created directory and child processes.
// The ordinary persistent library is never seeded, reset, or removed by tests.
const { values: options } = parseArgs({
  options: { keep: { type: 'boolean' }, extension: { type: 'boolean' }, binary: { type: 'string' } },
});
const serverDirectory = fileURLToPath(new URL('../', import.meta.url));
const runtime = await mkdtemp(join(tmpdir(), 'sploot-acceptance-'));
const dataDirectory = join(runtime, 'library');
const binary = options.binary ? resolve(options.binary) : join(runtime, 'sploot');
const keep = options.keep;
const extensionOnly = options.extension;
const results: Array<{ story: string; milliseconds: number }> = [];
const children = new Set<ChildProcess>();
let successful = false;
let browser: Browser | undefined;
let shutdown: Promise<void> | undefined;
function closeRuntime() {
  return shutdown ??= (async () => {
    const closed = await Promise.allSettled([browser?.close(), ...[...children].map(stop)]);
    const failures = closed.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Acceptance runtime teardown failed');
  })();
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
  process.once(signal, () => {
    successful = false;
    void closeRuntime().finally(() => {
      console.error(`Acceptance interrupted; private evidence retained at ${runtime}`);
      process.exit(code);
    });
  });
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: serverDirectory, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.error?.message || result.status}`);
  return result.stdout;
}
async function story(name: string, exercise: () => Promise<void>) {
  const started = performance.now();
  await exercise();
  results.push({ story: name, milliseconds: Math.round(performance.now() - started) });
  console.log(`PASS ${name}`);
}
async function freePort() {
  const listener = createServer();
  const listening = Promise.withResolvers<void>();
  listener.once('error', listening.reject).listen(0, '127.0.0.1', listening.resolve);
  await listening.promise;
  const address = listener.address();
  assert(address && typeof address !== 'string');
  const closing = Promise.withResolvers<void>();
  listener.close(error => error ? closing.reject(error) : closing.resolve());
  await closing.promise;
  return address.port;
}
async function start(directory: string, port: number) {
  const origin = `http://127.0.0.1:${port}`;
  const log = createWriteStream(join(runtime, `server-${port}-${randomUUID()}.log`), { flags: 'wx', mode: 0o600 });
  const child = spawn(binary, ['serve', '--data-dir', directory, '--listen', `127.0.0.1:${port}`, '--base-url', origin], {
    cwd: serverDirectory, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
      SPLOOT_MODEL_DIR: process.env.SPLOOT_MODEL_DIR, SPLOOT_DEPLOYMENT_ENV: 'test',
      SPLOOT_REGISTRATION_OPEN: 'true', SPLOOT_EMBEDDINGS_ENABLED: 'true',
    },
  });
  children.add(child);
  child.stdout!.pipe(log, { end: false });
  child.stderr!.pipe(log, { end: false });
  child.once('close', () => { log.end(); children.delete(child); });
  let ready = false;
  for (let attempt = 0; attempt < 600; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Application exited during startup; inspect ${runtime}`);
    try {
      const response = await fetch(`${origin}/api/health/services`, { signal: AbortSignal.timeout(1000) });
      const body = await response.json() as { status: string; services: { embeddings: { enabled: boolean; type: string } } };
      if (response.ok && body.status === 'ok' && body.services.embeddings.enabled && body.services.embeddings.type === 'local') { ready = true; break; }
    } catch { /* The fresh model bundle may still be preparing. */ }
    await delay(500);
  }
  assert(ready, 'Actual local inference and SQLite must be ready before acceptance');
  return { child, origin };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = Promise.withResolvers<void>();
  child.once('close', () => exited.resolve());
  process.kill(-child.pid!, 'SIGTERM');
  const deadline = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid!, 'SIGKILL');
  }, 30_000);
  await exited.promise;
  clearTimeout(deadline);
  assert.equal(child.exitCode, 0, 'Application must shut down cleanly without deleting its library');
}
function digest(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
async function fixtures() {
  const directory = join(runtime, 'inputs');
  await mkdir(directory, { mode: 0o700 });
  for (const shape of ['triangle', 'circle', 'square']) {
      const color = shape === 'triangle' ? [225, 30, 35] : shape === 'circle' ? [25, 75, 225] : [30, 170, 65];
    const pixels = Buffer.alloc(256 * 256 * 3, 255);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const inside = shape === 'triangle' ? y >= 40 && y <= 215 && Math.abs(x - 128) <= (y - 40) * .52
        : shape === 'circle' ? (x - 128) ** 2 + (y - 128) ** 2 <= 82 ** 2 : x >= 48 && x < 208 && y >= 48 && y < 208;
      if (!inside) continue;
      for (let channel = 0; channel < 3; channel++) pixels[(y * 256 + x) * 3 + channel] = color[channel]!;
    }
    const ppm = join(directory, `${shape}.ppm`);
    await writeFile(ppm, Buffer.concat([Buffer.from('P6\n256 256\n255\n'), pixels]));
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', ppm, '-frames:v', '1', join(directory, `${shape}.png`)]);
  }
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-i', join(directory, 'triangle.png'), '-t', '1', '-vf', 'fps=4,hue=H=2*t', join(directory, 'triangle.gif')]);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-i', join(directory, 'circle.png'), '-t', '1', '-vf', 'fps=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(directory, 'circle.mp4')]);
  return directory;
}

type Actor = { context: BrowserContext; page: Page; id: string; email: string; password: string };
type Asset = { id: string; mime: string; favorite: boolean; tags: Array<{ id: string; name: string }>; shareSlug?: string; checksum: string };
async function api(actor: Actor, origin: string, path: string, method = 'GET', data?: unknown, extra: Record<string, string> = {}) {
  return actor.context.request.fetch(`${origin}${path}`, { method, data, headers: { Origin: origin, 'X-Sploot-User-ID': actor.id, ...extra } });
}
async function createAccount(context: BrowserContext, origin: string, label: string): Promise<Actor> {
  const page = await context.newPage();
  const email = `${label}-${randomUUID()}@example.test`;
  const password = `local-test-${randomUUID()}`;
  await page.goto(`${origin}/sign-up`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:\?|$)/);
  const response = await context.request.get(`${origin}/api/auth/session`);
  assert.equal(response.status(), 200);
  const body = await response.json();
  assert.equal(body.user.email, email);
  return { context, page, id: body.user.id, email, password };
}

try {
if (!options.binary) run('go', ['build', '-o', binary, './cmd/sploot']);
if (extensionOnly) {
  const application = await start(dataDirectory, await freePort());
  await story('Real Chromium device pairing capture search revocation and isolation', async () => {
    const finished = Promise.withResolvers<number | null>();
    const runner = spawn('pnpm', ['--filter', 'extension', 'test:mv3'], {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      env: { ...process.env, SPLOOT_E2E_BASE_URL: application.origin },
      stdio: 'inherit', detached: true,
    });
    children.add(runner);
    runner.once('error', finished.reject);
    runner.once('close', code => { children.delete(runner); finished.resolve(code); });
    assert.equal(await finished.promise, 0, 'Actual-backend MV3 acceptance must pass');
  });
} else {
const inputDirectory = await fixtures();
const localBrowser = await chromium.launch({ headless: true, ...(process.env.SPLOOT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.SPLOOT_CHROMIUM_EXECUTABLE } : {}) });
browser = localBrowser;
const aliceContext = await localBrowser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const bobContext = await localBrowser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
const publicContext = await localBrowser.newContext();
const port = await freePort();
let application = await start(dataDirectory, port);
let alice!: Actor;
let bob!: Actor;
let assets: Asset[] = [];
let triangle!: Asset;
let personalToken = '';
  await story('Browser registration creates persistent isolated accounts without vendor identity', async () => {
    alice = await createAccount(aliceContext, application.origin, 'alice');
    bob = await createAccount(bobContext, application.origin, 'bob');
    assert.notEqual(alice.id, bob.id);
    const duplicate = await publicContext.request.post(`${application.origin}/api/auth/register`, { headers: { Origin: application.origin }, data: { email: alice.email.toUpperCase(), password: alice.password } });
    assert.equal(duplicate.status(), 409);
    const badPassword = await publicContext.request.post(`${application.origin}/api/auth/login`, { headers: { Origin: application.origin }, data: { email: alice.email, password: 'incorrect-password' } });
    assert.equal(badPassword.status(), 401);
    const crossOrigin = await publicContext.request.post(`${application.origin}/api/auth/login`, { headers: { Origin: 'https://untrusted.example' }, data: { email: alice.email, password: alice.password } });
    assert.equal(crossOrigin.status(), 403);
  });
  await story('Browser capture preserves image GIF and video originals and genuine indexing intent', async () => {
    await alice.page.getByRole('button', { name: 'Save', exact: true }).click();
    await alice.page.locator('#upload-files').setInputFiles(['triangle.png', 'circle.png', 'square.png', 'triangle.gif', 'circle.mp4'].map(name => join(inputDirectory, name)));
    await expect.poll(async () => {
      const response = await api(alice, application.origin, '/api/assets?limit=30');
      assets = (await response.json()).assets;
      return assets.length;
    }, { timeout: 60_000 }).toBe(5);
    const triangleHash = digest(await readFile(join(inputDirectory, 'triangle.png')));
    triangle = assets.find(asset => asset.checksum === triangleHash)!;
    assert(triangle, 'Uploaded original must be identifiable by its actual checksum');
    for (const asset of assets) {
      const response = await api(alice, application.origin, `/media/${asset.id}`);
      assert.equal(response.status(), 200);
      assert.equal(digest(await response.body()), asset.checksum);
      await expect.poll(async () => (await (await api(alice, application.origin, `/api/assets/${asset.id}/embedding-status`)).json()).status, { timeout: 90_000 }).toBe('ready');
    }
    await alice.page.getByRole('button', { name: 'Close save panel' }).click();
  });
  await story('New semantic queries use real local text/image vectors and owner filters', async () => {
    const response = await api(alice, application.origin, '/api/search', 'POST', { query: 'a red triangle centered on a white background', threshold: 0, limit: 10 });
    assert.equal(response.status(), 200);
    const results = (await response.json()).results as Asset[];
    assert([triangle.id, assets.find(asset => asset.mime === 'image/gif')!.id].includes(results[0]!.id), 'Local CLIP must rank the matching shape above unrelated shapes');
    assert.equal((await (await api(bob, application.origin, '/api/search', 'POST', { query: 'a red triangle centered on a white background' })).json()).results.length, 0);
    for (const path of [`/api/assets/${triangle.id}`, `/media/${triangle.id}`, `/api/assets/${triangle.id}/embedding-status`]) assert.equal((await api(bob, application.origin, path)).status(), 404);
    assert.equal((await publicContext.request.get(`${application.origin}/media/${triangle.id}`)).status(), 401);
    await alice.page.locator('#search-input').fill('a red triangle centered on a white background');
    await alice.page.locator('#search-input').press('Enter');
    await expect(alice.page).toHaveURL(/\/app\/search\?/);
    await expect(alice.page.locator('.media-card').first()).toBeVisible();
  });
  await story('Browser shuffle and JSON cursors preserve the same private seeded order', async () => {
    const path = '/api/assets?sortBy=shuffle&shuffleSeed=424242&limit=2';
    const visited: string[] = [];
    let cursor = '';
    do {
      const response = await api(alice, application.origin, path + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''));
      assert.equal(response.status(), 200);
      const page = await response.json();
      visited.push(...page.assets.map((asset: Asset) => asset.id));
      assert(visited.length <= assets.length, 'Shuffle pagination must not repeat assets');
      cursor = page.nextCursor ?? '';
      assert.equal(page.hasMore, Boolean(cursor));
    } while (cursor);
    assert.deepEqual(visited.toSorted(), assets.map(asset => asset.id).toSorted());
    const repeated = await api(alice, application.origin, path);
    assert.deepEqual((await repeated.json()).assets.map((asset: Asset) => asset.id), visited.slice(0, 2));
    const foreign = await api(bob, application.origin, path);
    assert.equal(foreign.status(), 200);
    assert.deepEqual((await foreign.json()).assets, []);
    await alice.page.goto(`${application.origin}/app?seed=424242`);
    await expect(alice.page.locator('.media-card')).toHaveCount(assets.length);
    assert.deepEqual(await alice.page.locator('.media-card').evaluateAll(cards => cards.map(card => card.getAttribute('data-asset-id'))), visited);
    await Promise.all([
      alice.page.waitForResponse(response => new URL(response.url()).pathname === '/app'),
      alice.page.getByRole('link', { name: 'Shuffle', exact: true }).click(),
    ]);
    await expect(alice.page).toHaveURL(/\/app\?seed=\d+$/);
    assert.deepEqual((await alice.page.locator('.media-card').evaluateAll(cards => cards.map(card => card.getAttribute('data-asset-id')))).toSorted(), visited.toSorted());
  });
  await story('Duplicate and replay receipts preserve owner scope and original bytes', async () => {
    const bytes = await readFile(join(inputDirectory, 'triangle.png'));
    const key = randomUUID();
    const save = (actor: Actor) => actor.context.request.post(`${application.origin}/api/upload`, { headers: { Origin: application.origin, 'X-Sploot-User-ID': actor.id, 'Idempotency-Key': key }, multipart: { file: { name: 'triangle.png', mimeType: 'image/png', buffer: bytes } } });
    for (let attempt = 0; attempt < 2; attempt++) {
      const duplicate = await save(alice);
      assert.equal(duplicate.status(), 409);
      const receipt = await duplicate.json();
      assert.equal(receipt.isDuplicate, true);
      assert.equal(receipt.asset.id, triangle.id);
    }
    const independent = await save(bob);
    assert.equal(independent.status(), 201);
    assert.notEqual((await independent.json()).asset.id, triangle.id);
    assert.equal((await (await api(alice, application.origin, '/api/assets')).json()).total, 5);
  });
  await story('Favorites tags and filtered search survive browser reload', async () => {
    await alice.page.goto(`${application.origin}/app`);
    const card = alice.page.locator(`[data-asset-id="${triangle.id}"]`);
    await card.locator('[data-action="favorite"]').click();
    await expect(card.locator('[data-action="favorite"]')).toHaveAttribute('aria-pressed', 'true');
    await card.locator('[data-action="details"]').click();
    await alice.page.getByLabel('Add a tag', { exact: true }).fill('geometry');
    await alice.page.getByRole('button', { name: 'Add tag', exact: true }).click();
    await expect(alice.page.locator('#asset-tags')).toContainText('geometry');
    await alice.page.reload();
    const persisted = (await (await api(alice, application.origin, `/api/assets/${triangle.id}`)).json()).asset as Asset;
    assert.equal(persisted.favorite, true);
    assert(persisted.tags.some(tag => tag.name === 'geometry'));
    const filtered = await api(alice, application.origin, '/api/search', 'POST', { query: 'red triangle', favoriteOnly: true, threshold: 0 });
    assert.deepEqual((await filtered.json()).results.map((asset: Asset) => asset.id), [triangle.id]);
  });
  await story('Original sharing downloads bytes without implicitly publishing a link', async () => {
    const gif = assets.find(asset => asset.mime === 'image/gif')!;
    await alice.page.goto(`${application.origin}/app`);
    await alice.page.locator(`[data-asset-id="${gif.id}"] [data-action="share"]`).click();
    await expect(alice.page.locator('#download-media')).toBeVisible();
    const downloading = alice.page.waitForEvent('download');
    await alice.page.locator('#download-media').click();
    const download = await downloading;
    const path = await download.path();
    assert(path);
    assert.equal(digest(await readFile(path)), gif.checksum);
    assert.equal((await (await api(alice, application.origin, `/api/assets/${gif.id}`)).json()).asset.shareSlug ?? null, null);
    await alice.page.getByRole('button', { name: 'Close sharing' }).click();
  });
  await story('Explicit public links revoke immediately and trash restore stays private', async () => {
    const published = await api(alice, application.origin, `/api/assets/${triangle.id}/share`, 'POST');
    const slug = (await published.json()).shareSlug;
    assert.equal((await publicContext.request.get(`${application.origin}/s/${slug}`)).status(), 200);
    assert.equal((await api(bob, application.origin, `/api/assets/${triangle.id}/share`, 'DELETE')).status(), 404);
    assert.equal((await api(alice, application.origin, `/api/assets/${triangle.id}/share`, 'DELETE')).status(), 200);
    assert.equal((await publicContext.request.get(`${application.origin}/s/${slug}`)).status(), 404);
    assert.equal((await api(alice, application.origin, `/api/assets/${triangle.id}`, 'DELETE')).status(), 200);
    assert(!(await (await api(alice, application.origin, '/api/assets')).json()).assets.some((asset: Asset) => asset.id === triangle.id));
    await alice.page.goto(`${application.origin}/app/settings`);
    await expect(alice.page.locator('#trash-list')).toContainText('triangle.png');
    await alice.page.locator('#trash-list').getByRole('button', { name: 'Restore triangle.png', exact: true }).click();
    await expect.poll(async () => (await api(alice, application.origin, `/api/assets/${triangle.id}`)).status()).toBe(200);
    assert.equal((await (await api(alice, application.origin, `/api/assets/${triangle.id}`)).json()).asset.shareSlug ?? null, null);
  });
  await story('Personal tokens are scoped revocable capabilities rather than browser sessions', async () => {
    const minted = await api(alice, application.origin, '/api/upload-tokens', 'POST', { name: 'Gauntlet MCP' });
    assert.equal(minted.status(), 201);
    const token = await minted.json();
    personalToken = token.token;
    const request = (path: string, method = 'GET', data?: unknown) => publicContext.request.fetch(`${application.origin}${path}`, { method, data, headers: { Authorization: `Bearer ${personalToken}` } });
    assert.equal((await request('/api/search', 'POST', { query: 'a blue circle', threshold: 0 })).status(), 200);
    assert.equal((await request('/api/upload-tokens')).status(), 401);
    assert.equal((await request(`/api/assets/${triangle.id}`, 'DELETE')).status(), 401);
    assert.equal((await api(alice, application.origin, `/api/upload-tokens/${token.id}`, 'DELETE')).status(), 200);
    assert.equal((await request('/api/search', 'POST', { query: 'a blue circle' })).status(), 401);
  });
  await story('Device pairing requires browser approval and excludes account administration', async () => {
    const started = await publicContext.request.post(`${application.origin}/api/auth/device`, { data: { name: 'Gauntlet extension' }, headers: { Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } });
    assert.equal(started.status(), 201);
    const pairing = await started.json();
    const poll = () => publicContext.request.post(`${application.origin}/api/auth/device/token`, { data: { deviceCode: pairing.deviceCode } });
    assert.equal((await poll()).status(), 202);
    await alice.page.goto(pairing.verificationUriComplete);
    await alice.page.getByRole('button', { name: 'Approve connection', exact: true }).click();
    await expect(alice.page.locator('#device-code-status')).toContainText(/connected|approved/i);
    await delay(pairing.interval * 1000);
    const authorized = await poll();
    assert.equal(authorized.status(), 200);
    const device = await authorized.json();
    assert.equal(device.user.id, alice.id);
    const deviceRequest = (path: string) => publicContext.request.get(`${application.origin}${path}`, { headers: { Authorization: `Bearer ${device.token}` } });
    assert.equal((await deviceRequest('/api/assets')).status(), 200);
    assert.equal((await deviceRequest('/api/upload-tokens')).status(), 403);
    assert.equal((await deviceRequest('/api/auth/devices')).status(), 403);
    const disconnected = await publicContext.request.delete(`${application.origin}/api/auth/device/session`, { headers: { Authorization: `Bearer ${device.token}` } });
    assert.equal(disconnected.status(), 204);
    assert.equal((await deviceRequest('/api/auth/session')).status(), 401);
  });
  await story('Malformed and oversized media and private-network URLs fail safely', async () => {
    for (const fixture of [{ name: 'not-an-image.png', mimeType: 'image/png', buffer: Buffer.from('not media') }, { name: 'oversized.png', mimeType: 'image/png', buffer: Buffer.alloc(UPLOAD.maxSize + 1) }]) {
      const response = await alice.context.request.post(`${application.origin}/api/upload`, { headers: { Origin: application.origin, 'X-Sploot-User-ID': alice.id }, multipart: { file: fixture } });
      assert([400, 413].includes(response.status()));
    }
    const privateURL = await api(alice, application.origin, '/api/upload/url', 'POST', { url: `${application.origin}/api/health` });
    assert.equal(privateURL.status(), 400);
    assert.equal((await (await api(alice, application.origin, '/api/assets')).json()).total, 5);
  });
  await story('Mobile browser can browse upload play and download without horizontal overflow', async () => {
    await bob.page.bringToFront();
    await bob.page.goto(`${application.origin}/app`);
    await bob.page.getByRole('button', { name: 'Save', exact: true }).click();
    await bob.page.locator('#upload-files').setInputFiles(join(inputDirectory, 'circle.mp4'));
    await expect.poll(async () => (await (await api(bob, application.origin, '/api/assets')).json()).total, { timeout: 60_000 }).toBe(2);
    await bob.page.getByRole('button', { name: 'Close save panel' }).click();
    await bob.page.reload();
    assert(await bob.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const video = bob.page.locator('video').first();
    await video.scrollIntoViewIfNeeded();
    await expect(video).toBeInViewport({ ratio: 0.6 });
    await video.evaluate(async (element: HTMLVideoElement) => { element.muted = true; await element.play(); });
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
    await bob.page.screenshot({ path: join(runtime, 'mobile-library.png'), fullPage: false });
    await bob.page.locator('.media-card').filter({ has: video }).getByRole('button', { name: 'Share', exact: true }).click();
    await expect(bob.page.locator('#download-media')).toBeVisible();
    const downloading = bob.page.waitForEvent('download');
    await bob.page.locator('#download-media').click();
    const download = await downloading;
    const downloadedPath = await download.path();
    assert(downloadedPath);
    assert.equal(digest(await readFile(downloadedPath)), digest(await readFile(join(inputDirectory, 'circle.mp4'))));
    await bob.page.getByRole('button', { name: 'Close sharing' }).click();
  });
  await story('Process restart retains accounts sessions media favorites and local search', async () => {
    await stop(application.child);
    application = await start(dataDirectory, port);
    assert.equal((await api(alice, application.origin, '/api/auth/session')).status(), 200);
    const persisted = (await (await api(alice, application.origin, `/api/assets/${triangle.id}`)).json()).asset;
    assert.equal(persisted.favorite, true);
    assert.equal(digest(await (await api(alice, application.origin, `/media/${triangle.id}`)).body()), triangle.checksum);
    const response = await api(alice, application.origin, '/api/search', 'POST', { query: 'a green square against white', threshold: 0 });
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).results[0].checksum, digest(await readFile(join(inputDirectory, 'square.png'))));
  });
  await story('Owner export and consistent backup restore preserve bytes and invalidate sessions', async () => {
    const exported = await api(alice, application.origin, '/api/library/export');
    assert.equal(exported.status(), 200);
    const zip = await exported.body();
    const entries = unzipSync(zip);
    const manifest = JSON.parse(Buffer.from(entries['manifest.json']!).toString());
    assert.equal(manifest.owner_user_id, alice.id);
    assert.equal(manifest.assets, assets.length);
    const exportedAssets = Object.entries(entries).filter(([name]) => name.endsWith('/metadata.json')).map(([, bytes]) => JSON.parse(Buffer.from(bytes).toString()));
    assert.deepEqual(exportedAssets.map(record => record.asset.id).sort(), assets.map(asset => asset.id).sort());
    for (const record of exportedAssets) {
      assert.equal(record.asset.owner_user_id, alice.id);
      const original = record.media.find((media: { rendition: string }) => media.rendition === 'original');
      assert.equal(digest(Buffer.from(entries[original.path]!)), record.asset.checksum_sha256);
    }
    const snapshot = join(runtime, 'snapshot');
    const restored = join(runtime, 'restored');
    run(binary, ['backup', '--data-dir', dataDirectory, '--directory', snapshot]);
    run(binary, ['verify', '--directory', snapshot]);
    run(binary, ['restore', '--directory', snapshot, '--target-data-dir', restored]);
    run(binary, ['verify', '--directory', snapshot, '--target-data-dir', restored]);
    const restoredApplication = await start(restored, await freePort());
    assert.equal((await alice.context.request.get(`${restoredApplication.origin}/api/auth/session`)).status(), 401);
    const restoredContext = await localBrowser.newContext();
    const login = await restoredContext.request.post(`${restoredApplication.origin}/api/auth/login`, { headers: { Origin: restoredApplication.origin }, data: { email: alice.email, password: alice.password } });
    assert.equal(login.status(), 200);
    const original = await restoredContext.request.get(`${restoredApplication.origin}/media/${triangle.id}`);
    assert.equal(original.status(), 200);
    assert.equal(digest(await original.body()), triangle.checksum);
    await restoredContext.close();
    await stop(restoredApplication.child);
  });
  await story('Password changes and logout revoke old access without removing library data', async () => {
    const changedPassword = `changed-${randomUUID()}`;
    const changed = await api(alice, application.origin, '/api/auth/password', 'POST', { currentPassword: alice.password, password: changedPassword });
    assert.equal(changed.status(), 204);
    assert.equal((await api(alice, application.origin, '/api/auth/logout', 'POST')).status(), 204);
    assert.equal((await api(alice, application.origin, '/api/auth/session')).status(), 401);
    const old = await publicContext.request.post(`${application.origin}/api/auth/login`, { headers: { Origin: application.origin }, data: { email: alice.email, password: alice.password } });
    assert.equal(old.status(), 401);
    await alice.page.goto(`${application.origin}/sign-in`);
    await alice.page.getByLabel('Email', { exact: true }).fill(alice.email);
    await alice.page.getByLabel('Password', { exact: true }).fill(changedPassword);
    await alice.page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(alice.page).toHaveURL(/\/app(?:\?|$)/);
    assert.equal((await (await api(alice, application.origin, '/api/assets')).json()).total, 5);
  });
  await alice.page.bringToFront();
  await alice.page.goto(`${application.origin}/app`);
  await expect(alice.page.locator('.media-card').first()).toBeVisible();
  await alice.page.screenshot({ path: join(runtime, 'desktop-library.png'), fullPage: false });
}
  successful = true;
  console.log(JSON.stringify({ status: 'PASS', stories: results, inference: 'actual pinned CPU CLIP; no SaaS credentials', nativeIPhone: 'not exercised', ...(keep ? { evidenceDirectory: runtime } : {}) }, null, 2));
} finally {
  await closeRuntime();
  if (successful && !keep) await rm(runtime, { recursive: true, force: true });
  else console.log(`Private acceptance evidence retained at ${runtime}`);
}
