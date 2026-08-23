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

// The local-auth seam is compile-time gated, exactly like lib/auth/server.ts
// and lib/auth/request-auth.ts: next.config inlines
// NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD, so a production build folds this branch to
// `false`, drops the dynamic import, and never ships the QA credential
// machinery (proven by the production public-truth guard on every CI run).
//
// Two properties are load-bearing and neither may be weakened:
//
// 1. It must NOT also require NODE_ENV === 'production'. `pnpm dev:local` is a
//    development-mode QA build, and that conjunct left Clerk owning middleware
//    for the entire local flow.
// 2. When the flag is on, the seam is TERMINAL — Clerk is unreachable. Such a
//    build is by next.config's own gate a development/test deployment on a
//    loopback-only bind, where Clerk's rewrite-to-self is judged an external
//    rewrite and proxied back into the same listener until the dev proxy
//    resets (vercel/next.js#94745). Falling through to Clerk on a
//    misconfigured local environment reintroduces exactly that hang.
export default async function runtimeMiddleware(...args: Parameters<typeof clerkRuntimeMiddleware>) {
  if (process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true') {
    // Dynamic import required: a static import would put the QA credential
    // machinery in the production module graph even though the branch is dead.
    const { handleLocalMiddleware } = await import('./lib/middleware-local')
    return handleLocalMiddleware(args[0] as NextRequest)
  }
  return clerkRuntimeMiddleware(...args)
}
