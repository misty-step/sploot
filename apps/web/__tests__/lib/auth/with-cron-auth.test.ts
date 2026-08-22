import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { withCronAuth } from '@/lib/auth/with-cron-auth';

const mockHeaders = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

function authorizationHeaders(value: string | null) {
  return {
    get: (key: string) => (key === 'authorization' ? value : null),
  };
}

describe('withCronAuth', () => {
  const CRON_SECRET = 'test-cron-secret-key-12345';
  const handler = vi.fn(async () => NextResponse.json({ ok: true }));

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    handler.mockClear();
    mockHeaders.mockReturnValue(authorizationHeaders(`Bearer ${CRON_SECRET}`));
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('returns 500 when CRON_SECRET is not configured and does not call the handler', async () => {
    delete process.env.CRON_SECRET;
    const response = await withCronAuth(handler)(
      new NextRequest('http://localhost:3001/api/cron/example'),
      { params: Promise.resolve({}) }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'CRON_SECRET not configured' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when the authorization header is missing', async () => {
    mockHeaders.mockReturnValue(authorizationHeaders(null));
    const response = await withCronAuth(handler)(
      new NextRequest('http://localhost:3001/api/cron/example'),
      { params: Promise.resolve({}) }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 for a same-length wrong bearer token', async () => {
    mockHeaders.mockReturnValue(
      authorizationHeaders('Bearer ' + 'x'.repeat(CRON_SECRET.length))
    );
    const response = await withCronAuth(handler)(
      new NextRequest('http://localhost:3001/api/cron/example'),
      { params: Promise.resolve({}) }
    );

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 for a different-length bearer token', async () => {
    mockHeaders.mockReturnValue(authorizationHeaders('Bearer short'));
    const response = await withCronAuth(handler)(
      new NextRequest('http://localhost:3001/api/cron/example'),
      { params: Promise.resolve({}) }
    );

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls the handler when the bearer token matches CRON_SECRET', async () => {
    const response = await withCronAuth(handler)(
      new NextRequest('http://localhost:3001/api/cron/example'),
      { params: Promise.resolve({}) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
