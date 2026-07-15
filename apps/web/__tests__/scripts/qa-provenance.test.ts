import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCanonicalArtifactRoot,
  assertExactDigestEntries,
  assertExactDigestPaths,
  canonicalStandaloneRoot,
  digestPaths,
  verifyQaProvenanceManifest,
  createQaProvenanceManifest,
} from '@/scripts/qa-provenance';

describe('QA capture provenance', () => {
  it('detects a planted source mutation in the digest input', () => {
    const root = mkdtempSync(join(tmpdir(), 'sploot-provenance-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/gallery.ts'), 'export const revision = 1;\n');

    const before = digestPaths(root, ['src/gallery.ts']);
    writeFileSync(join(root, 'src/gallery.ts'), 'export const revision = 2;\n');
    const after = digestPaths(root, ['src/gallery.ts']);

    expect(before.files).not.toEqual(after.files);
    expect(before.digest).not.toBe(after.digest);
    expect(before.digest).toBeTruthy();
    expect(after.digest).toBeTruthy();
  });

  it('rejects a forged manifest that omits a changed source path', () => {
    const entries = digestPaths('/tmp', ['sploot-gallery/apps/web/package.json']).files;
    expect(() => assertExactDigestPaths('source', ['apps/web/package.json', 'apps/web/page.tsx'], entries))
      .toThrow(/path set/);
  });

  it('rejects swapped path kinds and altered bytes', () => {
    const root = mkdtempSync(join(tmpdir(), 'sploot-provenance-kind-'));
    writeFileSync(join(root, 'gallery.ts'), 'export const revision = 1;\n');
    const actual = digestPaths(root, ['gallery.ts']).files;
    const swapped = [{ ...actual[0], kind: 'symlink' as const, target: 'elsewhere' }];
    expect(() => assertExactDigestEntries('source', actual, swapped)).toThrow(/digest entries/);
    const altered = [{ ...actual[0], bytes: '0'.repeat(64) }];
    expect(() => assertExactDigestEntries('source', actual, altered)).toThrow(/digest entries/);
  });

  it('rejects outside and symlink artifact roots before accepting a manifest', () => {
    const repositoryRoot = process.cwd().replace(/\/apps\/web$/, '');
    expect(() => assertCanonicalArtifactRoot(repositoryRoot, '../../outside'))
      .toThrow(/canonical standalone root/);
    expect(() => assertCanonicalArtifactRoot(repositoryRoot, 'apps/web/.next/standalone'))
      .toThrow(/canonical standalone root/);
  });

  it('rejects a manifest altered after build', () => {
    const repositoryRoot = process.cwd().replace(/\/apps\/web$/, '');
    if (!existsSync(canonicalStandaloneRoot(repositoryRoot))) return;
    const manifest = createQaProvenanceManifest(repositoryRoot, canonicalStandaloneRoot(repositoryRoot));
    const altered = { ...manifest, artifactDigest: 'f'.repeat(64) };
    expect(() => verifyQaProvenanceManifest(repositoryRoot, altered)).toThrow(/built artifact changed/);
  });
});
