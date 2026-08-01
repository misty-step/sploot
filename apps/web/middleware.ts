import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { isQaLocalAuthEnabled } from '@/lib/auth/qa-local-enabled'

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

const qaOnlyMiddleware = async (req: NextRequest) => {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308)
  if (!isProtectedRoute(req)) return NextResponse.next()

  // QA production artifacts never need a Clerk network handshake: the
  // request-bound local token is the complete auth contract for both signed-in
  // and signed-out browser cases. This branch is compile-time selected only
  // for the explicit QA build.
  if (isQaLocalAuthEnabled()) {
    const { verifyQaLocalAuthHeaders } = await import('@/lib/auth/qa-local')
    const qaAuth = await verifyQaLocalAuthHeaders(req.headers ?? new Headers(), process.env)
    if (qaAuth.status === 'authenticated') return NextResponse.next()
    return NextResponse.redirect(new URL('/sign-in', req.url), 307)
  }
  return NextResponse.redirect(new URL('/sign-in', req.url), 307)
}

const localQaMiddleware = process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true'
  ? qaOnlyMiddleware
  : clerkMiddleware(async (auth: any, req: NextRequest) => {
      const canonicalUrl = getCanonicalWebRedirectUrl(req)
      if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308)
      if (isProtectedRoute(req)) {
        if (process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD !== 'false' && isQaLocalAuthEnabled()) {
          const { verifyQaLocalAuthHeaders } = await import('@/lib/auth/qa-local')
          const qaAuth = await verifyQaLocalAuthHeaders(req.headers ?? new Headers(), process.env)
          if (qaAuth.status === 'authenticated') return
          if (qaAuth.status === 'forbidden') return NextResponse.redirect(new URL('/sign-in', req.url), 307)
        }
        await auth.protect({ unauthenticatedUrl: new URL('/sign-in', req.url).toString() })
      }
    })

export default isPublicTruthSignedOutBuild
  ? publicTruthSignedOutMiddleware
  : localQaMiddleware

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Run Clerk middleware for API routes so route-level auth() can resolve,
    // but do not protect APIs here; API handlers own JSON 401 contracts.
    '/(api|trpc)(.*)',
  ],
}
