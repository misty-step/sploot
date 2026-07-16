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

const clerkAuthMiddleware = clerkMiddleware(async (auth, req) => {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) {
    return NextResponse.redirect(canonicalUrl, 308)
  }

  if (isProtectedRoute(req)) {
    // Compile-time omission: only explicit dev/test qa builds inline this
    // flag to 'true'. Production builds eliminate the qa-local bypass (and
    // its markers) entirely — proven by the production public-truth guard.
    if (process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true') {
      const { verifyQaLocalAuthHeaders } = await import('@/lib/auth/qa-local')
      const qaAuth = await verifyQaLocalAuthHeaders(req.headers ?? new Headers())
      if (qaAuth.status === 'authenticated') {
        return
      }
    }

    await auth.protect({ unauthenticatedUrl: new URL('/sign-in', req.url).toString() })
  }
})

/**
 * The production-shaped anonymous artifact has no provider credentials. Its
 * build-time-only seam makes the signed-out boundary explicit for public proof;
 * production authority rejects the artifact and always uses Clerk below.
 */
const publicTruthSignedOutMiddleware = (req: NextRequest) => {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308)
  if (isProtectedRoute(req)) return NextResponse.redirect(new URL('/sign-in', req.url), 307)
  return NextResponse.next()
}

const isPublicTruthSignedOutBuild =
  process.env.NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E === 'true' &&
  (process.env.SPLOOT_DEPLOYMENT_ENV === 'test' || process.env.SPLOOT_DEPLOYMENT_ENV === 'evidence')

export default isPublicTruthSignedOutBuild
  ? publicTruthSignedOutMiddleware
  : clerkAuthMiddleware

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Run Clerk middleware for API routes so route-level auth() can resolve,
    // but do not protect APIs here; API handlers own JSON 401 contracts.
    '/(api|trpc)(.*)',
  ],
}
