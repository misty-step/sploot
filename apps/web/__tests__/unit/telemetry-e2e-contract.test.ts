import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('telemetry Playwright project contract', () => {
  it('selects the production-start auth server without changing public-truth defaults', () => {
    const webPackage = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
    const playwright = read('playwright.config.ts');
    const workflow = read('../../.github/workflows/ci.yml');

    expect(webPackage.scripts?.['e2e:auth']).toBe('playwright test --config playwright.config.ts --project=auth');
    expect(webPackage.scripts?.['e2e:public-truth']).toContain('--project=public-truth');
    expect(webPackage.scripts?.['e2e:portable-telemetry']).toBe(
      'PLAYWRIGHT_PROJECT=portable-telemetry playwright test --config playwright.config.ts --project=portable-telemetry',
    );
    expect(webPackage.scripts?.['e2e:auth']?.split(' ')).toEqual([
      'playwright', 'test', '--config', 'playwright.config.ts', '--project=auth',
    ]);
    expect(playwright).toContain("name: 'public-truth'");
    expect(playwright).toContain("name: 'auth'");
    expect(playwright).toContain("arg === '--project=auth'");
    expect(playwright).toContain("pnpm --filter web build && PORT=' + port + ' pnpm --filter web start --hostname 127.0.0.1");
    expect(playwright).toContain("const webServerUrl = authProjectSelected ? baseURL + '/api/health/live' : baseURL;");
    expect(playwright).toContain('url: webServerUrl');
    expect(playwright).toContain("SPLOOT_PUBLIC_TRUTH_E2E_BUILD: authProjectSelected ? 'false' : 'true'");
    expect(playwright).toContain("NEXT_PUBLIC_TELEMETRY_ENDPOINT: '/api/telemetry'");
    expect(workflow).toContain('pnpm --filter web e2e:portable-telemetry');
  });
});
