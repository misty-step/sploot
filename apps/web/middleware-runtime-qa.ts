import { NextResponse, type NextRequest } from 'next/server'
import { isQaLocalAuthEnabled, verifyQaLocalAuthHeaders } from './lib/auth/qa-local'
import { getCanonicalWebRedirectUrl, isProtectedRoute } from './lib/middleware-shared'

export default async function qaMiddleware(req: NextRequest) {
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308)
  if (!isProtectedRoute(req)) return NextResponse.next()
  if (!isQaLocalAuthEnabled()) return NextResponse.redirect(new URL('/sign-in', req.url), 307)
  const qaAuth = await verifyQaLocalAuthHeaders(req.headers ?? new Headers(), process.env)
  if (qaAuth.status === 'authenticated') return
  return NextResponse.redirect(new URL('/sign-in', req.url), 307)
}
