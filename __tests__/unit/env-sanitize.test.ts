/**
 * Environment variable configuration tests
 *
 * NOTE: This file used to test runtime sanitization (stripping channel_binding,
 * adding pgbouncer=true). That sanitization was removed in 2025-11-25 because
 * it ran at the wrong layer (Node.js after Prisma's Rust engine read env vars).
 *
 * Now we only test configuration detection (is DATABASE_URL set?).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

const validDatabaseUrl = 'postgresql://user:pass@ep-broad-credit-adnne0ox-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true';
const placeholderUrl = 'postgresql://your_postgres_url';

describe('lib/env configuration detection', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('detects DATABASE_URL is configured', async () => {
    process.env.DATABASE_URL = validDatabaseUrl;

    const env = await import('@/lib/env');

    expect(env.databaseConfigured).toBe(true);
  });

  it('detects DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;

    const env = await import('@/lib/env');

    expect(env.databaseConfigured).toBe(false);
  });

  it('detects DATABASE_URL is a placeholder', async () => {
    process.env.DATABASE_URL = placeholderUrl;

    const env = await import('@/lib/env');

    expect(env.databaseConfigured).toBe(false);
  });
});
