import runtimeMiddleware from '@/middleware-runtime'
import { getCanonicalWebRedirectUrl, isProtectedRoute, publicTruthSignedOutMiddleware } from './lib/middleware-shared'

// Public truth is selected at build time for the signed-out artifact. The
// runtime auth implementation is webpack-selected independently so production
// never imports the QA credential machinery.
const isPublicTruthSignedOutBuild =
  process.env.NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E === 'true' &&
  (process.env.SPLOOT_DEPLOYMENT_ENV === 'test' || process.env.SPLOOT_DEPLOYMENT_ENV === 'evidence')

export default isPublicTruthSignedOutBuild
  ? publicTruthSignedOutMiddleware
  : runtimeMiddleware

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Run auth middleware for API routes so route-level auth() can resolve,
    // but do not protect APIs here; API handlers own JSON 401 contracts.
    '/(api|trpc)(.*)',
  ],
}

export { getCanonicalWebRedirectUrl, isProtectedRoute }
