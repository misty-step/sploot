#!/usr/bin/env node
/**
 * Exhaustive PWA install/share contract.
 *
 * With no arguments this validates checked-in public assets and Next file-based
 * metadata assets. Pass --base-url=https://www.sploot.app to repeat the same
 * resource/MIME checks against a deployed origin. The remote share probe is
 * deliberately unauthenticated and only asserts the exact auth boundary; the
 * local authenticated parsing seam is covered by share-target.test.ts.
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, readFile, readlink, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const {
  BRAND_COLORS,
  PWA_ICONS,
  SUPPORTING_ICONS,
  SCREENSHOTS,
  SCREENSHOT_CAPTURE,
  SPLASH_SCREENS,
  SVG_ASSETS,
} = require('./pwa-assets.cjs');

const publicDir = resolve(new URL('../public/', import.meta.url).pathname);
const appDir = resolve(new URL('../app/', import.meta.url).pathname);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const CAPTURE_MANIFEST_FILE = process.env.PWA_CAPTURE_MANIFEST ?? join(publicDir, 'screenshots', 'capture-manifest.json');
const SERVICE_WORKER_FILE = process.env.PWA_SERVICE_WORKER_FILE ?? join(publicDir, 'sw.js');
const repoDir = resolve(publicDir, '../..', '..');
const execFileAsync = promisify(execFile);
const SOURCE_PATHS = ['apps/web', 'packages/common', 'scripts', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json', '.npmrc'];
const SOURCE_EXCLUDED_PREFIXES = ['apps/web/public/screenshots/', 'apps/web/public/sw.js', 'apps/web/public/workbox-'];
const BUILD_GENERATED_PATHS = ['apps/web/public/sw.js'];
const BUILD_CACHE_PREFIX = 'apps/web/.next/cache/';
const BUILD_INVENTORY_EXCLUSIONS = ['apps/web/.next/cache/** — Next incremental cache; it is nondeterministic and is not required to run the production artifact'];

function fail(message) {
  throw new Error(message);
}

/**
 * Provenance verification runs in one of two explicit tiers:
 *
 * - `live`: the full capture-state contract — the manifest's base commit/tree
 *   must equal the repository HEAD, and every recorded source/build inventory
 *   entry must byte-match the live worktree and `.next` production artifact.
 *   This is the tier the capture rig itself enforces (nonzero on failure)
 *   immediately after writing the manifest, before the evidence is committed.
 * - `recorded`: the deterministic subset that must keep holding at any later
 *   commit (CI has no production build and a different merge commit): manifest
 *   structure, screenshot-hash binding, rendered-proof gates, inventory
 *   shape/path safety, and recomputation of the provenance digest over the
 *   recorded base commit/tree + contract + inventories. Any tampering with the
 *   recorded evidence still fails; only live-file byte comparison is deferred
 *   to the capture-time `live` run.
 *
 * `auto` resolves to `live` exactly when the repository is still in the
 * capture state (production build present and HEAD equals the manifest's base
 * commit) and prints the resolved tier — never a silent downgrade.
 */
async function resolveProvenanceMode(manifest) {
  const flag = process.argv.find((arg) => arg.startsWith('--provenance='))?.slice('--provenance='.length) ?? 'auto';
  if (!['auto', 'live', 'recorded'].includes(flag)) fail(`unknown --provenance mode: ${flag}`);
  if (flag !== 'auto') {
    console.log(`Provenance mode: ${flag} (explicit --provenance flag)`);
    return flag;
  }
  const buildPresent = await lstat(resolve(repoDir, 'apps/web/.next/BUILD_ID')).then(() => true).catch(() => false);
  const currentHead = await gitOutput(['rev-parse', 'HEAD']).catch(() => null);
  const captureState = buildPresent && currentHead !== null && currentHead === manifest.gitCommit;
  const mode = captureState ? 'live' : 'recorded';
  const reason = captureState
    ? 'repository is in the capture state (production build present, HEAD matches capture base commit)'
    : `live source/build byte verification deferred to the capture-time run (${buildPresent ? '' : 'no production build; '}capture base ${String(manifest.gitCommit).slice(0, 12)} vs HEAD ${String(currentHead).slice(0, 12)})`;
  console.log(`Provenance mode: ${mode} (${reason})`);
  return mode;
}

function validateInventoryShape(entries, label) {
  if (!Array.isArray(entries) || entries.length === 0) fail(`${label} inventory is empty`);
  for (const entry of entries) {
    if (!entry?.path || !/^(file|symlink)$/.test(entry.kind) || !Number.isInteger(entry.mode) || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')) fail(`${label} inventory entry is malformed`);
    if (entry.path.startsWith('/') || entry.path.includes('\\') || entry.path.split('/').some((segment) => segment === '..' || segment === '.')) fail(`${label} inventory path is unsafe: ${entry.path}`);
    const file = resolve(repoDir, entry.path);
    if (file !== repoDir && !file.startsWith(`${repoDir}/`)) fail(`${label} inventory path escapes repository root: ${entry.path}`);
    if (entry.kind === 'file' && !Number.isInteger(entry.bytes)) fail(`${label} inventory byte count is malformed: ${entry.path}`);
    if (entry.kind === 'symlink' && typeof entry.symlinkTarget !== 'string') fail(`${label} inventory symlink target is missing: ${entry.path}`);
  }
}

function expectedSize(value) {
  const match = /^([1-9][0-9]*)x([1-9][0-9]*)$/.exec(value ?? '');
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function hexRgb(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function assertMagic(buffer, mime, label) {
  if (mime === 'image/png' && !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) fail(`${label} is not a PNG`);
  if (mime === 'image/jpeg' && !(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9)) {
    fail(`${label} is not a complete JPEG`);
  }
  if (mime === 'image/svg+xml' && !/<svg\b/i.test(buffer.toString('utf8'))) fail(`${label} is not SVG content`);
  if (mime === 'image/x-icon' && !(buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1 && buffer.readUInt16LE(4) > 0)) {
    fail(`${label} is not an ICO`);
  }
}

function parseIco(buffer, label) {
  assertMagic(buffer, 'image/x-icon', label);
  const count = buffer.readUInt16LE(4);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const width = buffer[offset] || 256;
    const height = buffer[offset + 1] || 256;
    const bytes = buffer.readUInt32LE(offset + 8);
    const dataOffset = buffer.readUInt32LE(offset + 12);
    entries.push({ width, height, data: buffer.subarray(dataOffset, dataOffset + bytes) });
  }
  if (entries.length === 0 || entries.some((entry) => !entry.data.subarray(0, 8).equals(PNG_SIGNATURE))) {
    fail(`${label} must contain PNG-backed color entries`);
  }
  return entries;
}

async function readAsset(file, label) {
  return readFile(file).catch(() => fail(`missing ${label}`));
}

async function validateInventory(entries, label) {
  validateInventoryShape(entries, label);
  for (const entry of entries) {
    const file = resolve(repoDir, entry.path);
    const stat = await lstat(file).catch(() => fail(`${label} inventory file is missing: ${entry.path}`));
    if ((stat.isSymbolicLink() ? 'symlink' : 'file') !== entry.kind || (stat.mode & 0o7777) !== entry.mode) fail(`${label} inventory metadata changed: ${entry.path}`);
    if (stat.isSymbolicLink()) {
      const target = await readlink(file);
      const resolvedTarget = resolve(file, '..', target);
      if (resolvedTarget !== repoDir && !resolvedTarget.startsWith(`${repoDir}/`)) fail(`${label} symlink escapes repository root: ${entry.path}`);
      if (target !== entry.symlinkTarget || createHash('sha256').update(target).digest('hex') !== entry.sha256) fail(`${label} symlink changed: ${entry.path}`);
      continue;
    }
    const bytes = await readFile(file);
    if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) fail(`${label} bytes changed: ${entry.path}`);
  }
}

async function gitOutput(args) {
  const result = await execFileAsync('git', args, { cwd: repoDir, maxBuffer: 20 * 1024 * 1024 });
  return result.stdout.trim();
}

async function canonicalSourcePaths() {
  const tracked = await gitOutput(['ls-files', '--', ...SOURCE_PATHS]);
  const untracked = await gitOutput(['ls-files', '--others', '--exclude-standard', '--', ...SOURCE_PATHS]);
  return [...tracked.split('\n'), ...untracked.split('\n')]
    .filter((path) => path && !SOURCE_EXCLUDED_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix)))
    .sort()
    .filter((path, index, paths) => path !== paths[index - 1]);
}

async function walkBuildFiles(relativeDir) {
  const files = [];
  for (const entry of await readdir(resolve(repoDir, relativeDir), { withFileTypes: true })) {
    const relativePath = join(relativeDir, entry.name).replaceAll('\\', '/');
    if (relativePath === BUILD_CACHE_PREFIX.slice(0, -1) || relativePath.startsWith(BUILD_CACHE_PREFIX)) continue;
    if (entry.isDirectory()) files.push(...await walkBuildFiles(relativePath));
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(relativePath);
  }
  return files;
}

async function canonicalBuildPaths() {
  return [...await walkBuildFiles('apps/web/.next'), ...BUILD_GENERATED_PATHS]
    .sort()
    .filter((path, index, paths) => path !== paths[index - 1]);
}

async function inventoryPaths(paths) {
  const entries = [];
  for (const path of paths) {
    const stat = await lstat(resolve(repoDir, path)).catch(() => fail(`canonical inventory file is missing: ${path}`));
    if (stat.isSymbolicLink()) {
      const target = await readlink(resolve(repoDir, path));
      entries.push({ path, kind: 'symlink', mode: stat.mode & 0o7777, bytes: 0, sha256: createHash('sha256').update(target).digest('hex'), symlinkTarget: target });
    } else if (stat.isFile()) {
      const bytes = await readFile(resolve(repoDir, path));
      entries.push({ path, kind: 'file', mode: stat.mode & 0o7777, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } else fail(`canonical inventory contains non-file: ${path}`);
  }
  return entries;
}

async function inspectRaster(buffer, asset) {
  assertMagic(buffer, asset.mime, asset.label);
  const image = sharp(buffer);
  const metadata = await image.metadata();
  if (metadata.width !== asset.width || metadata.height !== asset.height) {
    fail(`${asset.label} is ${metadata.width}x${metadata.height}; expected ${asset.width}x${asset.height}`);
  }
  const { data, info } = await image.ensureAlpha().resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const background = asset.background ? hexRgb(asset.background) : null;
  const colors = new Set();
  let minLuma = Number.POSITIVE_INFINITY;
  let maxLuma = Number.NEGATIVE_INFINITY;
  const bounds = { left: info.width, top: info.height, right: -1, bottom: -1 };
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * info.channels;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const alpha = data[index + 3];
      colors.add(`${r},${g},${b}`);
      if (colors.size > 64) colors.delete(colors.values().next().value);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
      const visible = alpha > 20 && (!background || Math.abs(r - background.r) + Math.abs(g - background.g) + Math.abs(b - background.b) > 30);
      if (visible) {
        bounds.left = Math.min(bounds.left, x);
        bounds.top = Math.min(bounds.top, y);
        bounds.right = Math.max(bounds.right, x);
        bounds.bottom = Math.max(bounds.bottom, y);
      }
    }
  }
  const hasColor = !asset.requireColor || (() => {
    for (let index = 0; index < data.length; index += info.channels) {
      if (Math.max(data[index], data[index + 1], data[index + 2]) - Math.min(data[index], data[index + 1], data[index + 2]) >= 24) return true;
    }
    return false;
  })();
  if (bounds.right < 0 || colors.size < 1 || (asset.requireColor && (colors.size < 3 || maxLuma - minLuma < 16 || !hasColor))) {
    fail(`${asset.label} is blank/monochrome (luma spread ${(maxLuma - minLuma).toFixed(1)})`);
  }
  if (asset.margin !== undefined) {
    const marginX = info.width * asset.margin;
    const marginY = info.height * asset.margin;
    if (bounds.left < marginX || bounds.top < marginY || bounds.right >= info.width - marginX || bounds.bottom >= info.height - marginY) {
      fail(`${asset.label} foreground escapes its visual bounds (${JSON.stringify(bounds)})`);
    }
  }
  return { metadata, bounds };
}

async function inspectBuffer(buffer, asset) {
  if (asset.mime === 'image/x-icon') {
    const entries = parseIco(buffer, asset.label);
    const expectedEntries = asset.entries ?? [];
    if (entries.length !== expectedEntries.length) fail(`${asset.label} has ${entries.length} entries; expected ${expectedEntries.length}`);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const expected = expectedEntries[index];
      if (entry.width !== expected.width || entry.height !== expected.height) fail(`${asset.label} entry ${index} has wrong dimensions`);
      await inspectRaster(entry.data, { ...asset, label: `${asset.label} ${entry.width}x${entry.height}`, mime: 'image/png', width: entry.width, height: entry.height, background: BRAND_COLORS.background, margin: 0.05, requireColor: true });
    }
    return;
  }
  await inspectRaster(buffer, asset);
}

async function inspectAsset(asset) {
  await inspectBuffer(await readAsset(asset.file, asset.label), asset);
}

function imageAsset(file, url, label, mime, width, height, options = {}) {
  return { file, url, label, mime, width, height, ...options };
}

function assertManifest(manifest) {
  if (manifest.name !== 'Sploot' || manifest.short_name !== 'Sploot') fail('manifest product name is not canonical Sploot');
  if (manifest.start_url !== '/app' || manifest.scope !== '/' || manifest.display !== 'standalone') fail('manifest start_url/scope/display contract is invalid');
  if (manifest.theme_color !== BRAND_COLORS.background || manifest.background_color !== BRAND_COLORS.paper) fail('manifest colors are stale');
  if (!manifest.description || /your personal meme library|lightning-fast semantic/i.test(manifest.description)) fail('manifest description is stale');
  const icons = new Map((manifest.icons ?? []).map((icon) => [icon.src, icon]));
  for (const icon of PWA_ICONS) {
    const src = `/icons/${icon.name}`;
    const entry = icons.get(src);
    if (!entry || entry.sizes !== `${icon.size}x${icon.size}` || entry.type !== 'image/png' || entry.purpose !== icon.purpose) fail(`manifest icon contract missing/incorrect for ${src}`);
  }
  for (const screenshot of SCREENSHOTS) {
    const src = `/screenshots/${screenshot.name}`;
    const entry = (manifest.screenshots ?? []).find((candidate) => candidate.src === src);
    if (!entry || entry.sizes !== `${screenshot.width}x${screenshot.height}` || entry.type !== 'image/png') fail(`manifest screenshot contract missing/incorrect for ${src}`);
  }
  for (const shortcut of manifest.shortcuts ?? []) {
    const icon = shortcut.icons?.[0];
    if (!icon?.src || icon.type !== 'image/png' || !expectedSize(icon.sizes)) fail(`shortcut ${shortcut.name ?? '<unnamed>'} has invalid icon metadata`);
  }
  const fileParam = manifest.share_target?.params?.files?.[0];
  if (manifest.share_target?.action !== '/share-target' || manifest.share_target.method !== 'POST' || manifest.share_target.enctype !== 'multipart/form-data' || fileParam?.name !== 'images') fail('manifest share_target contract is invalid');
  if (!fileParam.accept?.includes('image/png') || !fileParam.accept?.includes('image/jpeg')) fail('manifest share_target MIME contract is incomplete');
}

async function validateServiceWorker() {
  const source = (await readAsset(SERVICE_WORKER_FILE, 'service worker')).toString('utf8');
  if (!/skipWaiting\s*\(\)/.test(source) || !/clientsClaim\s*\(\)/.test(source)) {
    fail('service worker install/update contract is missing skipWaiting or clientsClaim');
  }
  if (!/precacheAndRoute\s*\(/.test(source)) fail('service worker does not precache the production shell');
  if (!source.includes('user-images') || !source.includes('api-search')) {
    fail('service worker runtime cache contract is incomplete');
  }
}

function localAssets() {
  const assets = [];
  for (const icon of PWA_ICONS) assets.push(imageAsset(join(publicDir, 'icons', icon.name), `/icons/${icon.name}`, icon.name, 'image/png', icon.size, icon.size, { background: BRAND_COLORS.background, margin: 0.1, requireColor: true }));
  for (const icon of SUPPORTING_ICONS) assets.push(imageAsset(join(publicDir, 'icons', icon.name), `/icons/${icon.name}`, icon.name, 'image/png', icon.width ?? icon.size, icon.height ?? icon.size, { background: BRAND_COLORS.background, margin: icon.name === 'mstile-310x150.png' ? 0.08 : 0.05, requireColor: true }));
  // Screenshots intentionally contain full-bleed application chrome and the
  // dotted workbench, so raster foreground cannot be required to have an
  // icon-style inset margin. The capture manifest supplies the stronger
  // rendered bounds proof for actual tiles and viewport overflow.
  for (const screenshot of SCREENSHOTS) assets.push(imageAsset(join(publicDir, 'screenshots', screenshot.name), `/screenshots/${screenshot.name}`, screenshot.name, 'image/png', screenshot.width, screenshot.height, { background: BRAND_COLORS.paper, requireColor: true }));
  assets.push(imageAsset(join(publicDir, 'og-image.png'), '/og-image.png', 'og-image.png', 'image/png', 1200, 630, { requireColor: true }));
  for (const splash of SPLASH_SCREENS) assets.push(imageAsset(join(publicDir, 'splash', splash.name), `/splash/${splash.name}`, splash.name, 'image/jpeg', splash.width, splash.height, { background: BRAND_COLORS.background, margin: 0.05, requireColor: true }));
  for (const svg of SVG_ASSETS) {
    const size = svg.name === 'safari-pinned-tab.svg' ? 16 : svg.name === 'apple-touch-icon-source.svg' ? 180 : 32;
    assets.push(imageAsset(join(publicDir, 'icons', svg.name), `/icons/${svg.name}`, svg.name, 'image/svg+xml', size, size, { background: svg.name === 'apple-touch-icon-source.svg' ? BRAND_COLORS.background : undefined, margin: svg.name === 'safari-pinned-tab.svg' ? 0 : 0.01, requireColor: svg.purpose === 'brand' }));
  }
  assets.push(imageAsset(join(appDir, 'icon.svg'), '/icon.svg', 'app/icon.svg', 'image/svg+xml', 32, 32, { margin: 0.01, requireColor: true }));
  assets.push(imageAsset(join(appDir, 'apple-icon.png'), '/apple-icon.png', 'app/apple-icon.png', 'image/png', 180, 180, { background: BRAND_COLORS.background, margin: 0.05, requireColor: true }));
  assets.push(imageAsset(join(appDir, 'icon-32.png'), '/icon-32.png', 'app/icon-32.png', 'image/png', 32, 32, { background: BRAND_COLORS.background, margin: 0.05, requireColor: true }));
  assets.push(imageAsset(join(appDir, 'icon-192.png'), '/icon-192.png', 'app/icon-192.png', 'image/png', 192, 192, { background: BRAND_COLORS.background, margin: 0.05, requireColor: true }));
  assets.push(imageAsset(join(appDir, 'icon-512.png'), '/icon-512.png', 'app/icon-512.png', 'image/png', 512, 512, { background: BRAND_COLORS.background, margin: 0.05, requireColor: true }));
  const entries = [{ width: 16, height: 16 }, { width: 32, height: 32 }];
  assets.push(imageAsset(join(publicDir, 'icons', 'favicon.ico'), '/icons/favicon.ico', 'public/icons/favicon.ico', 'image/x-icon', 32, 32, { entries, requireColor: true }));
  assets.push(imageAsset(join(appDir, 'favicon.ico'), '/favicon.ico', 'app/favicon.ico', 'image/x-icon', 32, 32, { entries, requireColor: true }));
  return assets;
}

async function validateBrowserConfig() {
  const content = (await readAsset(join(publicDir, 'browserconfig.xml'), 'browserconfig.xml')).toString('utf8');
  if (!/<browserconfig>/.test(content) || !/<TileColor>#1c1547<\/TileColor>/i.test(content)) fail('browserconfig.xml has stale/missing TileColor');
  for (const icon of ['mstile-70x70.png', 'mstile-150x150.png', 'mstile-310x310.png', 'mstile-310x150.png']) {
    if (!content.includes(`/icons/${icon}`)) fail(`browserconfig.xml does not reference ${icon}`);
  }
}

async function validateScreenshotCaptureManifest() {
  const manifest = JSON.parse((await readAsset(CAPTURE_MANIFEST_FILE, 'screenshots/capture-manifest.json')).toString('utf8'));
  if (manifest.captureVersion !== SCREENSHOT_CAPTURE.captureVersion || manifest.source !== 'playwright-rendered-next-app') {
    fail('screenshot capture provenance is missing or not Playwright-rendered');
  }
  if (manifest.seedId !== SCREENSHOT_CAPTURE.seedId || manifest.route !== SCREENSHOT_CAPTURE.route || manifest.userId !== SCREENSHOT_CAPTURE.userId || manifest.assetCount !== SCREENSHOT_CAPTURE.assetCount || manifest.shuffleSeed !== SCREENSHOT_CAPTURE.shuffleSeed) {
    fail('screenshot capture seed/route contract is not canonical');
  }
  if (!/^https?:\/\/[^\s]+\/app$/.test(manifest.url ?? '') || !/^\d{4}-\d{2}-\d{2}T/.test(manifest.timestamp ?? '') || !/^[a-f0-9]{40}$/.test(manifest.gitCommit ?? '') || !/^[a-f0-9]{40}$/.test(manifest.gitTree ?? '') || !/^[a-f0-9]{64}$/.test(manifest.worktreeDigest ?? '') || !Number.isInteger(manifest.digestInputCount) || manifest.digestInputCount < 1) {
    fail('screenshot capture provenance is incomplete');
  }
  if (manifest.serverMode !== 'production-start' || manifest.deploymentIdentity !== 'local-pwa-capture-v1' || manifest.deploymentEnvironment !== 'local-qa' || manifest.audience !== 'sploot-pwa-capture' || manifest.lifecycle?.freshBuild !== true || manifest.lifecycle?.buildCommand !== 'pnpm exec next build --webpack' || manifest.lifecycle?.startCommand !== 'pnpm start -H 127.0.0.1' || manifest.lifecycle?.isolatedHost !== '127.0.0.1' || !Number.isInteger(manifest.lifecycle?.isolatedPort) || manifest.lifecycle?.hmr !== false) {
    fail('screenshot capture does not prove the allowlisted local production deployment seam');
  }
  if (JSON.stringify(manifest.viewportContract) !== JSON.stringify(SCREENSHOTS)) {
    fail('screenshot capture viewport contract is not canonical');
  }
  if (JSON.stringify(manifest.buildInventoryExclusions) !== JSON.stringify(BUILD_INVENTORY_EXCLUSIONS)) fail('screenshot capture build exclusions are missing or unjustified');
  const expectedContract = { captureVersion: SCREENSHOT_CAPTURE.captureVersion, seedId: SCREENSHOT_CAPTURE.seedId, route: SCREENSHOT_CAPTURE.route, userId: SCREENSHOT_CAPTURE.userId, assetCount: SCREENSHOT_CAPTURE.assetCount, shuffleSeed: SCREENSHOT_CAPTURE.shuffleSeed, viewportContract: SCREENSHOTS, serverMode: 'production-start', lifecycle: manifest.lifecycle, buildInventoryExclusions: BUILD_INVENTORY_EXCLUSIONS, deploymentIdentity: 'local-pwa-capture-v1', deploymentEnvironment: 'local-qa', audience: 'sploot-pwa-capture' };
  if (JSON.stringify(manifest.provenanceContract) !== JSON.stringify(expectedContract)) fail('screenshot capture provenance contract is not canonical');
  const mode = await resolveProvenanceMode(manifest);
  validateInventoryShape(manifest.sourceInventory, 'source');
  validateInventoryShape(manifest.buildInventory, 'production build');
  if (manifest.digestInputCount !== manifest.sourceInventory.length + manifest.buildInventory.length) fail('manifest digest input count is incomplete');
  const recomputedDigest = createHash('sha256').update(JSON.stringify({ baseCommit: manifest.gitCommit, baseTree: manifest.gitTree, contract: manifest.provenanceContract, source: manifest.sourceInventory, build: manifest.buildInventory })).digest('hex');
  if (recomputedDigest !== manifest.worktreeDigest) fail('screenshot capture provenance digest does not match its recorded source/build inventory');
  if (mode === 'live') {
    const expectedSource = await inventoryPaths(await canonicalSourcePaths());
    const expectedBuild = await inventoryPaths(await canonicalBuildPaths());
    if (JSON.stringify(manifest.sourceInventory) !== JSON.stringify(expectedSource)) fail('manifest source inventory is not the canonical repository source set');
    if (JSON.stringify(manifest.buildInventory) !== JSON.stringify(expectedBuild)) fail('manifest build inventory is not the complete canonical production artifact');
    await validateInventory(expectedSource, 'source');
    await validateInventory(expectedBuild, 'production build');
    const currentHead = await gitOutput(['rev-parse', 'HEAD']);
    const currentTree = await gitOutput(['rev-parse', 'HEAD^{tree}']);
    if (manifest.gitCommit !== currentHead || manifest.gitTree !== currentTree) fail('capture base commit/tree no longer matches the repository');
  }
  for (const screenshot of SCREENSHOTS) {
    const proof = manifest.screenshots?.[screenshot.name];
    if (!proof || proof.width !== screenshot.width || proof.height !== screenshot.height || proof.theme !== screenshot.theme || !/^[a-f0-9]{64}$/.test(proof.sha256 ?? '')) {
      fail(`screenshot capture proof is missing/incorrect for ${screenshot.name}`);
    }
    const bytes = await readAsset(join(publicDir, 'screenshots', screenshot.name), screenshot.name);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== proof.sha256) fail(`${screenshot.name} does not match its rendered capture proof hash`);
    if (proof.viewportWidth !== screenshot.width || proof.viewportHeight !== screenshot.height || proof.assetCount !== SCREENSHOT_CAPTURE.assetCount || proof.loadedImageCount < 1 || proof.fullyInsideImageCount < SCREENSHOT_CAPTURE.minFullyInsideImages || proof.incompleteVisibleImageCount !== 0 || proof.visibleTileCount < SCREENSHOT_CAPTURE.minVisibleTiles || proof.visibleTileOpacityMin < 0.5 || proof.serviceWorkerScope !== new URL(manifest.url).origin + '/' || proof.serviceWorkerActive !== true || proof.serviceWorkerUpdateAttempted !== true || proof.initialImageRequestCount >= SCREENSHOT_CAPTURE.assetCount || proof.initialImageRequestBytes <= 0 || proof.postScrollImageRequestCount < proof.initialImageRequestCount || proof.postScrollImageRequestCount > SCREENSHOT_CAPTURE.assetCount || !(proof.postScrollLoadedImageCount > proof.initialLoadedImageCount || proof.postScrollQaImageCount > proof.initialQaImageCount || proof.postScrollImageRequestCount > proof.initialImageRequestCount) || !Array.isArray(proof.initialImageRequestUrls) || proof.initialImageRequestUrls.length !== proof.initialImageRequestCount || !Array.isArray(proof.postScrollImageRequestUrls) || proof.postScrollImageRequestUrls.length !== proof.postScrollImageRequestCount || proof.scrollProbeCount < SCREENSHOT_CAPTURE.minScrollProbeCount || !Array.isArray(proof.scrollProbeUrls) || proof.scrollProbeUrls.length !== proof.scrollProbeCount || !Array.isArray(proof.scrollProbes) || proof.scrollProbes.length !== proof.scrollProbeCount || proof.debugOverlayCount !== 0 || proof.hmrRequests !== 0 || proof.responseErrors !== 0 || proof.horizontalOverflowPx > 2 || proof.consoleErrors !== 0 || proof.pageErrors !== 0 || proof.failedRequests !== 0 || proof.abortedRequests !== 0 || !Array.isArray(proof.abortedRequestUrls) || proof.abortedRequestUrls.length !== 0 || proof.assertionWindowClosed !== true || proof.requestFailureAccounting !== 'assertion-window-only' || !Array.isArray(proof.teardownAbortUrls)) {
      fail(`${screenshot.name} capture proof reports incomplete/unstable rendered app state`);
    }
    for (const probe of proof.scrollProbes) {
      if (!probe || typeof probe.assetId !== 'string' || typeof probe.url !== 'string' || !probe.assetId || !probe.url || !probe.settled || probe.naturalWidth <= 0 || probe.naturalHeight <= 0 || !probe.url.includes('/qa-blob-seed/')) {
        fail(`${screenshot.name} scroll probe did not prove lazy-loading settlement`);
      }
    }
  }
}

async function validateLocal() {
  const manifest = JSON.parse((await readAsset(join(publicDir, 'manifest.json'), 'manifest.json')).toString('utf8'));
  assertManifest(manifest);
  await validateServiceWorker();
  await validateBrowserConfig();
  await validateScreenshotCaptureManifest();
  const assets = localAssets();
  for (const asset of assets) await inspectAsset(asset);
  console.log(`Local PWA assets PASS: ${assets.length} decoded PNG/JPEG/SVG/ICO resources.`);
  return { manifest, assets };
}

function expectedRemoteMime(asset) {
  if (asset.mime === 'image/x-icon') return ['image/x-icon', 'image/vnd.microsoft.icon'];
  return [asset.mime];
}

async function validateRemote(baseUrl, local) {
  const origin = new URL(baseUrl);
  origin.pathname = '/';
  const manifestResponse = await fetch(new URL('/manifest.json', origin), { redirect: 'error' });
  if (!manifestResponse.ok) fail(`remote manifest returned HTTP ${manifestResponse.status}`);
  if (!['application/manifest+json', 'application/json'].includes(manifestResponse.headers.get('content-type')?.split(';')[0])) fail('remote manifest MIME type is invalid');
  assertManifest(await manifestResponse.json());
  for (const asset of local.assets) {
    const response = await fetch(new URL(asset.url, origin), { redirect: 'error' });
    if (!response.ok) fail(`remote ${asset.url} returned HTTP ${response.status}`);
    const contentType = response.headers.get('content-type')?.split(';')[0];
    if (!expectedRemoteMime(asset).includes(contentType)) fail(`remote ${asset.url} returned ${contentType}; expected ${asset.mime}`);
    await inspectBuffer(Buffer.from(await response.arrayBuffer()), { ...asset, label: `remote ${asset.url}` });
  }
  const browserConfig = await fetch(new URL('/browserconfig.xml', origin), { redirect: 'error' });
  if (!browserConfig.ok || !['application/xml', 'text/xml'].includes(browserConfig.headers.get('content-type')?.split(';')[0])) fail('remote browserconfig.xml MIME/status is invalid');
  const browserConfigText = await browserConfig.text();
  if (!/<TileColor>#1c1547<\/TileColor>/i.test(browserConfigText)) fail('remote browserconfig.xml theme is stale');
  const shareTargetUrl = new URL('/share-target', origin);
  const getResponse = await fetch(shareTargetUrl, { redirect: 'manual' });
  const getLocation = getResponse.headers.get('location');
  if (getResponse.status !== 307 || !getLocation || new URL(getLocation, origin).pathname !== '/app') fail('remote share-target GET auth/navigation contract is invalid');
  const form = new FormData();
  form.append('images', new Blob([VALID_PNG], { type: 'image/png' }), 'contract.png');
  const postResponse = await fetch(shareTargetUrl, { method: 'POST', body: form, redirect: 'manual' });
  const postLocation = postResponse.headers.get('location');
  if (postResponse.status !== 303 || !postLocation || new URL(postLocation, origin).pathname !== '/sign-in') fail('remote unauthenticated share-target POST boundary is invalid');
  console.log(`Remote PWA resources/auth boundary PASS: ${baseUrl}`);
}

const baseUrlArg = process.argv.find((arg) => arg.startsWith('--base-url='));
try {
  const local = await validateLocal();
  if (baseUrlArg) await validateRemote(baseUrlArg.slice('--base-url='.length), local);
  console.log('PWA contract PASS: manifest, metadata assets, visual bounds, and share_target validated.');
} catch (error) {
  console.error(`PWA contract FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
