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
// It must NOT also require NODE_ENV === 'production': `pnpm dev:local` is a
// development-mode QA build, and gating on NODE_ENV left Clerk owning
// middleware there — which, under the `-H 127.0.0.1` loopback bind the local
// auth boundary requires, turns Clerk's rewrite-to-self into an infinite
// dev-server proxy loop (vercel/next.js#94745).
export default async function runtimeMiddleware(...args: Parameters<typeof clerkRuntimeMiddleware>) {
  const req = args[0] as NextRequest
  if (process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true') {
    // Dynamic import required: a static import would put the QA credential
    // machinery in the production module graph even though the branch is dead.
    const { handleLocalMiddleware } = await import('./lib/middleware-local')
    const localResult = await handleLocalMiddleware(req)
    if (localResult.handled) return localResult.response
  }
  return clerkRuntimeMiddleware(...args)
}
