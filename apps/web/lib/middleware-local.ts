import { NextResponse, type NextRequest } from 'next/server'
import { getCanonicalWebRedirectUrl, isProtectedRoute } from './middleware-shared'

/**
 * Owns the whole middleware decision for a build that compiled the local
 * credential seam in.
 *
 * Terminal by construction: next.config only inlines
 * NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD='true' for an explicit development/test
 * deployment, and the local auth boundary additionally requires a loopback-only
 * bind. Handing such a request to Clerk is never correct, and under the
 * `-H 127.0.0.1` bind that boundary requires it is actively harmful: Clerk
 * rewrites to itself to attach request headers, which next@16 judges an
 * external rewrite and proxies back into the same listener until the dev proxy
 * resets (vercel/next.js#94745). A misconfigured local environment must
 * therefore land on the signed-out door, never on Clerk.
 *
 * Returning undefined means "continue to the route", matching Next's own
 * middleware contract.
 */
export async function handleLocalMiddleware(req: NextRequest): Promise<Response | undefined> {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308)
  if (!isProtectedRoute(req)) return undefined

  const signedOut = () => NextResponse.redirect(new URL('/sign-in', req.url), 307)

  // SPLOOT_QA_EVIDENCE_MODE is Gallery's runtime marker and selects its own
  // credential verifier; everything else uses the default PWA one.
  if (process.env.SPLOOT_QA_EVIDENCE_MODE === 'enabled') {
    const { isQaLocalAuthEnabled, verifyQaLocalAuthHeaders, getQaProofRequestContext } = await import('./auth/qa-gallery-local')
    if (!isQaLocalAuthEnabled()) return signedOut()
    const headers = req.headers ?? new Headers()
    const proofContext = getQaProofRequestContext(headers)
    const auth = await verifyQaLocalAuthHeaders(headers, process.env, {
      ...proofContext,
      host: req.nextUrl?.hostname ?? proofContext.host,
    })
    return auth.status === 'authenticated' ? undefined : signedOut()
  }

  const { isQaLocalAuthEnabled, verifyQaLocalAuthHeaders } = await import('./auth/qa-local')
  if (!isQaLocalAuthEnabled()) return signedOut()
  const auth = await verifyQaLocalAuthHeaders(req.headers ?? new Headers(), process.env)
  return auth.status === 'authenticated' ? undefined : signedOut()
}
