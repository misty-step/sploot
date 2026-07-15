import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  createQaLocalAuthToken,
  getQaLocalAuthHeader,
  QA_LOCAL_AUDIENCE,
  QA_LOCAL_DEPLOYMENT_ENV,
  QA_LOCAL_DEPLOYMENT_ID,
} from '@/lib/auth/qa-local';
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
          SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
          SPLOOT_QA_DEPLOYMENT_ID: QA_LOCAL_DEPLOYMENT_ID,
          SPLOOT_QA_DEPLOYMENT_ENV: QA_LOCAL_DEPLOYMENT_ENV,
          SPLOOT_QA_AUDIENCE: QA_LOCAL_AUDIENCE,
        },
      }
    );

    const response = await handler(
      new NextRequest('http://localhost:3001/api/cache/stats', {
        headers: { [getQaLocalAuthHeader()]: token, 'x-forwarded-for': '127.0.0.1' },
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
          SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
          SPLOOT_QA_DEPLOYMENT_ID: QA_LOCAL_DEPLOYMENT_ID,
          SPLOOT_QA_DEPLOYMENT_ENV: QA_LOCAL_DEPLOYMENT_ENV,
          SPLOOT_QA_AUDIENCE: QA_LOCAL_AUDIENCE,
        },
      }
    );
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: 'test-secret-with-enough-entropy',
      expiresInSeconds: 60,
    });

    const response = await handler(
      new NextRequest('http://localhost:3001/api/cache/stats', {
        headers: { [getQaLocalAuthHeader()]: token, 'x-forwarded-for': '127.0.0.1' },
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
    const response = await withAuthenticatedApi(
      async () => NextResponse.json({ ok: true }),
      {
        allowClerk: false,
        allowQaLocal: true,
        env: {
          NODE_ENV: 'test',
          SPLOOT_DEPLOYMENT_ENV: 'test',
          SPLOOT_QA_AUTH_MODE: 'enabled',
          SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
          SPLOOT_QA_DEPLOYMENT_ID: QA_LOCAL_DEPLOYMENT_ID,
          SPLOOT_QA_DEPLOYMENT_ENV: QA_LOCAL_DEPLOYMENT_ENV,
          SPLOOT_QA_AUDIENCE: QA_LOCAL_AUDIENCE,
        },
      }
    )(
      new NextRequest('http://localhost:3001/api/cache/stats', {
        headers: { [getQaLocalAuthHeader()]: token, 'x-forwarded-for': '127.0.0.1' },
      }),
      { params: Promise.resolve({}) }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'enrollment_unavailable' });
  });
});
