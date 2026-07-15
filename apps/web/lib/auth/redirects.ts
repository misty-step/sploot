import type { NextRequest } from 'next/server';

const AUTH_ORIGIN = 'http://sploot.internal';
const DEFAULT_AUTH_DESTINATION = '/app';

/** Accept only an application-relative destination for an auth redirect. */
export function safeInternalPath(
  value: string | null | undefined,
  fallback = DEFAULT_AUTH_DESTINATION
): string {
  if (!value || /[\u0000-\u001f\u007f\\]/.test(value)) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (!decoded.startsWith('/') || decoded.startsWith('//')) return fallback;

  try {
    const parsed = new URL(decoded, AUTH_ORIGIN);
    if (parsed.origin !== AUTH_ORIGIN) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export function signInRedirectUrl(req: NextRequest): URL {
  const requested = req.nextUrl.searchParams?.get('redirect_url')
    ?? req.nextUrl.searchParams?.get('return_to');
  const destination = safeInternalPath(
    requested,
    req.nextUrl.pathname
  );
  const url = new URL('/sign-in', req.url);
  url.searchParams.set('redirect_url', destination);
  return url;
}
