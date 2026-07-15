import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { user: { count: vi.fn() } },
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { GET } from '@/app/api/health/enrollment/route';

const productionEnv = {
  NODE_ENV: 'production',
  SPLOOT_DEPLOYMENT_ENV: 'production',
  SPLOOT_DEPLOYMENT_APP_ID: 'app-1',
  SPLOOT_DEPLOYMENT_COMMIT: 'deadbeef',
  SPLOOT_DEPLOYMENT_CHANGE_ID: 'change-1',
};

describe('GET /api/health/enrollment public seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', productionEnv.NODE_ENV);
    vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', productionEnv.SPLOOT_DEPLOYMENT_ENV);
    vi.stubEnv('SPLOOT_DEPLOYMENT_APP_ID', productionEnv.SPLOOT_DEPLOYMENT_APP_ID);
    vi.stubEnv('SPLOOT_DEPLOYMENT_COMMIT', productionEnv.SPLOOT_DEPLOYMENT_COMMIT);
    vi.stubEnv('SPLOOT_DEPLOYMENT_CHANGE_ID', productionEnv.SPLOOT_DEPLOYMENT_CHANGE_ID);
  });

  it('returns only the safe open state with private no-store headers', async () => {
    vi.stubEnv('SPLOOT_ENROLLMENT_MODE', 'ga');
    mockPrisma.user.count.mockResolvedValue(4);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'open', mode: 'ga', configuration: 'valid' });
    expect([...response.headers.entries()]).toContainEqual(['cache-control', 'no-store, private']);
  });

  it('returns paused at a capped limit without leaking count or capacity', async () => {
    vi.stubEnv('SPLOOT_ENROLLMENT_MODE', 'capped');
    vi.stubEnv('SPLOOT_ENROLLMENT_MAX_ACCOUNTS', '4');
    mockPrisma.user.count.mockResolvedValue(4);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'paused', mode: 'capped', configuration: 'valid' });
    expect(body).not.toHaveProperty('accountCount');
    expect(body).not.toHaveProperty('remainingAccounts');
  });

  it('returns paused 503 for invalid configuration without diagnostics', async () => {
    vi.stubEnv('SPLOOT_ENROLLMENT_MODE', 'capped');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'paused', mode: 'closed', configuration: 'invalid' });
    expect(mockPrisma.user.count).not.toHaveBeenCalled();
  });

  it('returns paused 503 for database outage and does not expose the error', async () => {
    vi.stubEnv('SPLOOT_ENROLLMENT_MODE', 'ga');
    mockPrisma.user.count.mockRejectedValue(new Error('private database detail'));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'paused', mode: 'ga', configuration: 'valid' });
    expect(response.headers.get('cache-control')).toBe('no-store, private');
  });
});
