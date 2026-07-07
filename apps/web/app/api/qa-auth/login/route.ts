import { NextRequest, NextResponse } from 'next/server';
import {
  createQaLocalAuthToken,
  getQaLocalAuthCookieName,
  isQaLocalAuthEnabled,
} from '@/lib/auth/qa-local';
import { syncUser } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QA_USER_ID = 'qa-design-user';
const SESSION_SECONDS = 8 * 60 * 60;
// Optional ?user= override so QA can walk non-seeded states (e.g. a 0-asset
// first-run library for the sploot-074 capture rig) without touching the
// seeded qa-design-user. Restricted to qa-* ids so the harness can never
// mint a session for a real account, even on a misconfigured non-prod deploy.
const QA_USER_ID_PATTERN = /^qa-[a-z0-9-]{1,64}$/;

/**
 * Dev-only browser sign-in for the qa-local auth harness.
 *
 * When SPLOOT_QA_AUTH_MODE=enabled (hard-refused in production by
 * isQaLocalAuthEnabled), GET mints a signed qa-local token for the seeded
 * QA user (or a `?user=qa-…` override), sets it as the session cookie, and
 * redirects to /app — so `pnpm dev:local` can end at a signed-in grid without
 * Clerk credentials. Anywhere else this route is indistinguishable from a 404.
 */
export async function GET(request: NextRequest) {
  if (!isQaLocalAuthEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const secret = process.env.SPLOOT_QA_AUTH_SECRET;
  if (!secret) {
    return new NextResponse(null, { status: 404 });
  }

  const requestedUser = request.nextUrl.searchParams.get('user');
  if (requestedUser && !QA_USER_ID_PATTERN.test(requestedUser)) {
    return NextResponse.json(
      { error: 'qa-local user ids must match qa-[a-z0-9-]+' },
      { status: 400 }
    );
  }
  const userId = requestedUser || QA_USER_ID;
  const email = `${userId}@sploot.test`;

  // qa-local sessions skip the Clerk sync path, so make sure the user row
  // exists before the browser lands on /app (asset/stats routes join on it).
  // Best-effort: the seeded qa-design-user already has a row via qa:seed, and
  // minting a session must not depend on DB reachability (prior contract).
  try {
    await syncUser(userId, email);
  } catch {
    // /app surfaces will report their own DB errors if the row is missing.
  }

  const token = await createQaLocalAuthToken({
    userId,
    email,
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
