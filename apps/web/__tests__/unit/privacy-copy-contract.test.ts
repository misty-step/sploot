import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');

const publicCopyFiles = [
  'app/page.tsx',
  'app/privacy/page.tsx',
  'app/support/page.tsx',
  '../extension/CHROME_WEB_STORE_LISTING.md',
  '../extension/STORE_LISTING.md',
];

function listSourceFiles(relativeDir: string): string[] {
  const absoluteDir = resolve(root, relativeDir);
  return readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDir}/${entry.name}`;

    if (entry.isDirectory()) {
      return listSourceFiles(relativePath);
    }

    return /\.(ts|tsx|md)$/.test(entry.name) ? [relativePath] : [];
  });
}

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('privacy copy contract', () => {
  it('does not publish privacy claims stronger than runtime behavior', () => {
    const forbiddenClaims = [
      'no tracking',
      'zero tracking',
      'do not store or log your search queries',
      'no analytics or tracking beyond standard auth flow',
      'no tracking or analytics on your images',
      'never shared with third parties',
      'no image sharing',
      'only accessible to you',
      'only you can access',
    ];

    const files = [...publicCopyFiles, ...listSourceFiles('components/landing')];

    for (const file of files) {
      const content = read(file).toLowerCase();
      for (const claim of forbiddenClaims) {
        expect(content, `${file} must not contain "${claim}"`).not.toContain(claim);
      }
    }
  });

  it('discloses current search logging, analytics, and diagnostic services', () => {
    const privacy = read('app/privacy/page.tsx');

    expect(privacy).toContain('search logs');
    expect(privacy).toContain('global popular search suggestions');
    expect(privacy).toContain('may be visible to other signed-in users');
    expect(privacy).toContain('30 days');
    expect(privacy).toContain('Replicate');
    expect(privacy).toContain('Processed by Replicate');
    expect(privacy).toContain('DigitalOcean');
    expect(privacy).toContain('Vercel Blob');
    expect(privacy).toContain('First-party telemetry');
    expect(privacy).toContain('Canary');
    expect(privacy).toContain('Shareable through public links when you choose to share them');
  });

  it('schedules the retention job promised by the privacy policy', () => {
    const schedules = JSON.parse(read('cron-schedules.json')) as Array<{
      path?: string;
      schedule?: string;
    }>;

    expect(schedules).toContainEqual(
      expect.objectContaining({
        path: '/api/cron/purge-search-logs',
        schedule: '0 4 * * *',
      })
    );
    expect(schedules).toContainEqual(
      expect.objectContaining({
        path: '/api/cron/process-storage-cleanup',
        schedule: '*/5 * * * *',
      })
    );

  });
});
