import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createQaLocalAuthToken, createQaLocalProxyProof, getQaLocalAuthHeader, getQaLocalProxyProofHeader } from '@/lib/auth/qa-gallery-local';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}));

beforeEach(() => {
  mocks.userFindUnique.mockResolvedValue({ id: 'qa-user-1' });
});

describe('withAuthenticatedApi', () => {
  it('returns stable 401 JSON when no principal is available', async () => {
    const handler = withAuthenticatedApi(
      async () => NextResponse.json({ ok: true }),
      { allowClerk: false, allowQaLocal: true }
    );

    const response = await handler(new NextRequest('http://localhost:3001/api/cache/stats'), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('passes a signed qa-local principal to the route handler outside production', async () => {
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: 'test-secret-with-enough-entropy',
      expiresInSeconds: 60,
    });
    const proxyProof = await createQaLocalProxyProof('localhost', '127.0.0.1', 'test-secret-with-enough-entropy');
    const handler = withAuthenticatedApi(
      async (_req, _context, auth) => NextResponse.json({
        userId: auth.principal.userId,
        source: auth.principal.source,
      }),
      {
        allowClerk: false,
        allowQaLocal: true,
        env: {
          NODE_ENV: 'test',
          SPLOOT_DEPLOYMENT_ENV: 'test',
          SPLOOT_QA_AUTH_MODE: 'enabled',
          SPLOOT_QA_EVIDENCE_MODE: 'enabled',
          SPLOOT_QA_DEPLOYMENT_ID: 'sploot-gallery-qa-local',
          SPLOOT_QA_DEPLOYMENT_AUDIENCE: 'sploot-gallery-evidence',
          DEPLOYMENT_ENV: 'qa-local',
    SPLOOT_QA_BIND_HOST: '127.0.0.1',
    SPLOOT_QA_LOCAL_CAPABILITY: '0123456789abcdef0123456789abcdef0123456789abcdef',
          SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
        },
      }
    );

    const response = await handler(
      new NextRequest('http://localhost:3001/api/cache/stats', {
        headers: {
          [getQaLocalAuthHeader()]: token,
          [getQaLocalProxyProofHeader()]: proxyProof,
        },
      }),
      { params: Promise.resolve({}) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      userId: 'qa-user-1',
      source: 'qa-local',
    });
  });

  it('ignores qa-local credentials entirely when the build seam is compiled out', async () => {
    vi.stubEnv('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD', 'false');
    const routeHandler = vi.fn(async () => NextResponse.json({ ok: true }));
    const handler = withAuthenticatedApi(routeHandler, {
      allowClerk: false,
      allowQaLocal: true,
      env: {
        NODE_ENV: 'test',
        SPLOOT_DEPLOYMENT_ENV: 'test',
        SPLOOT_QA_AUTH_MODE: 'enabled',
        SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
      },
    });
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: 'test-secret-with-enough-entropy',
      expiresInSeconds: 60,
    });

    const response = await handler(
      new NextRequest('http://localhost:3001/api/cache/stats', {
        headers: { [getQaLocalAuthHeader()]: token },
      }),
      { params: Promise.resolve({}) }
    );

    expect(response.status).toBe(401);
    expect(routeHandler).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('denies an authenticated principal without a durable enrollment row', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    const handler = withAuthenticatedApi(
      vi.fn(async () => NextResponse.json({ ok: true })),
      {
        allowClerk: false,
        allowQaLocal: true,
        env: {
          NODE_ENV: 'test',
          SPLOOT_DEPLOYMENT_ENV: 'test',
          SPLOOT_QA_AUTH_MODE: 'enabled',
          SPLOOT_QA_EVIDENCE_MODE: 'enabled',
          SPLOOT_QA_DEPLOYMENT_ID: 'sploot-gallery-qa-local',
          SPLOOT_QA_DEPLOYMENT_AUDIENCE: 'sploot-gallery-evidence',
          DEPLOYMENT_ENV: 'qa-local',
    SPLOOT_QA_BIND_HOST: '127.0.0.1',
    SPLOOT_QA_LOCAL_CAPABILITY: '0123456789abcdef0123456789abcdef0123456789abcdef',
          SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
        },
      }
    );
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: 'test-secret-with-enough-entropy',
      expiresInSeconds: 60,
    });
    const proxyProof = await createQaLocalProxyProof('localhost', '127.0.0.1', 'test-secret-with-enough-entropy');

    const response = await handler(
      new NextRequest('http://localhost:3001/api/cache/stats', {
        headers: {
          [getQaLocalAuthHeader()]: token,
          [getQaLocalProxyProofHeader()]: proxyProof,
        },
      }),
      { params: Promise.resolve({}) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'enrollment_closed' });
    expect(handler).toBeDefined();
  });

  it('fails closed when the enrollment lookup is unavailable', async () => {
    mocks.userFindUnique.mockRejectedValue(new Error('database down'));
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: 'test-secret-with-enough-entropy',
      expiresInSeconds: 60,
    });
    const proxyProof = await createQaLocalProxyProof('localhost', '127.0.0.1', 'test-secret-with-enough-entropy');
    const response = await withAuthenticatedApi(
      async () => NextResponse.json({ ok: true }),
      {
        allowClerk: false,
        allowQaLocal: true,
        env: {
          NODE_ENV: 'test',
          SPLOOT_DEPLOYMENT_ENV: 'test',
          SPLOOT_QA_AUTH_MODE: 'enabled',
          SPLOOT_QA_EVIDENCE_MODE: 'enabled',
          SPLOOT_QA_DEPLOYMENT_ID: 'sploot-gallery-qa-local',
          SPLOOT_QA_DEPLOYMENT_AUDIENCE: 'sploot-gallery-evidence',
          DEPLOYMENT_ENV: 'qa-local',
    SPLOOT_QA_BIND_HOST: '127.0.0.1',
    SPLOOT_QA_LOCAL_CAPABILITY: '0123456789abcdef0123456789abcdef0123456789abcdef',
          SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
        },
      }
    )(
      new NextRequest('http://localhost:3001/api/cache/stats', {
        headers: {
          [getQaLocalAuthHeader()]: token,
          [getQaLocalProxyProofHeader()]: proxyProof,
        },
      }),
      { params: Promise.resolve({}) }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'enrollment_unavailable' });
  });
});
