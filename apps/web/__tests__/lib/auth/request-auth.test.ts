import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyBearerOrThrow: vi.fn(),
  currentUser: vi.fn(),
  syncUser: vi.fn(),
  extractUploadToken: vi.fn(),
  verifyUploadToken: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('@/lib/auth/verify-bearer', () => ({
  verifyBearerOrThrow: mocks.verifyBearerOrThrow,
}));

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: mocks.currentUser,
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
  syncUser: mocks.syncUser,
}));

vi.mock('@/lib/circuit-breaker', () => ({
  getUserSyncCircuitBreaker: () => ({
    execute: (operation: () => Promise<void>) => operation(),
  }),
}));

vi.mock('@/lib/observability-logger', () => ({
  logger: {
    logError: mocks.logError,
    logInfo: mocks.logInfo,
  },
}));

vi.mock('@/lib/auth/upload-token', () => ({
  extractUploadToken: mocks.extractUploadToken,
  verifyUploadToken: mocks.verifyUploadToken,
}));

import { authenticateRequest } from '@/lib/auth/request-auth';

const clerkEnv = {
  CLERK_SECRET_KEY: 'sk_test_configured',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_configured',
};

function request() {
  return new NextRequest('http://localhost:3000/api/assets');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyBearerOrThrow.mockResolvedValue('user-1');
  mocks.currentUser.mockResolvedValue({
    id: 'user-1',
    emailAddresses: [{ emailAddress: 'user-1@sploot.test' }],
  });
  mocks.syncUser.mockResolvedValue(undefined);
  mocks.extractUploadToken.mockReturnValue(undefined);
  mocks.verifyUploadToken.mockResolvedValue(null);
});

describe('authenticateRequest user-sync policy', () => {
  it('syncs Clerk users only when the route policy requires it', async () => {
    const result = await authenticateRequest(request(), {
      env: clerkEnv,
      requireUserSync: true,
    });

    expect(result).toMatchObject({
      status: 'authenticated',
      syncStatus: 'success',
      principal: {
        userId: 'user-1',
        email: 'user-1@sploot.test',
      },
    });
    expect(mocks.syncUser).toHaveBeenCalledWith('user-1', 'user-1@sploot.test');
  });

  it('returns a retryable typed failure when the database is unavailable', async () => {
    mocks.syncUser.mockRejectedValue(new Error('database unavailable'));

    const result = await authenticateRequest(request(), {
      env: clerkEnv,
      requireUserSync: true,
    });

    expect(result).toMatchObject({
      status: 'boundary-failure',
      code: 'sync_unavailable',
      httpStatus: 503,
      retryable: true,
    });
  });

  it('returns a typed missing-identity failure when Clerk has no current user', async () => {
    mocks.currentUser.mockResolvedValue(null);

    const result = await authenticateRequest(request(), {
      env: clerkEnv,
      requireUserSync: true,
    });

    expect(result).toMatchObject({
      status: 'boundary-failure',
      code: 'identity_missing',
      httpStatus: 401,
      retryable: false,
    });
  });

  it('rejects a currentUser subject mismatch before any sync or email migration', async () => {
    mocks.currentUser.mockResolvedValue({
      id: 'different-clerk-subject',
      emailAddresses: [{ emailAddress: 'owner@sploot.test' }],
    });

    const result = await authenticateRequest(request(), {
      env: clerkEnv,
      requireUserSync: true,
    });

    expect(result).toMatchObject({
      status: 'boundary-failure',
      code: 'identity_mismatch',
      httpStatus: 401,
    });
    expect(mocks.syncUser).not.toHaveBeenCalled();
  });

  it('classifies serializable sync conflicts as retryable 409 boundary failures', async () => {
    mocks.syncUser.mockRejectedValue(Object.assign(new Error('transaction conflict'), { code: 'P2034' }));

    const result = await authenticateRequest(request(), {
      env: clerkEnv,
      requireUserSync: true,
    });

    expect(result).toMatchObject({
      status: 'boundary-failure',
      code: 'sync_conflict',
      httpStatus: 409,
      retryable: true,
    });
  });

  it('treats a missing user_identities schema as terminal unavailable', async () => {
    mocks.syncUser.mockRejectedValue(Object.assign(new Error('table user_identities does not exist'), { code: 'P2021' }));

    const result = await authenticateRequest(request(), {
      env: clerkEnv,
      requireUserSync: true,
    });

    expect(result).toMatchObject({
      status: 'boundary-failure',
      code: 'sync_unavailable',
      httpStatus: 503,
      retryable: true,
    });
  });

  it('turns Clerk provider failures into typed retryable 503s', async () => {
    mocks.verifyBearerOrThrow.mockRejectedValue(new Error('Clerk provider unavailable'));

    const result = await authenticateRequest(request(), { env: clerkEnv });

    expect(result).toMatchObject({
      status: 'boundary-failure',
      code: 'sync_unavailable',
      httpStatus: 503,
      retryable: true,
    });
  });

  it('only skips sync when a route explicitly disables the requirement', async () => {
    const result = await authenticateRequest(request(), { env: clerkEnv, requireUserSync: false });

    expect(result).toMatchObject({ status: 'authenticated', syncStatus: 'skipped' });
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(mocks.syncUser).not.toHaveBeenCalled();
  });

  it('converts upload-token verifier exceptions into a sanitized boundary failure', async () => {
    mocks.extractUploadToken.mockReturnValue('splt_token');
    mocks.verifyUploadToken.mockRejectedValue(new Error('Prisma password=should-not-leak'));

    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/upload', {
        headers: { authorization: 'Bearer splt_token' },
      }),
      { env: clerkEnv, allowUploadToken: true }
    );

    expect(result).toMatchObject({
      status: 'boundary-failure',
      code: 'sync_unavailable',
      httpStatus: 503,
      retryable: true,
    });
    expect(JSON.stringify(result)).not.toContain('password=');
  });
});

describe('qa-local credential containment', () => {
  const qaTokenEnv = {
    NODE_ENV: 'test',
    SPLOOT_DEPLOYMENT_IDENTITY: 'local-qa',
    SPLOOT_QA_ALLOWED_DEPLOYMENT_IDENTITIES: 'local-qa',
    SPLOOT_QA_AUTH_MODE: 'enabled',
    SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
    CLERK_SECRET_KEY: clerkEnv.CLERK_SECRET_KEY,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  };

  it.each([
    ['malformed percent encoding', 'sploot_qa_auth=%E0%A4%A'],
    ['duplicate cookies', 'sploot_qa_auth=one; sploot_qa_auth=two'],
    ['oversized cookie', `sploot_qa_auth=${'x'.repeat(4097)}`],
  ])('normalizes %s to 401 and never reaches Clerk', async (_label, cookie) => {
    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/stats', { headers: { cookie } }),
      { env: qaTokenEnv }
    );

    expect(result).toMatchObject({ status: 'unauthenticated' });
    expect(mocks.verifyBearerOrThrow).not.toHaveBeenCalled();
  });

  it('does not let a syntactically valid QA cookie authenticate production', async () => {
    mocks.verifyBearerOrThrow.mockRejectedValue(new Error('Unauthorized'));
    const token = await (await import('@/lib/auth/qa-local')).createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: qaTokenEnv.SPLOOT_QA_AUTH_SECRET,
      expiresInSeconds: 60,
    });

    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/stats', {
        headers: { cookie: `sploot_qa_auth=${encodeURIComponent(token)}` },
      }),
      { env: { ...qaTokenEnv, NODE_ENV: 'production', DEPLOYMENT_ENV: 'production' } }
    );

    expect(result).toMatchObject({ status: 'unauthenticated', reason: 'clerk-unauthorized' });
    expect(mocks.verifyBearerOrThrow).toHaveBeenCalled();
  });

  it('ignores stray QA markers when disabled and accepts the valid Clerk credential', async () => {
    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/stats', {
        headers: { cookie: 'sploot_qa_auth=not-a-qa-credential' },
      }),
      { env: { ...qaTokenEnv, SPLOOT_QA_AUTH_MODE: 'disabled' } }
    );

    expect(result).toMatchObject({ status: 'authenticated', principal: { userId: 'user-1' } });
    expect(mocks.verifyBearerOrThrow).toHaveBeenCalled();
  });

  it('ignores stray QA markers when disabled and accepts the valid upload token', async () => {
    mocks.extractUploadToken.mockReturnValue('splt_valid-token');
    mocks.verifyUploadToken.mockResolvedValue({
      userId: 'token-owner',
      provider: 'upload-token',
      providerSubject: 'token-owner',
      source: 'upload-token',
      credentialKind: 'upload-token',
    });

    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/upload', {
        headers: {
          cookie: 'sploot_qa_auth=not-a-qa-credential',
          authorization: 'Bearer splt_valid-token',
        },
      }),
      {
        env: { ...qaTokenEnv, SPLOOT_QA_AUTH_MODE: 'disabled' },
        allowUploadToken: true,
      }
    );

    expect(result).toMatchObject({ status: 'authenticated', principal: { userId: 'token-owner' } });
    expect(mocks.verifyBearerOrThrow).not.toHaveBeenCalled();
  });

  it('rejects ambiguous QA header plus cookie credentials', async () => {
    const token = await (await import('@/lib/auth/qa-local')).createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: qaTokenEnv.SPLOOT_QA_AUTH_SECRET,
      expiresInSeconds: 60,
    });

    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/stats', {
        headers: {
          'x-sploot-qa-auth': token,
          cookie: `sploot_qa_auth=${encodeURIComponent(token)}`,
        },
      }),
      { env: qaTokenEnv }
    );

    expect(result).toMatchObject({ status: 'unauthenticated', reason: 'qa-local-duplicate' });
    expect(mocks.verifyBearerOrThrow).not.toHaveBeenCalled();
  });
});
