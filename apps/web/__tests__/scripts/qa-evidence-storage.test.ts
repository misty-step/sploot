import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allocatePacketDir, parseArgs } from '../../scripts/qa-evidence';

describe('qa-evidence storage allocation and validation', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = join(tmpdir(), `sploot-qa-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  });

  describe('default unique directory allocation', () => {
    it('allocates distinct directories for separate runs with the same slug and date', async () => {
      const fixedDate = new Date('2026-09-07T12:00:00Z');
      const dir1 = await allocatePacketDir({ slug: 'smoke' }, tempRoot, fixedDate);
      const dir2 = await allocatePacketDir({ slug: 'smoke' }, tempRoot, fixedDate);

      expect(dir1).not.toBe(dir2);
      expect(existsSync(dir1)).toBe(true);
      expect(existsSync(dir2)).toBe(true);
      expect(dir1).toContain(join(tempRoot, '.sploot-local', 'qa-evidence', '2026-09-07-smoke-'));
      expect(dir2).toContain(join(tempRoot, '.sploot-local', 'qa-evidence', '2026-09-07-smoke-'));
    });
  });

  describe('custom --out-dir allocation', () => {
    it('creates an exact custom directory when it does not exist', async () => {
      const customPath = join(tempRoot, 'custom-packet-dir');
      const result = await allocatePacketDir({ slug: 'smoke', outDir: customPath }, tempRoot);

      expect(result).toBe(customPath);
      expect(existsSync(customPath)).toBe(true);
    });

    it('rejects an existing --out-dir to prevent overwriting evidence', async () => {
      const customPath = join(tempRoot, 'existing-packet-dir');
      await allocatePacketDir({ slug: 'smoke', outDir: customPath }, tempRoot);
      expect(existsSync(customPath)).toBe(true);

      await expect(
        allocatePacketDir({ slug: 'smoke', outDir: customPath }, tempRoot)
      ).rejects.toThrow(/EEXIST/);
    });
  });

  describe('parseArgs --out-dir validation', () => {
    it('parses --out-dir flag correctly', () => {
      const args = parseArgs(['--slug', 'smoke', '--intent', 'verifying', '--out-dir', 'custom/dir']);
      expect(args.outDir).toBe('custom/dir');
      expect(args.slug).toBe('smoke');
      expect(args.intent).toBe('verifying');
    });

    it('throws when --out-dir value is missing', () => {
      expect(() => parseArgs(['--slug', 'smoke', '--intent', 'verifying', '--out-dir'])).toThrow(
        '--out-dir requires an exact new packet directory'
      );
    });

    it('throws when --out-dir is followed immediately by another flag', () => {
      expect(() =>
        parseArgs(['--slug', 'smoke', '--intent', 'verifying', '--out-dir', '--gates'])
      ).toThrow('--out-dir requires an exact new packet directory');
    });
  });
});
