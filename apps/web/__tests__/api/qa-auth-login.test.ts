import { GET } from '@/app/api/qa-auth/login/route';
import { verifyQaLocalAuthHeaders, QA_LOCAL_AUDIENCE, QA_LOCAL_DEPLOYMENT_ENV, QA_LOCAL_DEPLOYMENT_ID } from '@/lib/auth/qa-local';
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
    process.env.SPLOOT_QA_AUTH_SECRET = QA_SECRET;
    process.env.SPLOOT_DEPLOYMENT_ENV = 'test';
    process.env.SPLOOT_QA_DEPLOYMENT_ID = QA_LOCAL_DEPLOYMENT_ID;
    process.env.SPLOOT_QA_DEPLOYMENT_ENV = QA_LOCAL_DEPLOYMENT_ENV;
    process.env.SPLOOT_QA_AUDIENCE = QA_LOCAL_AUDIENCE;
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
    const headers = new Headers({ cookie: `sploot_qa_auth=${token}` });
    const auth = await verifyQaLocalAuthHeaders(headers);
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

    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('returns 404 when the qa-local build seam is compiled out, before any runtime gate', async () => {
    // Production builds inline NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD to 'false',
    // making the handler an unconditional 404 regardless of runtime env.
    process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD = 'false';

    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
