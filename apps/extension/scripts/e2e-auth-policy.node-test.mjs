import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('production and manifest-check builds reject the E2E-only auth seam', () => {
  for (const mode of ['production', 'manifest-check']) {
    const result = spawnSync('wxt', ['build'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: {
        ...process.env,
        WXT_MODE: mode,
        VITE_E2E_AUTH_MODE: 'true',
        VITE_CLERK_PUBLISHABLE_KEY: mode === 'production' ? 'pk_live_policy' : 'pk_test_policy',
        VITE_API_BASE_URL: 'https://www.sploot.app',
        VITE_CLERK_SYNC_HOST: 'https://clerk.sploot.app',
      },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, `${mode} build unexpectedly accepted E2E auth`);
    assert.match(`${result.stdout}\n${result.stderr}`, /VITE_E2E_AUTH_MODE is test-only/);
  }
});
