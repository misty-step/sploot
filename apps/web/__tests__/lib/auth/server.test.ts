import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  syncClerkUser: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/auth/user-sync', () => ({ syncClerkUser: mocks.syncClerkUser }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

import { getAuthWithUser, requireUserIdWithSync } from '@/lib/auth/server';

describe('server auth helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SPLOOT_QA_AUTH_MODE', 'disabled');
    mocks.auth.mockResolvedValue({
      userId: 'clerk-user-1',
      sessionId: 'session-1',
      getToken: vi.fn(),
    });
  });

  it('does not return a Clerk user when deterministic sync fails', async () => {
    mocks.syncClerkUser.mockResolvedValue({
      syncStatus: 'failed',
      failureCode: 'sync_unavailable',
      syncError: 'database password=must-not-leak',
      retryable: true,
    });

    const result = await getAuthWithUser();

    expect(result).toMatchObject({
      userId: null,
      syncStatus: 'failed',
      authFailure: {
        code: 'sync_unavailable',
        httpStatus: 503,
        retryable: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain('password=');
    await expect(requireUserIdWithSync()).rejects.toMatchObject({
      name: 'AuthBoundaryError',
      code: 'sync_unavailable',
    });
  });

  it('converts Clerk server-provider failures into an explicit sanitized failure', async () => {
    mocks.auth.mockRejectedValue(new Error('raw provider secret password=must-not-leak'));

    const result = await getAuthWithUser();

    expect(result).toMatchObject({
      userId: null,
      syncStatus: 'failed',
      authFailure: { code: 'sync_unavailable', httpStatus: 503, retryable: true },
    });
    expect(JSON.stringify(result)).not.toContain('password=');
  });
});
