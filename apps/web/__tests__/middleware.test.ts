import { beforeEach, describe, expect, it, vi } from 'vitest';

// Model Clerk's real contract: clerkMiddleware(handler) returns the Next
// middleware entry (request, event), and supplies the auth object itself. The
// exported middleware must therefore always be called request-first, exactly
// as Next calls it — an inverted (auth, request) mock hides whether the
// local-auth seam reads the right argument.
const { protect } = vi.hoisted(() => ({ protect: vi.fn() }));

vi.mock('@clerk/nextjs/server', () => {
  const createRouteMatcher = (patterns: string[]) => {
    const regexes = patterns.map((pattern) => new RegExp(`^${pattern.replace(/\(\.\*\)/g, '.*')}$`));

    return (req: { nextUrl?: { pathname?: string }; url?: string }) => {
      const pathname = req.nextUrl?.pathname
        ?? (req.url ? new URL(req.url).pathname : '');

      return regexes.some((regex) => regex.test(pathname));
    };
  };

  type ClerkHandler = (
    auth: { protect: typeof protect },
    request: NextRequest
  ) => Promise<Response | undefined>;

  return {
    createRouteMatcher,
    clerkMiddleware: (handler: ClerkHandler) => (request: NextRequest) => handler({ protect }, request),
  };
});

import { NextRequest } from 'next/server';

import middleware, { config } from '@/middleware';
import { createQaLocalAuthToken, getQaLocalAuthHeader } from '@/lib/auth/qa-local';

// `middleware`'s static type is Clerk's (request, event) pair. Next never
// requires the event here and a NextFetchEvent cannot be constructed in a unit
// test, so this boundary takes one documented unchecked cast rather than
// leaving every call site untyped.
const invokeMiddleware = middleware as unknown as (
  request: NextRequest
) => Promise<Response | undefined>;

describe('middleware auth boundary', () => {
  const QA_SECRET = 'test-secret-with-enough-entropy';

  beforeEach(() => {
    protect.mockReset();
    vi.stubEnv('SPLOOT_QA_AUTH_MODE', 'enabled');
    vi.stubEnv('SPLOOT_QA_AUTH_SECRET', QA_SECRET);
    vi.stubEnv('SPLOOT_QA_DEPLOYMENT_ID', 'local-pwa-capture-v1');
    vi.stubEnv('SPLOOT_QA_DEPLOYMENT_ENV', 'local-qa');
    vi.stubEnv('SPLOOT_QA_AUDIENCE', 'sploot-pwa-capture');
    vi.stubEnv('SPLOOT_QA_BIND_HOST', '127.0.0.1');
    vi.stubEnv('SPLOOT_QA_LOCAL_CAPABILITY', '0123456789abcdef0123456789abcdef0123456789abcdef');
    vi.stubEnv('DEPLOYMENT_ENV', 'local-qa');
    vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', 'test');
  });

  it.each([
    ['/', 'https://www.sploot.app/'],
    ['/app?from=apex', 'https://www.sploot.app/app?from=apex'],
    ['/sign-in', 'https://www.sploot.app/sign-in'],
  ])(
    'canonicalizes apex browser route %s before auth checks',
    async (requestPath, expectedLocation) => {
      const response = await invokeMiddleware(new NextRequest(`https://sploot.app${requestPath}`));

      expect(response?.status).toBe(308);
      expect(response?.headers.get('location')).toBe(expectedLocation);
      expect(protect).not.toHaveBeenCalled();
    }
  );

  it('does not canonicalize apex json api routes in middleware', async () => {
    const response = await invokeMiddleware(new NextRequest('https://sploot.app/api/assets?limit=1'));

    expect(response).toBeUndefined();
    expect(protect).not.toHaveBeenCalled();
  });

  it.each(['/app', '/app/search', '/app/upload'])(
    'protects %s with Clerk and sends unauthenticated users to /sign-in',
    async (pathname) => {
      // The deployed build compiles the local-auth seam out, so Clerk owns
      // every protected-route decision there.
      vi.stubEnv('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD', 'false');

      await invokeMiddleware(new NextRequest(`https://www.sploot.app${pathname}`));

      expect(protect).toHaveBeenCalledTimes(1);
      expect(protect).toHaveBeenCalledWith({ unauthenticatedUrl: 'https://www.sploot.app/sign-in' });
    }
  );

  it('engages the local-auth seam in a development-mode QA build', async () => {
    // `pnpm dev:local` is a development-mode QA build. Gating this seam on
    // NODE_ENV === 'production' left Clerk owning middleware for the entire
    // local flow, and Clerk's rewrite-to-self then looped the dev server.
    vi.stubEnv('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD', 'true');
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: QA_SECRET,
      expiresInSeconds: 60,
    });

    const response = await invokeMiddleware(
      new NextRequest('http://127.0.0.1:3001/app', {
        headers: new Headers({ [getQaLocalAuthHeader()]: token }),
      })
    );

    expect(response).toBeUndefined();
    expect(protect).not.toHaveBeenCalled();
  });

  it('sends unauthenticated app navigation to /sign-in in a development-mode QA build', async () => {
    vi.stubEnv('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD', 'true');

    const response = await invokeMiddleware(new NextRequest('http://127.0.0.1:3001/app'));

    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toBe('http://127.0.0.1:3001/sign-in');
    expect(protect).not.toHaveBeenCalled();
  });

  it('never consults the local credential when the build seam is compiled out', async () => {
    vi.stubEnv('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD', 'false');
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: QA_SECRET,
      expiresInSeconds: 60,
    });

    await invokeMiddleware(
      new NextRequest('https://www.sploot.app/app', {
        headers: new Headers({ [getQaLocalAuthHeader()]: token }),
      })
    );

    expect(protect).toHaveBeenCalledTimes(1);
  });

  it('uses the compile-time-gated local boundary for production-start acceptance mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD', 'true');
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: QA_SECRET,
      expiresInSeconds: 60,
    });

    const response = await invokeMiddleware(
      new NextRequest('http://127.0.0.1:3108/app', {
        headers: new Headers({ [getQaLocalAuthHeader()]: token }),
      })
    );

    expect(response).toBeUndefined();
    expect(protect).not.toHaveBeenCalled();
  });

  it('does not let a local credential bypass app protection in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', 'production');
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: QA_SECRET,
      expiresInSeconds: 60,
    });

    await invokeMiddleware(
      new NextRequest('https://www.sploot.app/app', {
        headers: new Headers({ [getQaLocalAuthHeader()]: token }),
      })
    );

    expect(protect).toHaveBeenCalledTimes(1);
  });

  it.each(['/api/stats', '/api/tags', '/api/assets'])(
    'does not protect json api route %s',
    async (pathname) => {
      await invokeMiddleware(new NextRequest(`https://www.sploot.app${pathname}`));

      expect(protect).not.toHaveBeenCalled();
    }
  );

  it('matches api routes without protecting them', () => {
    expect(config.matcher).toContain('/(api|trpc)(.*)');
  });
});
