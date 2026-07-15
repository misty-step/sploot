import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const script = resolve(webRoot, 'scripts/validate-pwa-assets.mjs');
const serviceWorkerFixture = resolve(webRoot, '__tests__/fixtures/generated-pwa-worker.js');
const validatorEnv = { ...process.env, PWA_SERVICE_WORKER_FILE: serviceWorkerFixture };

interface InventoryEntry {
  path: string;
  kind: 'file' | 'symlink';
  mode: number;
  bytes: number;
  sha256: string;
  symlinkTarget?: string;
}

interface CaptureManifest {
  sourceInventory: InventoryEntry[];
  buildInventory: InventoryEntry[];
  digestInputCount: number;
  worktreeDigest: string;
  gitCommit: string;
  gitTree: string;
  provenanceContract: unknown;
  [key: string]: unknown;
}

// The live provenance tier (byte-exact source/build inventories bound to
// HEAD) only holds in the capture state: production build on disk and HEAD
// equal to the manifest's base commit. The capture rig enforces that tier
// nonzero at generation time; here the live mutation regressions run whenever
// the repository is still in that state and are skipped (loudly) otherwise.
const captureManifest = JSON.parse(readFileSync(resolve(webRoot, 'public/screenshots/capture-manifest.json'), 'utf8'));
const buildPresent = existsSync(resolve(webRoot, '.next/BUILD_ID'));
const headCommit = execSync('git rev-parse HEAD', { cwd: webRoot, encoding: 'utf8' }).trim();
const liveCaptureState = buildPresent && headCommit === captureManifest.gitCommit;
if (!liveCaptureState) {
  console.log(`pwa-contract: live provenance mutation tests skipped (buildPresent=${buildPresent}, capture base ${String(captureManifest.gitCommit).slice(0, 12)} vs HEAD ${headCommit.slice(0, 12)}); the capture rig enforces the live tier at generation time`);
}

describe('PWA install/share-target contract', () => {
  it('validates source-controlled install assets with a representative generated worker', () => {
    const output = execFileSync(process.execPath, [script], {
      cwd: webRoot,
      env: validatorEnv,
      encoding: 'utf8',
      timeout: 60_000,
    });

    expect(output).toContain('PWA contract PASS');
    expect(output).toMatch(/Provenance mode: (live|recorded) /);
    if (liveCaptureState) {
      expect(output).toContain('Provenance mode: live');
    }
  }, 60_000);

  it('rejects planted abort and provenance-digest mutations', () => {
    const original = JSON.parse(readFileSync(resolve(webRoot, 'public/screenshots/capture-manifest.json'), 'utf8')) as CaptureManifest;
    const tempDir = mkdtempSync(join(webRoot, '.pwa-contract-'));
    try {
      const aborted = structuredClone(original);
      aborted.screenshots['desktop-home.png'].abortedRequests = 1;
      const abortedPath = join(tempDir, 'aborted.json');
      writeFileSync(abortedPath, JSON.stringify(aborted));
      expect(() => execFileSync(process.execPath, [script], { cwd: webRoot, env: { ...validatorEnv, PWA_CAPTURE_MANIFEST: abortedPath }, stdio: 'pipe' })).toThrow();

      const digest = structuredClone(original);
      digest.worktreeDigest = '0'.repeat(64);
      const digestPath = join(tempDir, 'digest.json');
      writeFileSync(digestPath, JSON.stringify(digest));
      expect(() => execFileSync(process.execPath, [script], { cwd: webRoot, env: { ...validatorEnv, PWA_CAPTURE_MANIFEST: digestPath }, stdio: 'pipe' })).toThrow();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('rejects a corrupted generated service worker', () => {
    const source = readFileSync(serviceWorkerFixture, 'utf8');
    const tempDir = mkdtempSync(join(webRoot, '.pwa-contract-'));
    const serviceWorkerPath = join(tempDir, 'sw.js');
    try {
      writeFileSync(serviceWorkerPath, source.replace('skipWaiting()', 'skipWaiting /* corrupted */'));
      expect(() => execFileSync(process.execPath, [script], {
        cwd: webRoot,
        env: { ...validatorEnv, PWA_SERVICE_WORKER_FILE: serviceWorkerPath },
        stdio: 'pipe',
      })).toThrow();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps theme identity aligned across manifest, browserconfig, and root metadata', () => {
    const manifest = JSON.parse(readFileSync(resolve(webRoot, 'public/manifest.json'), 'utf8'));
    const browserConfig = readFileSync(resolve(webRoot, 'public/browserconfig.xml'), 'utf8');
    const layout = readFileSync(resolve(webRoot, 'app/layout.tsx'), 'utf8');

    expect(manifest.name).toBe('Sploot');
    expect(manifest.short_name).toBe('Sploot');
    expect(manifest.theme_color).toBe('#1c1547');
    expect(manifest.background_color).toBe('#cfe7ff');
    expect(browserConfig).toContain('<TileColor>#1c1547</TileColor>');
    expect(layout).toContain('PRODUCT_THEME_COLOR');
    expect(layout).toContain('apple-mobile-web-app-title');
  });

  it('rejects manifest inventory omission, injection, and outside-root paths', () => {
    const original = JSON.parse(readFileSync(resolve(webRoot, 'public/screenshots/capture-manifest.json'), 'utf8')) as CaptureManifest;
    const tempDir = mkdtempSync(join(webRoot, '.pwa-contract-'));
    let mutationIndex = 0;
    const recomputeDigest = (manifest: CaptureManifest): void => {
      manifest.digestInputCount = manifest.sourceInventory.length + manifest.buildInventory.length;
      manifest.worktreeDigest = createHash('sha256').update(JSON.stringify({
        baseCommit: manifest.gitCommit,
        baseTree: manifest.gitTree,
        contract: manifest.provenanceContract,
        source: manifest.sourceInventory,
        build: manifest.buildInventory,
      })).digest('hex');
    };
    const expectReject = (mutate: (manifest: CaptureManifest) => void, shouldRecomputeDigest = true) => {
      const mutated = structuredClone(original);
      mutate(mutated);
      if (shouldRecomputeDigest) recomputeDigest(mutated);
      const path = join(tempDir, `${mutationIndex++}.json`);
      writeFileSync(path, JSON.stringify(mutated));
      expect(() => execFileSync(process.execPath, [script], { cwd: webRoot, env: { ...validatorEnv, PWA_CAPTURE_MANIFEST: path }, stdio: 'pipe' })).toThrow();
    };
    try {
      expectReject((manifest) => {
        delete (manifest as unknown as { sourceInventory?: InventoryEntry[] }).sourceInventory;
      }, false);
      expectReject((manifest) => { manifest.sourceInventory.pop(); });
      expectReject((manifest) => { manifest.buildInventory.push({ path: 'apps/web/.next/injected.js', kind: 'file', mode: 420, bytes: 0, sha256: '0'.repeat(64) }); });
      expectReject((manifest) => { manifest.sourceInventory[0].path = '../../outside'; });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('rejects an absent or fabricated recorded Git base', () => {
    const original = JSON.parse(readFileSync(resolve(webRoot, 'public/screenshots/capture-manifest.json'), 'utf8')) as CaptureManifest;
    const tempDir = mkdtempSync(join(webRoot, '.pwa-contract-'));
    try {
      const mutated = structuredClone(original);
      mutated.gitCommit = 'f'.repeat(40);
      mutated.gitTree = 'f'.repeat(40);
      mutated.digestInputCount = mutated.sourceInventory.length + mutated.buildInventory.length;
      mutated.worktreeDigest = createHash('sha256').update(JSON.stringify({
        baseCommit: mutated.gitCommit,
        baseTree: mutated.gitTree,
        contract: mutated.provenanceContract,
        source: mutated.sourceInventory,
        build: mutated.buildInventory,
      })).digest('hex');
      const manifestPath = join(tempDir, 'fabricated-base.json');
      writeFileSync(manifestPath, JSON.stringify(mutated));

      let failure = '';
      try {
        execFileSync(process.execPath, [script], {
          cwd: webRoot,
          env: { ...validatorEnv, PWA_CAPTURE_MANIFEST: manifestPath },
          stdio: 'pipe',
        });
      } catch (error) {
        failure = typeof error === 'object' && error !== null && 'stderr' in error
          ? String(error.stderr)
          : String(error);
      }
      expect(failure).toContain('recorded provenance base tree is not an authoritative Git tree');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 30_000);

});
