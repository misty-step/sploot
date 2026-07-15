import { GET, HEAD } from '@/app/api/health/route';
import { createMockRequest } from '../utils/test-helpers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { $queryRaw: vi.fn(), $disconnect: vi.fn(), $connect: vi.fn() },
}));

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: unknown) => handler,
}));

vi.mock('@/lib/canary-reporter', () => ({
  canaryConfigured: vi.fn(() => false),
  reportCanaryCheckIn: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/package.json', () => ({
  default: { version: '0.1.0' },
}));

vi.mock('@prisma/client', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(message: string, { code }: { code: string }) {
        super(message);
        this.code = code;
        this.name = 'PrismaClientKnownRequestError';
      }
    },
  },
}));

const healthyDatabaseRow = [{
  limiter_buckets: 'embedding_rate_buckets',
  limiter_leases: 'embedding_rate_leases',
  provider_circuits: 'embedding_provider_circuits',
  circuit_generation: 'generation',
  circuit_probe_until: 'probe_until',
  circuit_probe_generation: 'probe_generation',
  circuit_probe_lease_token: 'probe_lease_token',
  attempt_count: 'attempt_count',
  next_attempt_at: 'next_attempt_at',
  terminal_at: 'terminal_at',
  processing_claim_token: 'processing_claim_token',
  revive_count: 'revive_count',
  attempt_ceiling_constraint: true,
  claim_token_constraint: true,
  revive_constraint: true,
  revival_trigger: true,
  pending_index: 'asset_embeddings_pending_next_attempt_idx',
  circuit_index: 'embedding_provider_circuits_open_until_idx',
  bootstrap_phase: 'ready',
    bootstrap_version: '20260715070000',
}];
const context = { params: Promise.resolve({}) };

describe('/api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://configured';
  });

  it('reports the real Postgres-backed runtime dependencies', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(healthyDatabaseRow);

    const res = await GET(createMockRequest('GET', null), context);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.dependencies).toEqual({
      database: 'up',
      embedding_limiter: 'up',
      share_slug_cache: 'local',
    });
    expect(data.dependencies).not.toHaveProperty('redis');
    expect(data.diagnostics.embedding_limiter_schema).toBe(true);
    expect(data.diagnostics.prisma_connection_test).toBe(true);
    expect(data.diagnostics.database_url_configured).toBe(true);
    expect(data.diagnostics.canary_configured).toBe(false);
    expect(data.version).toBe('0.1.0');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  });

  it('returns 503 when the limiter migration has not been applied', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{
      limiter_buckets: null,
      limiter_leases: null,
      provider_circuits: null,
      circuit_generation: null,
      circuit_probe_until: null,
      circuit_probe_generation: null,
      circuit_probe_lease_token: null,
      attempt_count: null,
      next_attempt_at: null,
      terminal_at: null,
      processing_claim_token: null,
      revive_count: null,
      attempt_ceiling_constraint: false,
      claim_token_constraint: false,
      revive_constraint: false,
      revival_trigger: false,
      pending_index: null,
      circuit_index: null,
      bootstrap_phase: 'preparing',
      bootstrap_version: '20260715070000',
    }]);

    const res = await GET(createMockRequest('GET', null), context);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.dependencies).toEqual({
      database: 'up',
      embedding_limiter: 'down',
      share_slug_cache: 'local',
    });
    expect(data.error).toContain('Embedding limiter schema unavailable');
    expect(data.diagnostics.embedding_limiter_schema).toBe(false);
  });

  for (const field of [
    'provider_circuits',
    'circuit_generation',
    'circuit_probe_until',
    'circuit_probe_generation',
    'circuit_probe_lease_token',
    'attempt_count',
    'next_attempt_at',
    'terminal_at',
    'processing_claim_token',
    'revive_count',
    'attempt_ceiling_constraint',
    'claim_token_constraint',
    'revive_constraint',
    'revival_trigger',
    'pending_index',
    'circuit_index',
    'bootstrap_phase',
    'bootstrap_version',
  ]) {
    it(`fails closed when final schema field ${field} drifts`, async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ ...healthyDatabaseRow[0], [field]: null }]);
      const res = await GET(createMockRequest('GET', null), context);
      expect(res.status).toBe(503);
      expect((await res.json()).diagnostics.embedding_limiter_schema).toBe(false);
    });
  }

  it('returns 503 when Postgres is down', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB Connection Failed'));

    const res = await GET(createMockRequest('GET', null), context);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toContain('Database connection failed');
    expect(data.dependencies).toEqual({
      database: 'down',
      embedding_limiter: 'down',
      share_slug_cache: 'local',
    });
  });

  it('handles HEAD requests without a response body', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(healthyDatabaseRow);

    const res = await HEAD(createMockRequest('HEAD', null), context);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  });

  it('times out a hung database check', async () => {
    vi.useFakeTimers();
    mockPrisma.$queryRaw.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 6_000))
    );

    const responsePromise = GET(createMockRequest('GET', null), context);
    await vi.advanceTimersByTimeAsync(5_100);
    const res = await responsePromise;
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toContain('Health check timeout');
    vi.useRealTimers();
  });

  it('reconnects once after a stale Prisma connection', async () => {
    const { Prisma } = await import('@prisma/client');
    mockPrisma.$queryRaw
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Server has closed the connection', {
          code: 'P1002',
        })
      )
      .mockResolvedValueOnce(healthyDatabaseRow);
    mockPrisma.$disconnect.mockResolvedValue(undefined);
    mockPrisma.$connect.mockResolvedValue(undefined);

    const res = await GET(createMockRequest('GET', null), context);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.dependencies.embedding_limiter).toBe('up');
    expect(mockPrisma.$disconnect).toHaveBeenCalledOnce();
    expect(mockPrisma.$connect).toHaveBeenCalledOnce();
  });

  it('reports reconnect failure instead of a false green', async () => {
    const { Prisma } = await import('@prisma/client');
    mockPrisma.$queryRaw
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Server has closed the connection', {
          code: 'P1002',
        })
      )
      .mockRejectedValueOnce(new Error('Still cannot connect'));
    mockPrisma.$disconnect.mockResolvedValue(undefined);
    mockPrisma.$connect.mockResolvedValue(undefined);

    const res = await GET(createMockRequest('GET', null), context);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toContain('Reconnect failed');
  });
});
