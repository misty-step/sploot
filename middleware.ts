import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { getDbFingerprint } from './lib/db-fingerprint'

// Define protected routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/app(.*)',
  '/api/upload-url(.*)',
  '/api/assets(.*)',
  '/api/search(.*)'
])

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health',
  '/s(.*)',  // Short share links
  '/m(.*)'   // Public meme pages
])

export default clerkMiddleware(async (auth, req) => {
  // Fail fast if DB host drifts from the canonical host (configured via env)
  if (process.env.NODE_ENV === 'production') {
    const expectedHost = process.env.DB_FINGERPRINT_HOST || null;
    const fp = getDbFingerprint();
    if (expectedHost && fp.host && fp.host !== expectedHost) {
      return new Response(
        JSON.stringify({
          error: 'Service temporarily unavailable',
          reason: 'db_fingerprint_mismatch',
          expectedHost,
          actualHost: fp.host,
        }),
        {
          status: 503,
          headers: {
            'content-type': 'application/json',
            'x-env-fingerprint': `${fp.host || 'unknown'}@${fp.hash}`,
          },
        }
      );
    }
  }

  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
