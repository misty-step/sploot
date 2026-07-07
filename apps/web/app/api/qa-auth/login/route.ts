import { NextRequest, NextResponse } from 'next/server';
import {
  createQaLocalAuthToken,
  getQaLocalAuthCookieName,
  isQaLocalAuthEnabled,
} from '@/lib/auth/qa-local';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QA_USER_ID = 'qa-design-user';
const SESSION_SECONDS = 8 * 60 * 60;

/**
 * Dev-only browser sign-in for the qa-local auth harness.
 *
 * When SPLOOT_QA_AUTH_MODE=enabled (hard-refused in production by
 * isQaLocalAuthEnabled), GET mints a signed qa-local token for the seeded
 * QA user, sets it as the session cookie, and redirects to /app — so
 * `pnpm dev:local` can end at a signed-in, seeded grid without Clerk
 * credentials. Anywhere else this route is indistinguishable from a 404.
 */
export async function GET(request: NextRequest) {
  if (!isQaLocalAuthEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const secret = process.env.SPLOOT_QA_AUTH_SECRET;
  if (!secret) {
    return new NextResponse(null, { status: 404 });
  }

  const token = await createQaLocalAuthToken({
    userId: QA_USER_ID,
    email: `${QA_USER_ID}@sploot.test`,
    secret,
    expiresInSeconds: SESSION_SECONDS,
  });

  const response = NextResponse.redirect(new URL('/app', request.url), 307);
  const cookie = [
    `${getQaLocalAuthCookieName()}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ].join('; ');
  response.headers.set('set-cookie', cookie);
  return response;
}
