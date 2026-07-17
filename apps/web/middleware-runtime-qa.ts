import { NextResponse, type NextRequest } from 'next/server'
import { getCanonicalWebRedirectUrl, isProtectedRoute } from './lib/middleware-shared'

// Both PWA's local capture harness and Gallery's evidence harness compile
// this build-time-selected module (next.config aliases '@/middleware-runtime'
// here whenever NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD is 'true'). SPLOOT_QA_EVIDENCE_MODE
// is exclusively Gallery's runtime marker, so it is the correct dispatch key
// -- everything else (including this file's own default PWA behavior) is
// byte-identical to before Gallery's adapter existed.
export default async function qaMiddleware(req: NextRequest) {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308)
  if (!isProtectedRoute(req)) return NextResponse.next()

  if (process.env.SPLOOT_QA_EVIDENCE_MODE === 'enabled') {
    const { isQaLocalAuthEnabled, verifyQaLocalAuthHeaders, getQaProofRequestContext } = await import('./lib/auth/qa-gallery-local')
    if (!isQaLocalAuthEnabled()) return NextResponse.redirect(new URL('/sign-in', req.url), 307)
    const headers = req.headers ?? new Headers()
    const qaAuth = await verifyQaLocalAuthHeaders(headers, process.env, {
      ...getQaProofRequestContext(headers),
      host: req.nextUrl?.hostname ?? getQaProofRequestContext(headers).host,
    })
    if (qaAuth.status === 'authenticated') return
    return NextResponse.redirect(new URL('/sign-in', req.url), 307)
  }

  const { isQaLocalAuthEnabled, verifyQaLocalAuthHeaders } = await import('./lib/auth/qa-local')
  if (!isQaLocalAuthEnabled()) return NextResponse.redirect(new URL('/sign-in', req.url), 307)
  const qaAuth = await verifyQaLocalAuthHeaders(req.headers ?? new Headers(), process.env)
  if (qaAuth.status === 'authenticated') return
  return NextResponse.redirect(new URL('/sign-in', req.url), 307)
}
