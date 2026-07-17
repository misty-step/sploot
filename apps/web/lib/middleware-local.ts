import { NextResponse, type NextRequest } from 'next/server'
import { isQaLocalAuthEnabled, verifyQaLocalAuthHeaders } from './auth/qa-local'
import { getCanonicalWebRedirectUrl, isProtectedRoute } from './middleware-shared'

type LocalMiddlewareResult = { handled: true; response?: Response } | { handled: false }

export async function handleLocalMiddleware(req: NextRequest): Promise<LocalMiddlewareResult> {
  if (!isQaLocalAuthEnabled()) return { handled: false }
  const canonicalUrl = getCanonicalWebRedirectUrl(req)
  if (canonicalUrl) return { handled: true, response: NextResponse.redirect(canonicalUrl, 308) }
  if (!isProtectedRoute(req)) return { handled: true }
  const auth = await verifyQaLocalAuthHeaders(req.headers ?? new Headers(), process.env)
  if (auth.status === 'authenticated') return { handled: true }
  return { handled: true, response: NextResponse.redirect(new URL('/sign-in', req.url), 307) }
}
