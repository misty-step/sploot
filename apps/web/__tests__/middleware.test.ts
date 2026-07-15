import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', () => {
  const createRouteMatcher = (patterns: string[]) => {
    const regexes = patterns.map((pattern) => new RegExp(`^${pattern.replace(/\(\.\*\)/g, '.*')}$`));

    return (req: { nextUrl?: { pathname?: string }; url?: string }) => {
      const pathname = req.nextUrl?.pathname
        ?? (req.url ? new URL(req.url).pathname : '');

      return regexes.some((regex) => regex.test(pathname));
    };
  };

  return {
    createRouteMatcher,
    clerkMiddleware: (handler: any) => handler,
  };
});

import middleware, { config } from '@/middleware';
import { createQaLocalAuthToken, createQaLocalProxyProof, getQaLocalAuthHeader, getQaLocalProxyProofHeader } from '@/lib/auth/qa-local';

describe('middleware auth boundary', () => {
  const QA_SECRET = 'test-secret-with-enough-entropy';

  beforeEach(() => {
    vi.stubEnv('SPLOOT_QA_AUTH_MODE', 'enabled');
    vi.stubEnv('CLERK_SECRET_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('SPLOOT_QA_AUTH_SECRET', QA_SECRET);
    vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['/', 'https://www.sploot.app/'],
    ['/app?from=apex', 'https://www.sploot.app/app?from=apex'],
    ['/sign-in', 'https://www.sploot.app/sign-in'],
  ])(
    'canonicalizes apex browser route %s before auth checks',
    async (requestPath, expectedLocation) => {
      const protect = vi.fn();

      const response = await middleware(
        { protect } as any,
        {
          method: 'GET',
          nextUrl: { pathname: new URL(requestPath, 'https://sploot.app').pathname },
          url: `https://sploot.app${requestPath}`,
        } as any
      );

      expect(response?.status).toBe(308);
      expect(response?.headers.get('location')).toBe(expectedLocation);
      expect(protect).not.toHaveBeenCalled();
    }
  );

  it('does not canonicalize apex json api routes in middleware', async () => {
    const protect = vi.fn();

    const response = await middleware(
      { protect } as any,
      {
        method: 'GET',
        nextUrl: { pathname: '/api/assets' },
        url: 'https://sploot.app/api/assets?limit=1',
      } as any
    );

    expect(response).toBeUndefined();
    expect(protect).not.toHaveBeenCalled();
  });

  it.each(['/app', '/app/search', '/app/upload'])(
    'protects %s and sends unauthenticated users to /sign-in',
    async (pathname) => {
      const protect = vi.fn();

      await middleware(
        { protect } as any,
        { nextUrl: { pathname }, url: `https://www.sploot.app${pathname}` } as any
      );

      expect(protect).toHaveBeenCalledTimes(1);
      expect(protect).toHaveBeenCalledWith({ unauthenticatedUrl: 'https://www.sploot.app/sign-in' });
    }
  );

  it('allows signed qa-local app navigation without Clerk protect outside production', async () => {
    vi.stubEnv('SPLOOT_QA_EVIDENCE_MODE', 'enabled');
    vi.stubEnv('SPLOOT_QA_DEPLOYMENT_ID', 'sploot-gallery-qa-local');
    vi.stubEnv('SPLOOT_QA_DEPLOYMENT_AUDIENCE', 'sploot-gallery-evidence');
    vi.stubEnv('DEPLOYMENT_ENV', 'qa-local');
    const protect = vi.fn();
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: QA_SECRET,
      expiresInSeconds: 60,
    });
    const proxyProof = await createQaLocalProxyProof('localhost', '127.0.0.1', QA_SECRET);

    const response = await middleware(
      { protect } as any,
      {
        method: 'GET',
        nextUrl: { pathname: '/app' },
        url: 'http://localhost:3001/app',
        headers: new Headers({
          host: 'localhost:3001',
          [getQaLocalAuthHeader()]: token,
          [getQaLocalProxyProofHeader()]: proxyProof,
        }),
      } as any
    );

    expect(response).toBeUndefined();
    expect(protect).not.toHaveBeenCalled();
  });

  it('never consults qa-local when the build seam is compiled out', async () => {
    vi.stubEnv('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD', 'false');
    const protect = vi.fn();
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: QA_SECRET,
      expiresInSeconds: 60,
    });

    await middleware(
      { protect } as any,
      {
        method: 'GET',
        nextUrl: { pathname: '/app' },
        url: 'https://www.sploot.app/app',
        headers: new Headers({ [getQaLocalAuthHeader()]: token }),
      } as any
    );

    expect(protect).toHaveBeenCalledTimes(1);
  });

  it('does not let qa-local bypass app protection in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', 'production');
    const protect = vi.fn();
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: QA_SECRET,
      expiresInSeconds: 60,
    });

    await middleware(
      { protect } as any,
      {
        method: 'GET',
        nextUrl: { pathname: '/app' },
        url: 'https://www.sploot.app/app',
        headers: new Headers({ [getQaLocalAuthHeader()]: token }),
      } as any
    );

    expect(protect).toHaveBeenCalledTimes(1);
  });

  it.each(['/api/stats', '/api/tags', '/api/assets'])(
    'does not protect json api route %s',
    async (pathname) => {
      const protect = vi.fn();

      await middleware(
        { protect } as any,
        { nextUrl: { pathname } } as any
      );

      expect(protect).not.toHaveBeenCalled();
    }
  );

  it('matches api routes without protecting them', () => {
    expect(config.matcher).toContain('/(api|trpc)(.*)');
  });
});
