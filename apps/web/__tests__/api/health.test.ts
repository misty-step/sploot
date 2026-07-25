import { GET, HEAD } from '@/app/api/health/route';
import { __resetDatabaseReadinessForTests } from '@/lib/health/database-readiness';
import { createMockRequest } from '../utils/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  checkCanaryStatus: vi.fn(async () => ({
    configured: false,
    reachable: null,
    status: 'not_configured',
    message: 'Missing CANARY_ENDPOINT or CANARY_API_KEY',
  })),
  peekCanaryReachability: vi.fn(() => null),
  HEALTH_PROBE_TIMEOUT_MS: 400,
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
  bootstrap_version: '20260716020000',
  bootstrap_schema_version: '20260716020000',
}];
const context = { params: Promise.resolve({}) };

describe('/api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDatabaseReadinessForTests();
    process.env.DATABASE_URL = 'postgresql://configured';
    delete process.env.STRIPE_LEDGER_BOOTSTRAP_REQUIRED;
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(data.diagnostics.canary_reachable).toBeNull();
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
      bootstrap_version: '20260716020000',
      bootstrap_schema_version: '20260716020000',
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
  ]) {
    it(`fails closed when final schema field ${field} drifts`, async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ ...healthyDatabaseRow[0], [field]: null }]);
      const res = await GET(createMockRequest('GET', null), context);
      expect(res.status).toBe(503);
      expect((await res.json()).diagnostics.embedding_limiter_schema).toBe(false);
    });
  }

  for (const field of ['bootstrap_phase', 'bootstrap_version', 'bootstrap_schema_version']) {
    it(`fails closed when required bootstrap field ${field} drifts`, async () => {
      process.env.STRIPE_LEDGER_BOOTSTRAP_REQUIRED = 'true';
      mockPrisma.$queryRaw.mockResolvedValue([{ ...healthyDatabaseRow[0], [field]: null }]);
      const res = await GET(createMockRequest('GET', null), context);
      expect(res.status).toBe(503);
      expect((await res.json()).diagnostics.embedding_limiter_schema).toBe(false);
    });
  }

  it('does not require the Stripe bootstrap marker before billing is activated', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{
      ...healthyDatabaseRow[0],
      bootstrap_phase: null,
      bootstrap_version: null,
      bootstrap_schema_version: null,
    }]);

    const res = await GET(createMockRequest('GET', null), context);
    expect(res.status).toBe(200);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it('binds a required bootstrap marker to the newest applied migration', async () => {
    process.env.STRIPE_LEDGER_BOOTSTRAP_REQUIRED = 'true';
    mockPrisma.$queryRaw.mockResolvedValue(healthyDatabaseRow);

    const res = await GET(createMockRequest('GET', null), context);
    expect(res.status).toBe(200);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects a required bootstrap marker from an older schema version', async () => {
    process.env.STRIPE_LEDGER_BOOTSTRAP_REQUIRED = 'true';
    mockPrisma.$queryRaw.mockResolvedValue([{
      ...healthyDatabaseRow[0],
      bootstrap_schema_version: '20260716000000',
    }]);

    const res = await GET(createMockRequest('GET', null), context);
    expect(res.status).toBe(503);
  });

  it('fails closed on a malformed bootstrap requirement', async () => {
    process.env.STRIPE_LEDGER_BOOTSTRAP_REQUIRED = 'sometimes';
    mockPrisma.$queryRaw.mockResolvedValue(healthyDatabaseRow);

    const res = await GET(createMockRequest('GET', null), context);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('STRIPE_LEDGER_BOOTSTRAP_REQUIRED');
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

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

  it('retries once after a stale Prisma connection without global disconnect/reconnect', async () => {
    const { Prisma } = await import('@prisma/client');
    mockPrisma.$queryRaw
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Server has closed the connection', {
          code: 'P1002',
        })
      )
      .mockResolvedValueOnce(healthyDatabaseRow);

    const res = await GET(createMockRequest('GET', null), context);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.dependencies.embedding_limiter).toBe('up');
    // Incident 2026-07-15: globally disconnecting the shared Prisma client
    // while live requests are in flight turns one stale probe connection into
    // an app-wide connection storm. The shared client must never be torn down
    // by a health probe.
    expect(mockPrisma.$disconnect).not.toHaveBeenCalled();
    expect(mockPrisma.$connect).not.toHaveBeenCalled();
  });

  it('reports retry failure instead of a false green', async () => {
    const { Prisma } = await import('@prisma/client');
    mockPrisma.$queryRaw
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Server has closed the connection', {
          code: 'P1002',
        })
      )
      .mockRejectedValueOnce(new Error('Still cannot connect'));

    const res = await GET(createMockRequest('GET', null), context);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toContain('Retry failed');
    expect(mockPrisma.$disconnect).not.toHaveBeenCalled();
    expect(mockPrisma.$connect).not.toHaveBeenCalled();
  });

  it('shares one underlying database probe across concurrent deep checks', async () => {
    let resolveQuery!: (rows: unknown) => void;
    mockPrisma.$queryRaw.mockImplementation(
      () => new Promise((resolve) => { resolveQuery = resolve; })
    );

    const first = GET(createMockRequest('GET', null), context);
    const second = GET(createMockRequest('GET', null), context);
    resolveQuery(healthyDatabaseRow);
    const [firstRes, secondRes] = await Promise.all([first, second]);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('keeps a timed-out probe single until it settles, then recovers with a fresh probe', async () => {
    vi.useFakeTimers();
    let resolveQuery!: (rows: unknown) => void;
    mockPrisma.$queryRaw.mockImplementationOnce(
      () => new Promise((resolve) => { resolveQuery = resolve; })
    );

    const firstPromise = GET(createMockRequest('GET', null), context);
    await vi.advanceTimersByTimeAsync(5_100);
    const firstRes = await firstPromise;
    expect(firstRes.status).toBe(503);
    expect((await firstRes.json()).error).toContain('Health check timeout');

    // A request timeout must not launch duplicate underlying work: the next
    // request joins the still-pending probe instead of starting another one.
    const secondPromise = GET(createMockRequest('GET', null), context);
    await vi.advanceTimersByTimeAsync(0);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);

    // When the slow probe finally settles healthy, the waiting request greens.
    resolveQuery(healthyDatabaseRow);
    const secondRes = await secondPromise;
    expect(secondRes.status).toBe(200);

    // The settled probe releases the slot: recovery is observed by new work.
    mockPrisma.$queryRaw.mockResolvedValueOnce(healthyDatabaseRow);
    const thirdRes = await GET(createMockRequest('GET', null), context);
    expect(thirdRes.status).toBe(200);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('keeps the single-flight slot fenced past the probe deadline until the query settles', async () => {
    vi.useFakeTimers();
    let resolveQuery!: (rows: unknown) => void;
    mockPrisma.$queryRaw.mockImplementationOnce(
      () => new Promise((resolve) => { resolveQuery = resolve; })
    );

    const firstPromise = GET(createMockRequest('GET', null), context);
    await vi.advanceTimersByTimeAsync(5_100);
    expect((await firstPromise).status).toBe(503);

    // The bounded result may report failure, but the underlying Prisma query
    // is still pending. A later caller must not launch a second query.
    await vi.advanceTimersByTimeAsync(10_000);
    const secondPromise = GET(createMockRequest('GET', null), context);
    await vi.advanceTimersByTimeAsync(0);
    expect((await secondPromise).status).toBe(503);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);

    // Only settlement of the original query releases the slot and permits
    // recovery with fresh work.
    resolveQuery(healthyDatabaseRow);
    await vi.advanceTimersByTimeAsync(0);
    mockPrisma.$queryRaw.mockResolvedValueOnce(healthyDatabaseRow);
    const thirdRes = await GET(createMockRequest('GET', null), context);
    expect(thirdRes.status).toBe(200);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('regression 2026-07-15: a 76s database stall yields bounded fail-closed 503s from one probe', async () => {
    // Live incident shape: the 21:15 cron invocation held the database busy
    // (third call took 76.176s), deep health hit its timeout at 5089ms and
    // 503'd, and platform probes kept arriving while the workload ran. Deep
    // health must stay fail-closed AND must not amplify the stall by issuing
    // one query per probe.
    vi.useFakeTimers();
    mockPrisma.$queryRaw.mockImplementationOnce(
      () => new Promise((resolve) => { setTimeout(() => resolve(healthyDatabaseRow), 76_176); })
    );

    const probes = [
      GET(createMockRequest('GET', null), context),
      GET(createMockRequest('GET', null), context),
      GET(createMockRequest('GET', null), context),
    ];
    await vi.advanceTimersByTimeAsync(5_100);
    const responses = await Promise.all(probes);

    for (const res of responses) {
      expect(res.status).toBe(503);
    }
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$disconnect).not.toHaveBeenCalled();
  });
});
