import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createQaLocalAuthToken } from '@/lib/auth/qa-local';

const mocks = vi.hoisted(() => ({
  verifyBearerOrThrow: vi.fn(),
  currentUser: vi.fn(),
  syncUser: vi.fn(),
  aggregate: vi.fn(),
  quota: vi.fn(),
  logError: vi.fn(),
}));

let databaseAvailable = true;

vi.mock('@/lib/auth/verify-bearer', () => ({
  verifyBearerOrThrow: mocks.verifyBearerOrThrow,
}));

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: mocks.currentUser,
}));

vi.mock('@/lib/db', () => ({
  get prisma() {
    return databaseAvailable ? { asset: { aggregate: mocks.aggregate } } : null;
  },
  syncUser: mocks.syncUser,
}));

vi.mock('@/lib/quota/storage-quota-policy', () => ({
  getStorageQuotaSnapshot: mocks.quota,
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: unknown) => handler,
}));

vi.mock('@/lib/observability-logger', () => ({
  logError: mocks.logError,
  logger: { logError: mocks.logError, logInfo: vi.fn() },
}));

import { GET } from '@/app/api/stats/route';

const clerkEnv = {
  CLERK_SECRET_KEY: 'sk_test_boundary',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_boundary',
};

function request() {
  return new NextRequest('http://localhost:3000/api/stats');
}

describe('production route entrypoint auth boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CLERK_SECRET_KEY', clerkEnv.CLERK_SECRET_KEY);
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', clerkEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
    vi.stubEnv('SPLOOT_QA_AUTH_MODE', 'disabled');
    vi.stubEnv('SPLOOT_DEPLOYMENT_IDENTITY', 'local-qa');
    vi.stubEnv('SPLOOT_QA_ALLOWED_DEPLOYMENT_IDENTITIES', 'local-qa');
    vi.stubEnv('NODE_ENV', 'test');
    databaseAvailable = true;
    mocks.verifyBearerOrThrow.mockResolvedValue('owner-1');
    mocks.currentUser.mockResolvedValue({ id: 'owner-1', emailAddresses: [{ emailAddress: 'owner@sploot.test' }] });
    mocks.syncUser.mockResolvedValue(undefined);
    mocks.aggregate.mockResolvedValue({
      _count: { id: 2 },
      _sum: { size: 100 },
      _max: { createdAt: new Date('2026-07-14T00:00:00Z') },
    });
    mocks.quota.mockResolvedValue({ limitBytes: 1000, reservedBytes: 0 });
  });

  it('preserves the stable 401 and does not invoke the handler for missing auth', async () => {
    mocks.verifyBearerOrThrow.mockRejectedValue(new Error('Unauthorized'));

    const response = await GET(request(), { params: Promise.resolve({}) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it('returns typed 401 when Clerk has no current user before the handler', async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await GET(request(), { params: Promise.resolve({}) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
      code: 'identity_missing',
    });
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it('returns typed 401 when Clerk currentUser belongs to another subject', async () => {
    mocks.currentUser.mockResolvedValue({
      id: 'different-owner',
      emailAddresses: [{ emailAddress: 'owner@sploot.test' }],
    });

    const response = await GET(request(), { params: Promise.resolve({}) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
      code: 'identity_mismatch',
    });
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it('returns retryable 503 when the identity database is unavailable', async () => {
    databaseAvailable = false;

    const response = await GET(request(), { params: Promise.resolve({}) });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication temporarily unavailable',
      code: 'sync_unavailable',
      retryable: true,
    });
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it('returns typed retryable 503 when Clerk provider verification fails', async () => {
    mocks.verifyBearerOrThrow.mockRejectedValue(new Error('Clerk provider unavailable'));

    const response = await GET(request(), { params: Promise.resolve({}) });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication temporarily unavailable',
      code: 'sync_unavailable',
      retryable: true,
    });
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it('returns 409 for a sync conflict and does not cross the tenant boundary', async () => {
    mocks.syncUser.mockRejectedValue(Object.assign(new Error('serializable conflict'), { code: 'P2034' }));

    const response = await GET(request(), { params: Promise.resolve({}) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication identity conflict',
      code: 'sync_conflict',
      retryable: true,
    });
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it('passes the synced Clerk owner to the actual handler', async () => {
    const response = await GET(request(), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.syncUser).toHaveBeenCalledWith('owner-1', 'owner@sploot.test');
    expect(mocks.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerUserId: 'owner-1', deletedAt: null },
    }));
  });

  it('denies a valid QA cookie at the production route entrypoint', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEPLOYMENT_ENV', 'production');
    vi.stubEnv('SPLOOT_QA_AUTH_MODE', 'enabled');
    vi.stubEnv('SPLOOT_QA_AUTH_SECRET', 'test-secret-with-enough-entropy');
    mocks.verifyBearerOrThrow.mockRejectedValue(new Error('Unauthorized'));
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: 'test-secret-with-enough-entropy',
      expiresInSeconds: 60,
    });

    const response = await GET(new NextRequest('http://localhost:3000/api/stats', {
      headers: { cookie: `sploot_qa_auth=${encodeURIComponent(token)}` },
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mocks.verifyBearerOrThrow).toHaveBeenCalled();
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });
});
