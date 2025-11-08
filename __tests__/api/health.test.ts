import { GET } from '@/app/api/health/route';
import { createMockRequest } from '../utils/test-helpers';
import { vi } from 'vitest';

// Mock Prisma client with successful health check
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ health_check: 1 }]),
  },
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

describe('/api/health', () => {
  it('should return healthy status when database is accessible', async () => {
    const response = await GET(createMockRequest('GET'), { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.checks.database.status).toBe('pass');
  });

  it('should include timestamp', async () => {
    const before = Date.now();
    const response = await GET(createMockRequest('GET'), { params: Promise.resolve({}) });
    const data = await response.json();
    const after = Date.now();

    expect(data.timestamp).toBeDefined();
    const timestamp = new Date(data.timestamp).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('should check database connectivity', async () => {
    const response = await GET(createMockRequest('GET'), { params: Promise.resolve({}) });
    const data = await response.json();

    expect(data.checks).toHaveProperty('database');
    expect(data.checks.database).toHaveProperty('status');
    expect(['pass', 'fail']).toContain(data.checks.database.status);
  });
});
