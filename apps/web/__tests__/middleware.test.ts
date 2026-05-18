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
  it.each(['/app', '/app/search', '/app/upload'])(
    'protects %s and sends unauthenticated users to /sign-in',
    async (pathname) => {
      const protect = vi.fn();

      await middleware(
        { protect } as any,
        { nextUrl: { pathname } } as any
      );

      expect(protect).toHaveBeenCalledTimes(1);
      expect(protect).toHaveBeenCalledWith({ unauthenticatedUrl: '/sign-in' });
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
