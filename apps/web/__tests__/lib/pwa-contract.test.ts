import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const script = resolve(webRoot, 'scripts/validate-pwa-assets.mjs');

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
  it('validates the same local resources used by an installed app', () => {
    const output = execFileSync(process.execPath, [script], {
      cwd: webRoot,
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
    const original = JSON.parse(readFileSync(resolve(webRoot, 'public/screenshots/capture-manifest.json'), 'utf8'));
    const tempDir = mkdtempSync(join(webRoot, '.pwa-contract-'));
    let mutationIndex = 0;
    try {
      const aborted = structuredClone(original);
      aborted.screenshots['desktop-home.png'].abortedRequests = 1;
      const abortedPath = join(tempDir, 'aborted.json');
      writeFileSync(abortedPath, JSON.stringify(aborted));
      expect(() => execFileSync(process.execPath, [script], { cwd: webRoot, env: { ...process.env, PWA_CAPTURE_MANIFEST: abortedPath }, stdio: 'pipe' })).toThrow();

      const digest = structuredClone(original);
      digest.worktreeDigest = '0'.repeat(64);
      const digestPath = join(tempDir, 'digest.json');
      writeFileSync(digestPath, JSON.stringify(digest));
      expect(() => execFileSync(process.execPath, [script], { cwd: webRoot, env: { ...process.env, PWA_CAPTURE_MANIFEST: digestPath }, stdio: 'pipe' })).toThrow();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('rejects a corrupted generated service worker', () => {
    const source = readFileSync(resolve(webRoot, 'public/sw.js'), 'utf8');
    const tempDir = mkdtempSync(join(webRoot, '.pwa-contract-'));
    const serviceWorkerPath = join(tempDir, 'sw.js');
    try {
      writeFileSync(serviceWorkerPath, source.replace('skipWaiting()', 'skipWaiting /* corrupted */'));
      expect(() => execFileSync(process.execPath, [script], {
        cwd: webRoot,
        env: { ...process.env, PWA_SERVICE_WORKER_FILE: serviceWorkerPath },
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
    const original = JSON.parse(readFileSync(resolve(webRoot, 'public/screenshots/capture-manifest.json'), 'utf8'));
    const tempDir = mkdtempSync(join(webRoot, '.pwa-contract-'));
    let mutationIndex = 0;
    const expectReject = (mutate: (manifest: any) => void) => {
      const mutated = structuredClone(original);
      mutate(mutated);
      const path = join(tempDir, `${mutationIndex++}.json`);
      writeFileSync(path, JSON.stringify(mutated));
      expect(() => execFileSync(process.execPath, [script], { cwd: webRoot, env: { ...process.env, PWA_CAPTURE_MANIFEST: path }, stdio: 'pipe' })).toThrow();
    };
    try {
      expectReject((manifest) => { manifest.sourceInventory.pop(); });
      expectReject((manifest) => { manifest.buildInventory.push({ path: 'apps/web/.next/injected.js', kind: 'file', mode: 420, bytes: 0, sha256: '0'.repeat(64) }); });
      expectReject((manifest) => { manifest.sourceInventory[0].path = '../../outside'; });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 30_000);

  it.skipIf(!liveCaptureState)('rejects planted source, lockfile, server-chunk, and static-chunk mutations (live capture state)', () => {
    const manifest = JSON.parse(readFileSync(resolve(webRoot, 'public/screenshots/capture-manifest.json'), 'utf8'));
    const repoRoot = resolve(webRoot, '../..');
    const paths = [
      resolve(repoRoot, 'packages/common/src/constants.ts'),
      resolve(repoRoot, 'pnpm-lock.yaml'),
      resolve(repoRoot, manifest.buildInventory.find((entry: any) => entry.kind === 'file' && entry.path.includes('/.next/server/'))?.path ?? ''),
      resolve(repoRoot, manifest.buildInventory.find((entry: any) => entry.kind === 'file' && entry.path.includes('/.next/static/'))?.path ?? ''),
    ];
    const originals = paths.map((path) => readFileSync(path));
    try {
      paths.forEach((path) => {
        const bytes = Buffer.from(readFileSync(path));
        bytes[bytes.length - 1] ^= 1;
        writeFileSync(path, bytes);
        expect(() => execFileSync(process.execPath, [script, '--provenance=live'], { cwd: webRoot, stdio: 'pipe' })).toThrow();
        writeFileSync(path, originals[paths.indexOf(path)]);
      });
    } finally {
      paths.forEach((path, index) => writeFileSync(path, originals[index]));
    }
  }, 120_000);
});
