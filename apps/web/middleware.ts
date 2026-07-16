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

const clerkProtectedMiddleware = clerkMiddleware(async (auth, req) => {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) {
    return NextResponse.redirect(canonicalUrl, 308)
  }

  if (isProtectedRoute(req)) {
    const headers = req.headers ?? new Headers()
    const { getQaProofRequestContext, verifyQaLocalAuthHeaders } = await import('@/lib/auth/qa-local')
    const qaAuth = await verifyQaLocalAuthHeaders(headers, process.env, {
      ...getQaProofRequestContext(headers),
      host: req.nextUrl?.hostname ?? getQaProofRequestContext(headers).host,
    })
    if (qaAuth.status === 'authenticated') {
      return
    }

    await auth.protect({ unauthenticatedUrl: new URL('/sign-in', req.url).toString() })
  }
})

// The signed local QA principal is resolved by the route/auth layer and must
// be able to exercise a production Next server without a Clerk key. This
// branch is compile-time selected only for the explicit local evidence mode;
// normal development and production retain Clerk's middleware boundary.
const qaEvidenceMiddleware = async (req: NextRequest) => {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) {
    return NextResponse.redirect(canonicalUrl, 308)
  }

  if (isProtectedRoute(req)) {
    const headers = req.headers ?? new Headers()
    const { getQaProofRequestContext, verifyQaLocalAuthHeaders } = await import('@/lib/auth/qa-local')
    const qaAuth = await verifyQaLocalAuthHeaders(headers, process.env, {
      ...getQaProofRequestContext(headers),
      host: req.nextUrl?.hostname ?? getQaProofRequestContext(headers).host,
    })
    if (qaAuth.status !== 'authenticated') {
      return NextResponse.redirect(new URL('/sign-in', req.url))
    }
  }

  return
}

/**
 * The production-shaped anonymous artifact has no provider credentials.
 * Its build-time-only seam makes the signed-out boundary explicit for public proof.
 */
const publicTruthSignedOutMiddleware = (req: NextRequest) => {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308)
  if (isProtectedRoute(req)) return NextResponse.redirect(new URL('/sign-in', req.url), 307)
  return NextResponse.next()
}

function isPublicTruthSignedOutBuild() {
  return process.env.NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E === 'true' &&
    (process.env.SPLOOT_DEPLOYMENT_ENV === 'test' || process.env.SPLOOT_DEPLOYMENT_ENV === 'evidence')
}

function isQaLocalEvidenceBuild() {
  if (process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'false') return false
  return process.env.SPLOOT_QA_AUTH_MODE === 'enabled' &&
    process.env.SPLOOT_QA_EVIDENCE_MODE === 'enabled' &&
    process.env.DEPLOYMENT_ENV === 'qa-local'
}

export default function middleware(...args: any[]) {
  // Next invokes the compiled middleware with (request, event); the mocked
  // Clerk adapter in unit tests invokes the callback with (auth, request).
  // Select the request by shape so the QA seam never reads the event as a URL.
  const req = args[0]?.nextUrl ? args[0] : args[1] ?? args[0]
  if (isPublicTruthSignedOutBuild()) return publicTruthSignedOutMiddleware(req)
  return isQaLocalEvidenceBuild()
    ? qaEvidenceMiddleware(req)
    : (clerkProtectedMiddleware as unknown as (...middlewareArgs: unknown[]) => unknown)(...args)
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Run Clerk middleware for API routes so route-level auth() can resolve,
    // but do not protect APIs here; API handlers own JSON 401 contracts.
    '/(api|trpc)(.*)',
  ],
}
