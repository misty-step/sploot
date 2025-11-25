import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

const neonUrl = 'postgresql://user:pass@ep-broad-credit-adnne0ox-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

describe('lib/env postgres sanitization', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('strips channel_binding=require to keep pgbouncer happy', async () => {
    process.env.POSTGRES_URL = neonUrl;
    process.env.POSTGRES_URL_NON_POOLING = neonUrl;

    const env = await import('@/lib/env');

    expect(process.env.POSTGRES_URL).not.toContain('channel_binding=require');
    expect(process.env.POSTGRES_URL_NON_POOLING).not.toContain('channel_binding=require');
    expect(env.databaseConfigured).toBe(true);
  });

  it('backfills and sanitizes non-pooling URL when only pooled URL is set', async () => {
    process.env.POSTGRES_URL = neonUrl;
    delete process.env.POSTGRES_URL_NON_POOLING;

    const env = await import('@/lib/env');

    expect(process.env.POSTGRES_URL_NON_POOLING).toBeDefined();
    expect(process.env.POSTGRES_URL_NON_POOLING).not.toContain('channel_binding=require');
    expect(env.databaseConfigured).toBe(true);
  });
});

