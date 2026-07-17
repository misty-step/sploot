import { NextResponse, type NextRequest } from 'next/server'
import { getCanonicalWebRedirectUrl, isProtectedRoute } from './middleware-shared'

type LocalMiddlewareResult = { handled: true; response?: Response } | { handled: false }

export async function handleLocalMiddleware(req: NextRequest): Promise<LocalMiddlewareResult> {
  if (process.env.SPLOOT_QA_EVIDENCE_MODE === 'enabled') {
    const { isQaLocalAuthEnabled, verifyQaLocalAuthHeaders, getQaProofRequestContext } = await import('./auth/qa-gallery-local')
    if (!isQaLocalAuthEnabled()) return { handled: false }
    const canonicalUrl = getCanonicalWebRedirectUrl(req)
    if (canonicalUrl) return { handled: true, response: NextResponse.redirect(canonicalUrl, 308) }
    if (!isProtectedRoute(req)) return { handled: true }
    const headers = req.headers ?? new Headers()
    const auth = await verifyQaLocalAuthHeaders(headers, process.env, {
      ...getQaProofRequestContext(headers),
      host: req.nextUrl?.hostname ?? getQaProofRequestContext(headers).host,
    })
    if (auth.status === 'authenticated') return { handled: true }
    return { handled: true, response: NextResponse.redirect(new URL('/sign-in', req.url), 307) }
  }

  const { isQaLocalAuthEnabled, verifyQaLocalAuthHeaders } = await import('./auth/qa-local')
  if (!isQaLocalAuthEnabled()) return { handled: false }
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) return { handled: true, response: NextResponse.redirect(canonicalUrl, 308) }
  if (!isProtectedRoute(req)) return { handled: true }
  const auth = await verifyQaLocalAuthHeaders(req.headers ?? new Headers(), process.env)
  if (auth.status === 'authenticated') return { handled: true }
  return { handled: true, response: NextResponse.redirect(new URL('/sign-in', req.url), 307) }
}
