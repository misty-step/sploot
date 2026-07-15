import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const script = resolve(webRoot, 'scripts/validate-pwa-assets.mjs');

describe('PWA install/share-target contract', () => {
  it('validates the same local resources used by an installed app', () => {
    const output = execFileSync(process.execPath, [script], {
      cwd: webRoot,
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(output).toContain('PWA contract PASS');
  }, 30_000);

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

  it('rejects planted source, lockfile, server-chunk, and static-chunk mutations', () => {
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
        expect(() => execFileSync(process.execPath, [script], { cwd: webRoot, stdio: 'pipe' })).toThrow();
        writeFileSync(path, originals[paths.indexOf(path)]);
      });
    } finally {
      paths.forEach((path, index) => writeFileSync(path, originals[index]));
    }
  }, 60_000);
});
