import { NextResponse, type NextRequest } from 'next/server'

export const isProtectedRoute = (req: NextRequest) => {
  const pathname = req.nextUrl?.pathname ?? (req.url ? new URL(req.url).pathname : '');
  return pathname === '/app' || pathname.startsWith('/app/');
}

const CANONICAL_WEB_ORIGIN = 'https://www.sploot.app'

function isBrowserNavigationMethod(method: string | undefined) {
  return method === undefined || method === 'GET' || method === 'HEAD'
}

function isJsonApiRoute(pathname: string) {
  return pathname.startsWith('/api') || pathname.startsWith('/trpc')
}

export function getCanonicalWebRedirectUrl(req: Pick<NextRequest, 'method'> & { url?: string }) {
  if (!req.url) return null
  const url = new URL(req.url)
  if (url.hostname !== 'sploot.app') return null
  if (!isBrowserNavigationMethod(req.method) || isJsonApiRoute(url.pathname)) return null
  return new URL(url.pathname + url.search, CANONICAL_WEB_ORIGIN)
}

export function publicTruthSignedOutMiddleware(req: NextRequest) {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308)
  if (isProtectedRoute(req)) return NextResponse.redirect(new URL('/sign-in', req.url), 307)
  return NextResponse.next()
}
