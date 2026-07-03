import { GET, HEAD } from '@/app/api/health/route';
import { createMockRequest } from '../utils/test-helpers';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockPrisma, mockKv } = vi.hoisted(() => ({
  mockPrisma: { $queryRaw: vi.fn(), $disconnect: vi.fn(), $connect: vi.fn() },
  mockKv: { ping: vi.fn() },
}));

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('@vercel/kv', () => ({
  kv: mockKv,
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

vi.mock('@/lib/canary-reporter', () => ({
  canaryConfigured: vi.fn(() => false),
  reportCanaryCheckIn: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/package.json', () => ({
  default: { version: '0.1.0' },
}));

// Mock Prisma Client for error types
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

describe('/api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 200 OK and healthy status when all services are up', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([1]);
    mockKv.ping.mockResolvedValue('PONG');

    const req = createMockRequest('GET', null);
    const context = { params: Promise.resolve({}) };
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe('ok');
    expect(data.dependencies.database).toBe('up');
    expect(data.dependencies.redis).toBe('up');
    expect(data.version).toBe('0.1.0');
    expect(data.timestamp).toBeDefined();

    // Check Prisma diagnostics
    expect(data.diagnostics).toBeDefined();
    expect(data.diagnostics.prisma_connection_test).toBe(true);
    expect(data.diagnostics.database_url_configured).toBe(true);
    expect(data.diagnostics.connection_latency_ms).toBeGreaterThanOrEqual(0);
    expect(data.diagnostics.canary_configured).toBe(false);
    expect(data.diagnostics.env_vars).toBeDefined();
    expect(data.diagnostics.env_vars.DATABASE_URL).toBe('configured');

    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  });

  it('should return 200 OK when Redis is not configured (optional dependency)', async () => {
    // Ensure KV_REST_API_URL is not set (Redis optional)
    delete process.env.KV_REST_API_URL;

    mockPrisma.$queryRaw.mockResolvedValue([1]);
    // Redis ping shouldn't be called when not configured
    mockKv.ping.mockResolvedValue('PONG');

    const req = createMockRequest('GET', null);
    const context = { params: Promise.resolve({}) };
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe('ok');
    expect(data.dependencies.database).toBe('up');
    expect(data.dependencies.redis).toBe('up'); // Treated as healthy when not configured
    expect(mockKv.ping).not.toHaveBeenCalled(); // Shouldn't call ping when not configured
  });

  it('should return 503 Service Unavailable when Database is down', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB Connection Failed'));
    mockKv.ping.mockResolvedValue('PONG');

    const req = createMockRequest('GET', null);
    const context = { params: Promise.resolve({}) };
    const res = await GET(req, context);

    expect(res.status).toBe(503);
    const data = await res.json();

    expect(data.status).toBe('error');
    expect(data.error).toContain('Database connection failed');

    // Check diagnostics still provided even on failure
    expect(data.diagnostics).toBeDefined();
    expect(data.diagnostics.prisma_connection_test).toBe(false);
    expect(data.diagnostics.connection_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('should return 503 Service Unavailable when Redis is down', async () => {
    // Set KV_REST_API_URL so Redis check runs
    process.env.KV_REST_API_URL = 'http://localhost:6379';

    mockPrisma.$queryRaw.mockResolvedValue([1]);
    mockKv.ping.mockRejectedValue(new Error('Redis Connection Failed'));

    const req = createMockRequest('GET', null);
    const context = { params: Promise.resolve({}) };
    const res = await GET(req, context);

    expect(res.status).toBe(503);
    const data = await res.json();

    expect(data.status).toBe('error');
    expect(data.error).toContain('Redis connection failed');

    // Clean up
    delete process.env.KV_REST_API_URL;
  });

  it('should return 503 when both services are down', async () => {
    // Set KV_REST_API_URL so Redis check runs
    process.env.KV_REST_API_URL = 'http://localhost:6379';

    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB Failed'));
    mockKv.ping.mockRejectedValue(new Error('Redis Failed'));

    const req = createMockRequest('GET', null);
    const context = { params: Promise.resolve({}) };
    const res = await GET(req, context);

    expect(res.status).toBe(503);
    const data = await res.json();

    expect(data.status).toBe('error');
    expect(data.error).toContain('Database connection failed');
    expect(data.error).toContain('Redis connection failed');

    // Clean up
    delete process.env.KV_REST_API_URL;
  });

  it('should handle HEAD requests', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([1]);
    mockKv.ping.mockResolvedValue('PONG');

    const req = createMockRequest('HEAD', null);
    const context = { params: Promise.resolve({}) };
    const res = await HEAD(req, context);

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');

    // In Next.js App Router, NextResponse with null body is empty.
    // The actual stripping of body for HEAD requests usually happens at a higher level if using GET logic,
    // but here we implemented HEAD handler returning new NextResponse(null, ...)
    const text = await res.text();
    expect(text).toBe('');
  });


  it('should timeout if checks take too long', async () => {
    // We can't easily use fake timers with promises that are not using setTimeout inside.
    // But our implementation uses Promise.race with a timeout.
    // We can simulate the checks hanging by returning a promise that never resolves (or resolves after timeout).
    // But Promise.race logic relies on real time or fake timers.

    vi.useFakeTimers();

    mockPrisma.$queryRaw.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 6000)));
    mockKv.ping.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 6000)));

    const req = createMockRequest('GET', null);
    const context = { params: Promise.resolve({}) };

    const promise = GET(req, context);

    // Fast-forward time
    vi.advanceTimersByTime(5100);

    const res = await promise;

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain('Health check timeout');

    vi.useRealTimers();
  });

  it('should reconnect and return 200 when stale connection is detected', async () => {
    // First call fails with stale connection error, second succeeds
    const { Prisma } = await import('@prisma/client');

    mockPrisma.$queryRaw
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Server has closed the connection', { code: 'P1002' })
      )
      .mockResolvedValueOnce([1]);
    mockPrisma.$disconnect.mockResolvedValue(undefined);
    mockPrisma.$connect.mockResolvedValue(undefined);
    mockKv.ping.mockResolvedValue('PONG');

    const req = createMockRequest('GET', null);
    const context = { params: Promise.resolve({}) };
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe('ok');
    expect(data.dependencies.database).toBe('up');
    expect(mockPrisma.$disconnect).toHaveBeenCalled();
    expect(mockPrisma.$connect).toHaveBeenCalled();
  });

  it('should return 503 when reconnect fails after stale connection', async () => {
    // First call fails with stale connection, reconnect also fails
    const { Prisma } = await import('@prisma/client');

    mockPrisma.$queryRaw
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Server has closed the connection', { code: 'P1002' })
      )
      .mockRejectedValueOnce(new Error('Still cannot connect'));
    mockPrisma.$disconnect.mockResolvedValue(undefined);
    mockPrisma.$connect.mockResolvedValue(undefined);
    mockKv.ping.mockResolvedValue('PONG');

    const req = createMockRequest('GET', null);
    const context = { params: Promise.resolve({}) };
    const res = await GET(req, context);

    expect(res.status).toBe(503);
    const data = await res.json();

    expect(data.status).toBe('error');
    expect(data.error).toContain('Reconnect failed');
    expect(mockPrisma.$disconnect).toHaveBeenCalled();
    expect(mockPrisma.$connect).toHaveBeenCalled();
  });
});
