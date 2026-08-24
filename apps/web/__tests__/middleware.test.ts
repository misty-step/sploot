import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  // vitest.config.ts does not set `unstubEnvs`, so NODE_ENV and the build flag
  // would otherwise leak forward and make these cases order-dependent.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Apex canonicalization is a production contract, so it must hold on BOTH
  // sides of the seam: Clerk owns it in the deployed build (flag 'false'),
  // handleLocalMiddleware owns it in a QA build (flag 'true'). Covering only
  // one side let the other regress green.
  it.each([
    ['/', 'https://www.sploot.app/', 'false'],
    ['/app?from=apex', 'https://www.sploot.app/app?from=apex', 'false'],
    ['/sign-in', 'https://www.sploot.app/sign-in', 'false'],
    ['/', 'https://www.sploot.app/', 'true'],
    ['/app?from=apex', 'https://www.sploot.app/app?from=apex', 'true'],
    ['/sign-in', 'https://www.sploot.app/sign-in', 'true'],
  ])(
    'canonicalizes apex browser route %s before auth checks (qa build flag %s)',
    async (requestPath, expectedLocation, buildFlag) => {
      vi.stubEnv('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD', buildFlag);

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
    // NODE_ENV is pinned so this guard fails on the reintroduced conjunct
    // regardless of test order or the ambient NODE_ENV of the vitest job.
    vi.stubEnv('NODE_ENV', 'development');
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
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD', 'true');

    const response = await invokeMiddleware(new NextRequest('http://127.0.0.1:3001/app'));

    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toBe('http://127.0.0.1:3001/sign-in');
    expect(protect).not.toHaveBeenCalled();
  });

  it.each([
    // Enablement arm — isQaLocalAuthEnabled() itself returns false. This is
    // the arm that used to hand the request back to Clerk.
    ['qa auth mode off', 'SPLOOT_QA_AUTH_MODE', ''],
    ['deployment marker not dev/test', 'SPLOOT_DEPLOYMENT_ENV', 'production'],
    // Verify arm — enablement passes but validateQaLocalDeploymentConfig
    // rejects the environment, yielding a forbidden credential.
    ['secret missing', 'SPLOOT_QA_AUTH_SECRET', ''],
    ['audience not canonical', 'SPLOOT_QA_AUDIENCE', ''],
    ['deployment id not allowlisted', 'SPLOOT_QA_DEPLOYMENT_ID', ''],
  ])(
    'never reaches Clerk in a QA build when the local environment is invalid (%s)',
    async (_label, brokenVar, brokenValue) => {
      // A build that compiled the local credential seam in is, by
      // next.config's own gate, a development/test deployment on a
      // loopback-only bind. Falling through to Clerk there re-triggers the
      // rewrite-to-self proxy loop (vercel/next.js#94745) — a 30s hang with no
      // diagnosis instead of a signed-out door.
      vi.stubEnv('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD', 'true');
      vi.stubEnv(brokenVar, brokenValue);
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

      expect(protect).not.toHaveBeenCalled();
      expect(response?.status).toBe(307);
      expect(response?.headers.get('location')).toBe('http://127.0.0.1:3001/sign-in');
    }
  );

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

  it.each([
    ['the seam compiled out', 'false'],
    ['the seam somehow compiled in', 'true'],
  ])(
    'does not let a local credential bypass app protection in production (%s)',
    async (_label, buildFlag) => {
      // The contract is "no access granted", not "Clerk was consulted". With
      // the seam compiled out Clerk denies; with it compiled in the local
      // boundary rejects the production environment and denies itself. Either
      // way the request must not be allowed through to the route.
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD', buildFlag);
      const token = await createQaLocalAuthToken({
        userId: 'qa-user-1',
        secret: QA_SECRET,
        expiresInSeconds: 60,
      });

      const response = await invokeMiddleware(
        new NextRequest('https://www.sploot.app/app', {
          headers: new Headers({ [getQaLocalAuthHeader()]: token }),
        })
      );

      // `undefined` means "continue to the protected route" — a bypass.
      const deniedByClerk = protect.mock.calls.length === 1;
      const deniedBySeam = response?.status === 307
        && response.headers.get('location') === 'https://www.sploot.app/sign-in';
      expect(deniedByClerk || deniedBySeam).toBe(true);
    }
  );

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
