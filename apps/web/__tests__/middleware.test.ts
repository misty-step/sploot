import { beforeEach, describe, expect, it, vi } from 'vitest';

const { protectedRouteMatcherMock, publicRouteMatcherMock } = vi.hoisted(() => ({
  protectedRouteMatcherMock: vi.fn(),
  publicRouteMatcherMock: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: (patterns: string[]) => {
    if (patterns.includes('/app(.*)')) {
      return protectedRouteMatcherMock;
    }
    return publicRouteMatcherMock;
  },
}));

import middleware from '@/middleware';

describe('middleware auth bypass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    protectedRouteMatcherMock.mockReturnValue(true);
    publicRouteMatcherMock.mockReturnValue(false);
  });

  const createReq = (pathname: string) =>
    ({
      nextUrl: { pathname },
    }) as any;

  const createAuth = () =>
    ({
      protect: vi.fn().mockResolvedValue(undefined),
    }) as any;

  it('bypasses auth for exact and nested ingest routes', async () => {
    const auth = createAuth();

    await middleware(auth, createReq('/ingest'));
    await middleware(auth, createReq('/ingest/events'));

    expect(auth.protect).not.toHaveBeenCalled();
  });

  it('bypasses auth for exact and nested monitoring routes', async () => {
    const auth = createAuth();

    await middleware(auth, createReq('/monitoring'));
    await middleware(auth, createReq('/monitoring/health'));

    expect(auth.protect).not.toHaveBeenCalled();
  });

  it('does not bypass auth for lookalike prefixes', async () => {
    const auth = createAuth();

    await middleware(auth, createReq('/ingestion'));
    await middleware(auth, createReq('/monitoring-logs'));

    expect(auth.protect).toHaveBeenCalledTimes(2);
  });
});
