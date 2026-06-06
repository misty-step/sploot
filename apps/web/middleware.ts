import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'

// Define protected routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/app(.*)'
])

const CANONICAL_WEB_ORIGIN = 'https://www.sploot.app'

function isBrowserNavigationMethod(method: string | undefined) {
  return method === undefined || method === 'GET' || method === 'HEAD'
}

function isJsonApiRoute(pathname: string) {
  return pathname.startsWith('/api') || pathname.startsWith('/trpc')
}

export function getCanonicalWebRedirectUrl(req: Pick<NextRequest, 'method'> & { url?: string }) {
  if (!req.url) {
    return null
  }

  const url = new URL(req.url)

  if (url.hostname !== 'sploot.app') {
    return null
  }

  if (!isBrowserNavigationMethod(req.method) || isJsonApiRoute(url.pathname)) {
    return null
  }

  return new URL(`${url.pathname}${url.search}`, CANONICAL_WEB_ORIGIN)
}

export default clerkMiddleware(async (auth, req) => {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) {
    return NextResponse.redirect(canonicalUrl, 308)
  }

  if (isProtectedRoute(req)) {
    await auth.protect({ unauthenticatedUrl: new URL('/sign-in', req.url).toString() })
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Run Clerk middleware for API routes so route-level auth() can resolve,
    // but do not protect APIs here; API handlers own JSON 401 contracts.
    '/(api|trpc)(.*)',
  ],
}
