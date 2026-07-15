import { describe, expect, it } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createQaLocalAuthToken, getQaLocalAuthHeader } from '@/lib/auth/qa-local';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';

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
          SPLOOT_DEPLOYMENT_IDENTITY: 'local-qa',
          SPLOOT_QA_ALLOWED_DEPLOYMENT_IDENTITIES: 'local-qa',
          SPLOOT_QA_AUTH_MODE: 'enabled',
          SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
        },
      }
    );

    const response = await handler(
      new NextRequest('http://localhost:3001/api/cache/stats', {
        headers: { [getQaLocalAuthHeader()]: token },
      }),
      { params: Promise.resolve({}) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      userId: 'qa-user-1',
      source: 'qa-local',
    });
  });
});
