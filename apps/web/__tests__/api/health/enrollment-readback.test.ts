import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  count: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: mocks.findUnique, count: mocks.count } } }));
vi.mock('@/lib/auth/with-authenticated-api', () => ({
  withAuthenticatedApi: (handler: Function) => (req: Request, context: unknown) => handler(req, context, {
    principal: { userId: 'operator-1' },
  }),
}));
vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: Function) => handler,
}));
vi.mock('@/lib/observability-logger', () => ({
  logger: { logError: mocks.logError },
}));

import { GET } from '@/app/api/health/enrollment/readback/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', 'production');
  vi.stubEnv('SPLOOT_ENROLLMENT_MODE', 'capped');
  vi.stubEnv('SPLOOT_ENROLLMENT_MAX_ACCOUNTS', '12');
  vi.stubEnv('SPLOOT_DEPLOYMENT_APP_ID', 'app-1');
  vi.stubEnv('SPLOOT_DEPLOYMENT_COMMIT', 'deadbeef');
  vi.stubEnv('SPLOOT_DEPLOYMENT_CHANGE_ID', 'change-1');
  mocks.findUnique.mockResolvedValue({ role: 'operator' });
  mocks.count.mockResolvedValue(7);
});

describe('GET /api/health/enrollment/readback', () => {
  it('returns the detailed readback only to an operator', async () => {
    const response = await GET(new Request('http://sploot.test/api/health/enrollment/readback'), {} as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accountCount: 7, remainingAccounts: 5 });
  });

  it.each(['findUnique', 'count'] as const)('fails closed and redacts a Prisma %s failure', async (operation) => {
    mocks[operation].mockRejectedValue(new Error('postgres password and host must never escape'));

    const response = await GET(new Request('http://sploot.test/api/health/enrollment/readback'), {} as never);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: 'Enrollment policy is temporarily unavailable.',
      code: 'enrollment_unavailable',
      retryable: true,
      action: { type: 'try_later', label: 'Try again later' },
    });
    expect(JSON.stringify(body)).not.toContain('postgres');
    expect(mocks.logError).toHaveBeenCalledWith(
      'health:enrollment-readback-unavailable',
      expect.objectContaining({ message: 'enrollment readback unavailable' }),
      { reason: 'database_error' },
    );
    const logged = mocks.logError.mock.calls[0]?.[1];
    expect(JSON.stringify(logged)).not.toContain('postgres password');
  });
});
