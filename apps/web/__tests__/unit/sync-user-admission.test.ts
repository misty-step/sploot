import { afterEach, describe, expect, it, vi } from 'vitest';

describe('syncUser enrollment admission', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/lib/env');
  });

  it('fails closed in production when Prisma is unavailable', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({ databaseConfigured: false }));
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const { syncUser } = await import('@/lib/db');

      await expect(syncUser('production-user', 'production-user@example.test'))
        .rejects.toMatchObject({ code: 'enrollment_unavailable' });
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
