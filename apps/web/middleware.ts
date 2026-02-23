import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

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
  // Bypass auth for analytics and monitoring proxies
  const { pathname } = req.nextUrl
  if (
    pathname === '/ingest' || pathname.startsWith('/ingest/') ||
    pathname === '/monitoring' || pathname.startsWith('/monitoring/')
  ) {
    return;
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
