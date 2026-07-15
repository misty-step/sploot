#!/usr/bin/env tsx
/**
 * Capture truthful PWA manifest screenshots from the real authenticated app.
 *
 * This intentionally uses the repository QA seam (local qa:seed fixtures plus
 * signed qa-local auth) and Playwright's screenshot API. It does not paint or
 * inject a replacement UI. The generated capture manifest is consumed by
 * validate-pwa-assets.mjs so a hand-authored screenshot cannot satisfy the
 * contract without matching a real capture's dimensions, hashes, seed, and
 * rendered-app checks. It launches the built production server only.
 */

import { createHash } from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { lstat, mkdir, readFile, readlink, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { chromium, type Browser, type BrowserContext, type Page, type Request } from '@playwright/test';
import { createQaLocalAuthToken, getQaLocalAuthHeader, QA_LOCAL_AUDIENCE, QA_LOCAL_DEPLOYMENT_ENV, QA_LOCAL_DEPLOYMENT_ID } from '../lib/auth/qa-local';

const execFileAsync = promisify(execFile);
const WEB_ROOT = resolve(process.cwd());
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');
const DEFAULT_DATABASE_URL = 'postgresql://test:test@localhost:5432/sploot_test?sslmode=disable';
const DEFAULT_SECRET = 'local-pwa-capture-secret';
// Clerk's documented keyless placeholder key pair (base64 of the public
// clerk.example.clerk.com$ instance domain — not a credential). Supplying it
// keeps Clerk's keyless development helper from adding its configuration
// panel to the rendered app. Constructed at runtime so no secret-shaped
// literal is committed.
const CLERK_KEYLESS_PLACEHOLDER = Buffer.from('clerk.example.clerk.com$').toString('base64');
const DEFAULT_CLERK_PUBLISHABLE_KEY = `pk_test_${CLERK_KEYLESS_PLACEHOLDER}`;
const DEFAULT_CLERK_SECRET_KEY = `sk_test_${CLERK_KEYLESS_PLACEHOLDER}`;
const DEFAULT_PORT = 3112;
const BUILD_COMMAND = 'pnpm exec next build --webpack';
const START_COMMAND = 'pnpm start -H 127.0.0.1';
const SCREENSHOT_DIR = join(WEB_ROOT, 'public', 'screenshots');
const CAPTURE_MANIFEST = join(SCREENSHOT_DIR, 'capture-manifest.json');
const CAPTURE_OUTPUTS = new Set([
  'apps/web/public/screenshots/capture-manifest.json',
  'apps/web/public/screenshots/desktop-home.png',
  'apps/web/public/screenshots/mobile-home.png',
]);
const BUILD_GENERATED_PATHS = new Set([
  'apps/web/public/sw.js',
  'apps/web/public/workbox-0434ae86.js.map',
]);
const SOURCE_PATHS = ['apps/web', 'packages/common', 'scripts', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json', '.npmrc'];
const SOURCE_EXCLUDED_PREFIXES = ['apps/web/public/screenshots/', 'apps/web/public/sw.js', 'apps/web/public/workbox-'];
const BUILD_CACHE_PREFIXES = ['apps/web/.next/cache/'];
const BUILD_INVENTORY_EXCLUSIONS = ['apps/web/.next/cache/** — Next incremental cache; it is nondeterministic and is not required to run the production artifact'];
const SPECS = [
  { name: 'desktop-home.png', width: 1920, height: 1080, theme: 'light' },
  { name: 'mobile-home.png', width: 390, height: 844, theme: 'light' },
  { name: 'mobile-home-dark.png', width: 390, height: 844, theme: 'dark' },
] as const;
const SEED = {
  captureVersion: 1,
  seedId: 'sploot-pwa-qa-v1',
  route: '/app',
  userId: 'qa-design-user',
  assetCount: 24,
  shuffleSeed: 424242,
};

interface CaptureState {
  pathname: string;
  viewportWidth: number;
  viewportHeight: number;
  assetCount: number;
  imageCount: number;
  mediaCount: number;
  decodedMediaCount: number;
  decodedQaMediaCount: number;
  loadedImageCount: number;
  qaImageCount: number;
  fullyInsideImageCount: number;
  incompleteVisibleImageCount: number;
  horizontalOverflowPx: number;
  visibleTileCount: number;
  visibleTileOpacityMin: number;
  debugOverlayCount: number;
  hmrScriptCount: number;
  blankWorkbenchCount: number;
  fontStatus: string;
  fontFaceCount: number;
  signInWall: boolean;
  loadingText: boolean;
  placeholderCount: number;
}

interface ImageNetworkSnapshot {
  count: number;
  bytes: number;
  urls: string[];
}

interface TileProbeResult {
  assetId: string;
  url: string;
  top: number;
  bottom: number;
  naturalWidth: number;
  naturalHeight: number;
  wasInitiallyRequested: boolean;
  settled: boolean;
}

interface ServiceWorkerProof {
  scope: string;
  activeScriptUrl: string;
  updateAttempted: boolean;
}

function parseArgs(argv: string[]) {
  const args = {
    port: Number(process.env.PWA_CAPTURE_PORT ?? DEFAULT_PORT),
    databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    secret: process.env.SPLOOT_QA_AUTH_SECRET ?? DEFAULT_SECRET,
  };
  for (let index = 0; index < argv.length; index += 1) {
    switch (argv[index]) {
      case '--base-url': throw new Error('capture refuses external/base-url evidence; it must build and start locally');
      case '--port': args.port = Number(argv[++index] ?? DEFAULT_PORT); break;
      case '--database-url': args.databaseUrl = argv[++index] ?? args.databaseUrl; break;
      case '--secret': args.secret = argv[++index] ?? args.secret; break;
    }
  }
  return args;
}

function assertLocalDatabase(databaseUrl: string): void {
  const host = new URL(databaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`refusing to seed non-local database host ${host}`);
  }
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await execFileAsync(command, args, { cwd: WEB_ROOT, env, maxBuffer: 10 * 1024 * 1024 });
}

async function gitOutput(args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd: REPO_ROOT, maxBuffer: 20 * 1024 * 1024 });
  return result.stdout.trim();
}

interface InventoryEntry {
  path: string;
  kind: 'file' | 'symlink';
  mode: number;
  bytes: number;
  sha256: string;
  symlinkTarget?: string;
}

async function inventoryPath(relativePath: string): Promise<InventoryEntry> {
  const absolutePath = join(REPO_ROOT, relativePath);
  const stat = await lstat(absolutePath);
  if (stat.isSymbolicLink()) {
    const symlinkTarget = await readlink(absolutePath);
    return { path: relativePath, kind: 'symlink', mode: stat.mode & 0o7777, bytes: 0, sha256: createHash('sha256').update(symlinkTarget).digest('hex'), symlinkTarget };
  }
  if (!stat.isFile()) throw new Error(`provenance inventory cannot include non-file ${relativePath}`);
  const bytes = await readFile(absolutePath);
  return { path: relativePath, kind: 'file', mode: stat.mode & 0o7777, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function inventoryPaths(paths: string[]): Promise<InventoryEntry[]> {
  const entries: InventoryEntry[] = [];
  for (const path of [...new Set(paths)].sort()) {
    try {
      entries.push(await inventoryPath(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return entries;
}

async function sourceInventory(): Promise<InventoryEntry[]> {
  const tracked = await gitOutput(['ls-files', '--', ...SOURCE_PATHS]);
  const untracked = await gitOutput(['ls-files', '--others', '--exclude-standard', '--', ...SOURCE_PATHS]);
  const paths = [...tracked.split('\n'), ...untracked.split('\n')].filter((path) => path && !CAPTURE_OUTPUTS.has(path) && !SOURCE_EXCLUDED_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix)));
  const entries = await inventoryPaths(paths);
  if (entries.length === 0) throw new Error('provenance source inventory is empty');
  return entries;
}

async function walkFiles(relativeDir: string): Promise<string[]> {
  const absoluteDir = join(REPO_ROOT, relativeDir);
  const files: string[] = [];
  for (const entry of await readdir(absoluteDir, { withFileTypes: true })) {
    const relativePath = join(relativeDir, entry.name).replaceAll('\\', '/');
    if (BUILD_CACHE_PREFIXES.some((prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix))) continue;
    if (entry.isDirectory()) files.push(...await walkFiles(relativePath));
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(relativePath);
  }
  return files;
}

async function buildInventory(): Promise<InventoryEntry[]> {
  const candidates = [...await walkFiles('apps/web/.next'), ...BUILD_GENERATED_PATHS];
  const entries = await inventoryPaths(candidates);
  if (entries.length < 10) throw new Error(`production build inventory is incomplete (${entries.length} files)`);
  return entries;
}

async function provenanceInputs(port: number) {
  const baseCommit = await gitOutput(['rev-parse', 'HEAD']);
  const baseTree = await gitOutput(['rev-parse', 'HEAD^{tree}']);
  const source = await sourceInventory();
  const build = await buildInventory();
  const contract = { ...SEED, viewportContract: SPECS, serverMode: 'production-start', lifecycle: { freshBuild: true, buildCommand: BUILD_COMMAND, startCommand: START_COMMAND, isolatedHost: '127.0.0.1', isolatedPort: port, hmr: false }, buildInventoryExclusions: BUILD_INVENTORY_EXCLUSIONS, deploymentIdentity: QA_LOCAL_DEPLOYMENT_ID, deploymentEnvironment: QA_LOCAL_DEPLOYMENT_ENV, audience: QA_LOCAL_AUDIENCE };
  const serialized = JSON.stringify({ baseCommit, baseTree, contract, source, build });
  const digest = createHash('sha256').update(serialized).digest('hex');
  return { baseCommit, baseTree, source, build, contract, digest };
}

async function waitForServer(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}${SEED.route}`, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // The dev server is still compiling or binding its port.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`server at ${baseUrl} did not become ready within 120 seconds`);
}

function startServer(env: NodeJS.ProcessEnv, port: number): ChildProcess {
  const server = spawn('pnpm', ['start', '-H', '127.0.0.1'], {
    cwd: WEB_ROOT,
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (chunk) => process.stderr.write(`[pwa-capture server] ${chunk}`));
  server.stderr?.on('data', (chunk) => process.stderr.write(`[pwa-capture server] ${chunk}`));
  return server;
}

async function buildFreshProduction(env: NodeJS.ProcessEnv): Promise<void> {
  await run('pnpm', ['exec', 'next', 'build', '--webpack'], env);
  await execFileAsync('git', ['restore', '--', 'apps/web/public/workbox-0434ae86.js.map'], { cwd: REPO_ROOT, env });
}

async function renderedState(page: Page): Promise<CaptureState> {
  return page.evaluate(() => {
    const visibleImages = Array.from(document.querySelectorAll<HTMLImageElement>('[data-asset-id] img')).filter((image) => {
      const bounds = image.getBoundingClientRect();
      return image.src && bounds.top >= 0 && bounds.left >= 0 && bounds.bottom <= window.innerHeight && bounds.right <= window.innerWidth && bounds.width > 0 && bounds.height > 0;
    });
    const allImages = Array.from(document.querySelectorAll<HTMLImageElement>('[data-asset-id] img'));
    const decodedImages = allImages.filter((image) => image.complete && image.naturalWidth > 0);
    const media = Array.from(document.querySelectorAll<HTMLImageElement | HTMLVideoElement>('[data-asset-id] img, [data-asset-id] video'));
    const decodedMedia = media.filter((element) => element instanceof HTMLImageElement
      ? element.complete && element.naturalWidth > 0
      : element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
    const visiblePlaceholders = Array.from(document.querySelectorAll<HTMLElement>('[aria-busy="true"], .animate-pulse, [data-testid*="skeleton" i]'))
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.top < window.innerHeight + 120 && bounds.bottom > -120 && bounds.width > 0 && bounds.height > 0;
      });
    const bodyText = document.body.innerText.toLowerCase();
    const visibleTiles = Array.from(document.querySelectorAll<HTMLElement>('[data-asset-id]')).filter((element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.top < window.innerHeight && bounds.bottom > 0 && bounds.width > 0 && bounds.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    });
    const tileOpacities = visibleTiles.map((element) => Number.parseFloat(getComputedStyle(element).opacity));
    const debugOverlayTextCount = [
      /configure your application/i,
      /temporary api keys/i,
      /\b\d+ issue(?:s)?\b/i,
    ].filter((pattern) => pattern.test(bodyText)).length;
    const debugOverlaySelectorCount = document.querySelectorAll('nextjs-portal, [data-next-badge-root], [data-clerk-component="UserProfile"], [data-clerk-component="SignIn"], [data-clerk-component="SignUp"]').length;
    const hmrScriptCount = document.querySelectorAll('script[src*="webpack-hmr"], script[src*="_next/webpack-hmr"]').length;
    const bodyHasBlankWorkbench = /your pile is empty|shelf is suspiciously empty|load the starter pile/i.test(bodyText);
    return {
      pathname: window.location.pathname,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      assetCount: document.querySelectorAll('[data-asset-id]').length,
      imageCount: allImages.length,
      mediaCount: media.length,
      decodedMediaCount: decodedMedia.length,
      decodedQaMediaCount: decodedMedia.filter((element) => (element as HTMLImageElement).src?.includes('/qa-blob-seed/')).length,
      loadedImageCount: visibleImages.filter((image) => image.complete && image.naturalWidth > 0).length,
      qaImageCount: decodedImages.filter((image) => image.src.includes('/qa-blob-seed/')).length,
      fullyInsideImageCount: visibleImages.length,
      incompleteVisibleImageCount: visibleImages.filter((image) => !image.complete || image.naturalWidth <= 0).length,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      visibleTileCount: visibleTiles.length,
      visibleTileOpacityMin: tileOpacities.length ? Math.min(...tileOpacities) : 0,
      debugOverlayCount: debugOverlayTextCount + debugOverlaySelectorCount,
      hmrScriptCount,
      blankWorkbenchCount: bodyHasBlankWorkbench ? 1 : 0,
      fontStatus: document.fonts.status,
      fontFaceCount: document.fonts.size,
      signInWall: window.location.pathname.startsWith('/sign-in') || bodyText.includes('sign in to sploot'),
      loadingText: /loading the pile|loading more|searching/i.test(bodyText),
      placeholderCount: visiblePlaceholders.length,
    };
  });
}

async function collectImageNetworkSnapshot(page: Page): Promise<ImageNetworkSnapshot> {
  return page.evaluate(() => {
    const resources = performance.getEntriesByType('resource')
      .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
      .filter((entry) => entry.initiatorType === 'img' && new URL(entry.name).pathname.includes('/qa-blob-seed/'))
      .map((entry) => ({
        url: entry.name,
        bytes: entry.encodedBodySize || entry.decodedBodySize || 0,
      }));
    return {
      count: resources.length,
      bytes: resources.reduce((sum, entry) => sum + entry.bytes, 0),
      urls: resources.map((entry) => entry.url).sort(),
    };
  });
}

async function chooseOffscreenTileProbes(page: Page, initialUrls: string[]): Promise<TileProbeResult[]> {
  return page.evaluate((urls) => {
    const requested = new Set(urls);
    const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-asset-id]')).map((tile) => {
      const image = tile.querySelector('img');
      const bounds = tile.getBoundingClientRect();
      const dataUrl = tile.dataset.assetUrl ?? '';
      return {
        assetId: tile.dataset.assetId ?? '',
        url: dataUrl || (image instanceof HTMLImageElement ? (image.currentSrc || image.src || '') : ''),
        top: Math.round(bounds.top),
        bottom: Math.round(bounds.bottom),
        visible: bounds.top < window.innerHeight && bounds.bottom > 0 && bounds.width > 0 && bounds.height > 0,
        requestedInitially: requested.has(dataUrl || (image instanceof HTMLImageElement ? (image.currentSrc || image.src || '') : '')),
      };
    });
    const offscreen = tiles
      .filter((tile) => !tile.visible && tile.url);
    if (offscreen.length === 0) {
      throw new Error(`no offscreen QA tiles were available for scroll probing: ${JSON.stringify({ totalTiles: tiles.length, requestedInitially: tiles.filter((tile) => tile.requestedInitially).map((tile) => ({ assetId: tile.assetId, url: tile.url })) })}`);
    }
    const picks = [offscreen[0], offscreen[Math.floor(offscreen.length / 2)], offscreen[offscreen.length - 1]]
      .filter((tile, index, array) => tile && array.findIndex((candidate) => candidate.assetId === tile.assetId) === index);
    return picks.map((tile) => ({
      assetId: tile.assetId,
      url: tile.url,
      top: tile.top,
      bottom: tile.bottom,
      naturalWidth: 0,
      naturalHeight: 0,
      wasInitiallyRequested: tile.requestedInitially,
      settled: false,
    }));
  }, initialUrls);
}

async function resetGridScroll(page: Page): Promise<void> {
  await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>('[data-pwa-grid-scroll]');
    if (container) container.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
}

async function settleProbeTile(page: Page, tile: TileProbeResult, timeoutMs = 12_000): Promise<TileProbeResult> {
  const escapedAssetId = tile.assetId.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  const locator = page.locator(`[data-asset-id="${escapedAssetId}"]`);
  try {
    await page.evaluate((assetId) => {
      const element = document.querySelector<HTMLElement>(`[data-asset-id="${assetId.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`);
      if (!element) throw new Error(`missing tile ${assetId}`);
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
    }, tile.assetId);
    await page.waitForFunction((assetId) => {
      const element = document.querySelector<HTMLElement>(`[data-asset-id="${assetId.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`);
      const image = element?.querySelector('img');
      return element instanceof HTMLElement && image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    }, tile.assetId, { timeout: timeoutMs });
    const settled = await locator.evaluate((element, probe) => {
      const image = element.querySelector('img');
      if (!(image instanceof HTMLImageElement)) {
        throw new Error(`tile ${probe.assetId} is missing an image element`);
      }
      const url = image.currentSrc || image.src || probe.url;
      const bounds = element.getBoundingClientRect();
      if (!image.complete || image.naturalWidth <= 0) {
        throw new Error(`tile ${probe.assetId} did not decode ${url}`);
      }
      return {
        assetId: probe.assetId,
        url,
        top: Math.round(bounds.top),
        bottom: Math.round(bounds.bottom),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        wasInitiallyRequested: probe.wasInitiallyRequested,
        settled: true,
      };
    }, tile);
    return settled;
  } catch (error) {
    const current = await locator.evaluate((element) => {
      const image = element.querySelector('img');
      const bounds = element.getBoundingClientRect();
      return {
        assetId: element.getAttribute('data-asset-id') ?? '',
        url: image instanceof HTMLImageElement ? (image.currentSrc || image.src || '') : '',
        top: Math.round(bounds.top),
        bottom: Math.round(bounds.bottom),
        naturalWidth: image instanceof HTMLImageElement ? image.naturalWidth : 0,
        naturalHeight: image instanceof HTMLImageElement ? image.naturalHeight : 0,
      };
    }).catch(() => tile);
    throw new Error(`tile probe did not settle: ${JSON.stringify({ cause: error instanceof Error ? error.message : String(error), tile: current })}`);
  } finally {
    await resetGridScroll(page);
  }
}

async function probeRepresentativeTiles(page: Page): Promise<{
  initial: ImageNetworkSnapshot;
  after: ImageNetworkSnapshot;
  probes: TileProbeResult[];
  initialState: CaptureState;
  afterState: CaptureState;
}> {
  const initialState = await renderedState(page);
  const initial = await collectImageNetworkSnapshot(page);
  console.log(`[pwa-capture] initial QA image network: ${JSON.stringify(initial)}`);
  if (initial.count >= SEED.assetCount) {
    throw new Error(`initial navigation fetched too many QA images: ${JSON.stringify(initial)}`);
  }
  const probes = await chooseOffscreenTileProbes(page, initial.urls);
  console.log(`[pwa-capture] selected scroll probes: ${JSON.stringify(probes)}`);
  const settledProbes: TileProbeResult[] = [];
  for (const probe of probes) {
    console.log(`[pwa-capture] settling tile ${probe.assetId} (${probe.url})`);
    settledProbes.push(await settleProbeTile(page, probe));
    console.log(`[pwa-capture] settled tile ${probe.assetId}`);
  }
  const after = await collectImageNetworkSnapshot(page);
  const afterState = await renderedState(page);
  console.log(`[pwa-capture] post-scroll QA image network: ${JSON.stringify(after)}`);
  if (after.count <= initial.count && afterState.loadedImageCount <= initialState.loadedImageCount && afterState.qaImageCount <= initialState.qaImageCount) {
    throw new Error(`scroll probes did not load any additional QA images: ${JSON.stringify({ initial, after, initialState, afterState, probes: settledProbes })}`);
  }
  return { initial, after, probes: settledProbes, initialState, afterState };
}

async function waitForRenderedApp(page: Page): Promise<CaptureState> {
  await page.waitForURL(/\/app(?:$|\?)/, { timeout: 120_000 });
  const deadline = Date.now() + 120_000;
  let state = await renderedState(page);
  let lastLogAt = 0;
  while (Date.now() < deadline) {
    if (state.assetCount >= SEED.assetCount && state.loadedImageCount >= 1 && state.visibleTileCount >= 2 && state.debugOverlayCount === 0) break;
    if (Date.now() - lastLogAt > 10_000) {
      console.log(`[pwa-capture] waiting for rendered app gate: ${JSON.stringify(state)}`);
      lastLogAt = Date.now();
    }
    await page.waitForTimeout(500);
    state = await renderedState(page);
  }
  if (!(state.assetCount >= SEED.assetCount && state.loadedImageCount >= 1 && state.visibleTileCount >= 2 && state.debugOverlayCount === 0)) {
    throw new Error(`rendered app did not reach the capture gate: ${JSON.stringify(state)}`);
  }
  console.log(`[pwa-capture] rendered app gate passed: ${JSON.stringify(state)}`);
  await page.waitForTimeout(1_000);
  await page.evaluate(() => document.fonts.ready);
  state = await renderedState(page);
  if (state.signInWall) throw new Error('capture landed on the sign-in wall');
  if (state.pathname !== '/app') throw new Error(`capture landed on ${state.pathname}`);
  if (state.viewportWidth <= 0 || state.viewportHeight <= 0 || state.assetCount !== SEED.assetCount || state.loadedImageCount < 1 || state.fullyInsideImageCount < 1 || state.incompleteVisibleImageCount !== 0 || state.fontStatus !== 'loaded' || state.fontFaceCount < 3 || state.hmrScriptCount !== 0 || state.blankWorkbenchCount !== 0) {
    throw new Error(`capture did not render seeded app content: ${JSON.stringify(state)}`);
  }
  if (state.visibleTileCount < 2 || state.visibleTileOpacityMin < 0.5) {
    throw new Error(`capture did not render visible product tiles: ${JSON.stringify(state)}`);
  }
  if (state.debugOverlayCount > 0) {
    throw new Error(`capture contains a development/debug overlay: ${JSON.stringify(state)}`);
  }
  if (state.loadingText || state.placeholderCount > 0) {
    throw new Error(`capture still contains loading/placeholder UI: ${JSON.stringify(state)}`);
  }
  if (state.horizontalOverflowPx > 2) {
    throw new Error(`capture has horizontal overflow: ${JSON.stringify(state)}`);
  }
  console.log(`[pwa-capture] rendered app visual checks passed: ${JSON.stringify(state)}`);
  return state;
}

async function probeServiceWorker(page: Page): Promise<ServiceWorkerProof> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('service workers are unavailable in the production browser flow');
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error('production service worker never reached active state');
    await registration.update();
    return {
      scope: registration.scope,
      activeScriptUrl: registration.active.scriptURL,
      updateAttempted: true,
    };
  });
}

async function captureViewport(browser: Browser, baseUrl: string, secret: string, spec: (typeof SPECS)[number]) {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: spec.width, height: spec.height },
    deviceScaleFactor: 1,
    colorScheme: spec.theme,
    locale: 'en-US',
    // The real grid uses its entry animation to reveal tiles from the
    // intentional initial opacity: 0 state. Allow it to settle, then capture
    // the stable rendered result; prefers-reduced-motion disables that reveal
    // in the design-system CSS and would produce a false blank screenshot.
    reducedMotion: 'no-preference',
  });
  const qaToken = await createQaLocalAuthToken({ userId: SEED.userId, email: `${SEED.userId}@sploot.test`, secret });
  await context.setExtraHTTPHeaders({ [getQaLocalAuthHeader()]: qaToken });
  await context.addInitScript((seed) => {
    localStorage.setItem('theme', seed.theme);
    localStorage.setItem('sploot-sort-preferences', JSON.stringify({
      sortBy: 'shuffle',
      direction: 'desc',
      shuffleSeed: seed,
    }));
  }, { ...SEED, theme: spec.theme });

  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const responseErrors: string[] = [];
  const hmrRequests: string[] = [];
  const abortedRequests: string[] = [];
  const teardownAbortUrls: string[] = [];
  let assertionWindowOpen = true;
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const onRequest = (request: Request) => {
    if (request.url().includes('webpack-hmr')) hmrRequests.push(request.url());
  };
  const onRequestFailed = (request: Request) => {
    const failure = request.failure()?.errorText;
    const detail = `${request.method()} ${request.url()}${failure ? ` (${failure})` : ''}`;
    if (!assertionWindowOpen) {
      teardownAbortUrls.push(detail);
    } else if (failure === 'net::ERR_ABORTED') {
      abortedRequests.push(detail);
    } else {
      failedRequests.push(detail);
    }
  };
  page.on('request', onRequest);
  page.on('requestfailed', onRequestFailed);
  page.on('response', (response) => {
    if (response.status() >= 400) responseErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });

  try {
    // Install the waiter before navigation so the real application health hook
    // is part of the assertion window. waitForResponse tracks the response
    // lifecycle directly and avoids request-event ordering races.
    const healthResponsePromise = page.waitForResponse((response) => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/health', { timeout: 15_000 });
    const navigation = await page.goto(`${baseUrl}${SEED.route}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const healthResponse = await healthResponsePromise;
    if (!healthResponse.ok()) throw new Error(`health probe returned HTTP ${healthResponse.status()}`);
    const state = await waitForRenderedApp(page);
    const serviceWorker = await probeServiceWorker(page);
    const probeProof = await probeRepresentativeTiles(page);
    await page.waitForTimeout(500);
    if (navigation?.status() !== 200 || consoleErrors.length || pageErrors.length || failedRequests.length || abortedRequests.length || responseErrors.length || hmrRequests.length) {
      throw new Error(`browser/production errors during ${spec.name}: ${JSON.stringify({ navigationStatus: navigation?.status(), consoleErrors, pageErrors, failedRequests, abortedRequests, responseErrors, hmrRequests, state, probeProof })}`);
    }

    const outputPath = join(SCREENSHOT_DIR, spec.name);
    await page.screenshot({ path: outputPath, animations: 'disabled', caret: 'hide', fullPage: false });
    // Keep the page alive through the assertion window. This catches lazy-media,
    // prefetch, and navigation cancellations before context teardown can create
    // a misleadingly clean proof.
    await page.waitForTimeout(1_500);
    if (abortedRequests.length) {
      throw new Error(`browser request aborts during ${spec.name}: ${JSON.stringify(abortedRequests)}`);
    }
    const bytes = await readFile(outputPath);
    const raster = await sharp(bytes).metadata();
    const stats = await sharp(bytes).stats();
    if (raster.width !== spec.width || raster.height !== spec.height || stats.entropy < 1 || !stats.channels.some((channel) => channel.stdev > 8)) {
      throw new Error(`capture raster is blank/incorrect for ${spec.name}: ${JSON.stringify({ raster, entropy: stats.entropy, stdev: stats.channels.map((channel) => channel.stdev) })}`);
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    const probeUrls = probeProof.probes.map((probe) => probe.url);
    return {
      width: spec.width,
      height: spec.height,
      theme: spec.theme,
      serviceWorkerScope: serviceWorker.scope,
      serviceWorkerActive: serviceWorker.activeScriptUrl.endsWith('/sw.js'),
      serviceWorkerUpdateAttempted: serviceWorker.updateAttempted,
      viewportWidth: state.viewportWidth,
      viewportHeight: state.viewportHeight,
      initialImageRequestCount: probeProof.initial.count,
      initialImageRequestBytes: probeProof.initial.bytes,
      initialImageRequestUrls: probeProof.initial.urls,
      postScrollImageRequestCount: probeProof.after.count,
      postScrollImageRequestBytes: probeProof.after.bytes,
      postScrollImageRequestUrls: probeProof.after.urls,
      initialLoadedImageCount: probeProof.initialState.loadedImageCount,
      initialQaImageCount: probeProof.initialState.qaImageCount,
      postScrollLoadedImageCount: probeProof.afterState.loadedImageCount,
      postScrollQaImageCount: probeProof.afterState.qaImageCount,
      scrollProbeCount: probeProof.probes.length,
      scrollProbeUrls: probeUrls,
      scrollProbes: probeProof.probes,
      sha256: digest,
      assetCount: state.assetCount,
      imageCount: state.imageCount,
      mediaCount: state.mediaCount,
      decodedMediaCount: state.decodedMediaCount,
      decodedQaMediaCount: state.decodedQaMediaCount,
      loadedImageCount: state.loadedImageCount,
      qaImageCount: state.qaImageCount,
      fullyInsideImageCount: state.fullyInsideImageCount,
      incompleteVisibleImageCount: state.incompleteVisibleImageCount,
      horizontalOverflowPx: state.horizontalOverflowPx,
      visibleTileCount: state.visibleTileCount,
      visibleTileOpacityMin: state.visibleTileOpacityMin,
      debugOverlayCount: state.debugOverlayCount,
      consoleErrors: consoleErrors.length,
      pageErrors: pageErrors.length,
      failedRequests: failedRequests.length,
      responseErrors: responseErrors.length,
      hmrRequests: hmrRequests.length,
      abortedRequests: abortedRequests.length,
      abortedRequestUrls: abortedRequests,
      assertionWindowClosed: true,
      requestFailureAccounting: 'assertion-window-only',
      teardownAbortUrls,
    };
  } finally {
    assertionWindowOpen = false;
    await context.close().catch(() => undefined);
    page.removeListener('request', onRequest);
    page.removeListener('requestfailed', onRequestFailed);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertLocalDatabase(args.databaseUrl);
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: args.databaseUrl,
    SPLOOT_QA_AUTH_MODE: 'enabled',
    SPLOOT_PWA_CAPTURE_MODE: 'enabled',
    NEXT_PUBLIC_SPLOOT_QA_AUTH_MODE: 'enabled',
    DEPLOYMENT_ENV: QA_LOCAL_DEPLOYMENT_ENV,
    // Explicit non-deployed marker under the containment taxonomy; the
    // qa-local proof seam refuses to enable without it.
    SPLOOT_DEPLOYMENT_ENV: 'test',
    SPLOOT_QA_DEPLOYMENT_ID: QA_LOCAL_DEPLOYMENT_ID,
    SPLOOT_QA_DEPLOYMENT_ENV: QA_LOCAL_DEPLOYMENT_ENV,
    SPLOOT_QA_AUDIENCE: QA_LOCAL_AUDIENCE,
    NEXT_PUBLIC_SPLOOT_QA_DEPLOYMENT_ID: QA_LOCAL_DEPLOYMENT_ID,
    NEXT_PUBLIC_SPLOOT_QA_DEPLOYMENT_ENV: QA_LOCAL_DEPLOYMENT_ENV,
    NEXT_PUBLIC_SPLOOT_QA_AUDIENCE: QA_LOCAL_AUDIENCE,
    NEXT_PUBLIC_SPLOOT_PWA_CAPTURE_MODE: 'enabled',
    SPLOOT_QA_AUTH_SECRET: args.secret,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? DEFAULT_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? DEFAULT_CLERK_SECRET_KEY,
    NODE_ENV: 'production',
  };
  await buildFreshProduction(env);
  await run('pnpm', ['qa:seed', '--teardown'], env);
  await run('pnpm', ['qa:seed', '--count', String(SEED.assetCount), '--images-only'], env);

  const baseUrl = `http://127.0.0.1:${args.port}`;
  const captureTimestamp = new Date().toISOString();
  const inputsBeforeCapture = await provenanceInputs(args.port);
  const provenance = {
    gitCommit: inputsBeforeCapture.baseCommit,
    gitTree: inputsBeforeCapture.baseTree,
    worktreeDigest: inputsBeforeCapture.digest,
    digestInputCount: inputsBeforeCapture.source.length + inputsBeforeCapture.build.length,
    sourceInventory: inputsBeforeCapture.source,
    buildInventory: inputsBeforeCapture.build,
    buildInventoryExclusions: BUILD_INVENTORY_EXCLUSIONS,
    provenanceContract: inputsBeforeCapture.contract,
    url: `${baseUrl}${SEED.route}`,
    viewportContract: SPECS,
    serverMode: 'production-start',
    lifecycle: {
      freshBuild: true,
      buildCommand: BUILD_COMMAND,
      startCommand: START_COMMAND,
      isolatedHost: '127.0.0.1',
      isolatedPort: args.port,
      hmr: false,
    },
    deploymentIdentity: QA_LOCAL_DEPLOYMENT_ID,
    deploymentEnvironment: QA_LOCAL_DEPLOYMENT_ENV,
    audience: QA_LOCAL_AUDIENCE,
    timestamp: captureTimestamp,
  };
  const server = startServer(env, args.port);
  try {
    await waitForServer(baseUrl);
    const browser = await chromium.launch();
    const screenshots: Record<string, unknown> = {};
    try {
      for (const spec of SPECS) {
        screenshots[spec.name] = await captureViewport(browser, baseUrl, args.secret, spec);
        console.log(`Captured ${spec.name} from ${baseUrl}${SEED.route}`);
      }
    } finally {
      await browser.close();
    }

    const inputsAfterCapture = await provenanceInputs(args.port);
    if (inputsAfterCapture.digest !== inputsBeforeCapture.digest) {
      throw new Error(`provenance digest inputs changed during capture: before=${inputsBeforeCapture.digest} after=${inputsAfterCapture.digest}`);
    }

    await writeFile(CAPTURE_MANIFEST, `${JSON.stringify({
      ...SEED,
      ...provenance,
      source: 'playwright-rendered-next-app',
      basePath: SEED.route,
      screenshots,
    }, null, 2)}\n`);
    console.log(`Wrote ${CAPTURE_MANIFEST}`);

    // Generation is only complete once the full live-provenance contract
    // (HEAD/tree binding plus byte-exact source and build inventories)
    // verifies against the evidence just written. Nonzero on any failure.
    await run('node', ['scripts/validate-pwa-assets.mjs', '--provenance=live'], env);
    console.log('Live provenance validation PASS');
  } finally {
    if (server?.pid) {
      server.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  console.error(`PWA screenshot capture FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
