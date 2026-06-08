import { afterEach, describe, expect, it, vi } from 'vitest';

async function importAppUrl() {
  vi.resetModules();
  return await import('./app-url');
}

describe('getSplootAppUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the configured API origin for the library URL', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_contract');
    vi.stubEnv('VITE_CLERK_SYNC_HOST', 'http://localhost:3001');
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3001');

    const { getSplootAppUrl } = await importAppUrl();

    expect(getSplootAppUrl()).toBe('http://localhost:3001/app');
  });

  it('uses the configured API origin for the web sign-in URL', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_contract');
    vi.stubEnv('VITE_CLERK_SYNC_HOST', 'http://localhost:3001');
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3001');

    const { getSplootSignInUrl } = await importAppUrl();

    expect(getSplootSignInUrl()).toBe('http://localhost:3001/sign-in');
  });

  it('throws a diagnostic configuration error instead of silently routing to production', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_CLERK_SYNC_HOST', '');
    vi.stubEnv('VITE_API_BASE_URL', '');

    const { getSplootAppUrl } = await importAppUrl();

    expect(() => getSplootAppUrl()).toThrow(
      'VITE_CLERK_PUBLISHABLE_KEY not configured; VITE_CLERK_SYNC_HOST not configured; VITE_API_BASE_URL not configured'
    );
  });
});
