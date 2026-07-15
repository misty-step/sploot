import { GET } from '@/app/api/qa-auth/login/route';
import { verifyQaLocalAuthHeaders } from '@/lib/auth/qa-local';
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
});
