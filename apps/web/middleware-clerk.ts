import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getCanonicalWebRedirectUrl, isProtectedRoute } from './lib/middleware-shared'

// Loaded only when NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD is not 'true'. Keeping
// Clerk behind a dynamic import means a QA build never even constructs the
// wrapper at module init; the dev-server hang came from invoking Clerk on a
// loopback bind (vercel/next.js#94745), and its import-time construction was
// residual weight on that path.
export default clerkMiddleware(async (auth, req) => {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308)
  if (isProtectedRoute(req)) {
    await auth.protect({ unauthenticatedUrl: new URL('/sign-in', req.url).toString() })
  }
})
