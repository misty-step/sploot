import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import { getCanonicalWebRedirectUrl, isProtectedRoute } from './lib/middleware-shared'

const clerkRuntimeMiddleware = clerkMiddleware(async (auth: any, req: NextRequest) => {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308)
  if (isProtectedRoute(req)) {
    await auth.protect({ unauthenticatedUrl: new URL('/sign-in', req.url).toString() })
  }
})

// The local-auth production-start seam is compile-time gated by next.config.
// The runtime check keeps direct middleware contract tests honest while the
// production build aliases this module to middleware-runtime-qa when enabled.
export default async function runtimeMiddleware(...args: Parameters<typeof clerkRuntimeMiddleware>) {
  const req = args[0] as NextRequest
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true'
  ) {
    const { handleLocalMiddleware } = await import('./lib/middleware-local')
    const localResult = await handleLocalMiddleware(req)
    if (localResult.handled) return localResult.response
  }
  return clerkRuntimeMiddleware(...args)
}
