import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies before importing PgNotifyListener
vi.mock('pg', () => ({
  Client: vi.fn(),
}));

vi.mock('@/lib/sse-broadcaster', () => ({
  broadcastEmbeddingUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
}));

vi.mock('@/lib/observability-logger', () => ({
  logger: {
    logInfo: vi.fn(),
    logError: vi.fn(),
  },
}));

describe('PgNotifyListener', () => {
  let PgNotifyListener: typeof import('@/lib/pg-notify-listener').PgNotifyListener;
  let getPgNotifyListener: typeof import('@/lib/pg-notify-listener').getPgNotifyListener;

  const originalEnv = process.env.DATABASE_URL_DIRECT;

  beforeEach(async () => {
    vi.resetModules();
    const pgNotifyModule = await import('@/lib/pg-notify-listener');
    PgNotifyListener = pgNotifyModule.PgNotifyListener;
    getPgNotifyListener = pgNotifyModule.getPgNotifyListener;
  });

  afterEach(() => {
    process.env.DATABASE_URL_DIRECT = originalEnv;
    vi.clearAllMocks();
  });

  describe('constructor validation', () => {
    it('throws when no connection string provided', () => {
      expect(() => new PgNotifyListener()).toThrow(
        'PgNotifyListener requires explicit non-pooled connection string'
      );
      expect(() => new PgNotifyListener()).toThrow('LISTEN/NOTIFY is incompatible with PgBouncer pooling');
    });

    it('throws when pooled connection detected via pgbouncer=true parameter', () => {
      const pooledUrl = 'postgresql://user:pass@host.neon.tech/db?pgbouncer=true';
      expect(() => new PgNotifyListener(pooledUrl)).toThrow('cannot use pooled connection');
      expect(() => new PgNotifyListener(pooledUrl)).toThrow('detected pgbouncer=true');
    });

    it('throws when pooled connection detected via -pooler hostname', () => {
      const pooledUrl = 'postgresql://user:pass@ep-xxx-pooler.neon.tech/db';
      expect(() => new PgNotifyListener(pooledUrl)).toThrow('cannot use pooled connection');
      expect(() => new PgNotifyListener(pooledUrl)).toThrow('direct database endpoint');
    });

    it('accepts valid non-pooled connection string without pgbouncer parameter', () => {
      const directUrl = 'postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require';
      expect(() => new PgNotifyListener(directUrl)).not.toThrow();
    });

    it('accepts valid non-pooled connection string without -pooler in hostname', () => {
      const directUrl = 'postgresql://user:pass@host.neon.tech/db';
      expect(() => new PgNotifyListener(directUrl)).not.toThrow();
    });
  });

  describe('getPgNotifyListener factory', () => {
    it('throws when DATABASE_URL_DIRECT env var is not set', () => {
      delete process.env.DATABASE_URL_DIRECT;

      expect(() => getPgNotifyListener()).toThrow('DATABASE_URL_DIRECT environment variable required');
      expect(() => getPgNotifyListener()).toThrow('LISTEN/NOTIFY requires a direct (non-pooled) database connection');
    });

    it('throws when DATABASE_URL_DIRECT contains pooler endpoint', () => {
      process.env.DATABASE_URL_DIRECT = 'postgresql://user:pass@ep-xxx-pooler.neon.tech/db';

      expect(() => getPgNotifyListener()).toThrow('cannot use pooled connection');
    });

    it('throws when DATABASE_URL_DIRECT contains pgbouncer=true', () => {
      process.env.DATABASE_URL_DIRECT = 'postgresql://user:pass@host.neon.tech/db?pgbouncer=true';

      expect(() => getPgNotifyListener()).toThrow('cannot use pooled connection');
    });

    it('creates instance successfully with valid DATABASE_URL_DIRECT', () => {
      process.env.DATABASE_URL_DIRECT = 'postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require';

      expect(() => getPgNotifyListener()).not.toThrow();
    });
  });
});
