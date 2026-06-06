import { describe, expect, it, vi } from 'vitest';

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

describe('middleware auth boundary', () => {
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
