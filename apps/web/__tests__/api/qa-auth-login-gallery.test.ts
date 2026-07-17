import { GET } from '@/app/api/qa-auth/login/route';
import { createQaLocalAuthToken, verifyQaLocalAuthHeaders } from '@/lib/auth/qa-gallery-local';
import { NextRequest } from 'next/server';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const QA_SECRET = 'qa-auth-login-test-secret-with-entropy';

function makeRequest(url = 'http://localhost:3001/api/qa-auth/login') {
  return new NextRequest(url);
}

describe('/api/qa-auth/login', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SPLOOT_QA_AUTH_MODE = 'enabled';
    process.env.SPLOOT_QA_EVIDENCE_MODE = 'enabled';
    process.env.SPLOOT_QA_DEPLOYMENT_ID = 'sploot-gallery-qa-local';
    process.env.SPLOOT_QA_DEPLOYMENT_AUDIENCE = 'sploot-gallery-evidence';
    process.env.DEPLOYMENT_ENV = 'qa-local';
    process.env.SPLOOT_QA_AUTH_SECRET = QA_SECRET;
    process.env.SPLOOT_DEPLOYMENT_ENV = 'test';
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('sets a verifiable qa-local session cookie and redirects to /app', async () => {
    const res = await GET(makeRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3001/app');

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('sploot_qa_auth=');
    expect(setCookie.toLowerCase()).toContain('httponly');

    const token = decodeURIComponent(
      setCookie.split(';')[0].replace('sploot_qa_auth=', '')
    );
    const headers = new Headers({
      host: 'localhost:3001',
      cookie: `sploot_qa_auth=${token}`,
      'x-sploot-qa-remote-address': '127.0.0.1',
    });
    const auth = await verifyQaLocalAuthHeaders(headers, process.env, {
      host: 'localhost',
      remoteAddress: '127.0.0.1',
    });
    expect(auth.status).toBe('authenticated');
    if (auth.status === 'authenticated') {
      expect(auth.principal.userId).toBe('qa-design-user');
    }
  });

  it('returns 404 when qa-local auth mode is not enabled', async () => {
    delete process.env.SPLOOT_QA_AUTH_MODE;

    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('returns 404 in production even when mode is enabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SPLOOT_DEPLOYMENT_ENV = 'production';
    process.env.DEPLOYMENT_ENV = 'production';

    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('returns 404 when the qa-local build seam is compiled out, before any runtime gate', async () => {
    process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD = 'false';

    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('uses the refreshed signed cookie when an older header is also present', async () => {
    const staleHeaderToken = await createQaLocalAuthToken({
      userId: 'qa-design-user',
      email: 'qa-design-user@qa.local',
      secret: QA_SECRET,
      expiresInSeconds: 15 * 60,
    });
    const refreshedCookieToken = await createQaLocalAuthToken({
      userId: 'qa-design-user',
      email: 'qa-design-user@sploot.test',
      secret: QA_SECRET,
      expiresInSeconds: 15 * 60,
    });
    const headers = new Headers({
      host: 'localhost:3001',
      cookie: `sploot_qa_auth=${encodeURIComponent(refreshedCookieToken)}`,
      'x-sploot-qa-auth': staleHeaderToken,
    });

    const auth = await verifyQaLocalAuthHeaders(headers, process.env, {
      host: 'localhost',
      remoteAddress: '127.0.0.1',
    });

    expect(auth.status).toBe('authenticated');
    if (auth.status === 'authenticated') {
      expect(auth.principal.email).toBe('qa-design-user@sploot.test');
    }
  });
});
