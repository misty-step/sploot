import { NextRequest, NextResponse } from 'next/server';
import { syncUser } from '@/lib/db';

const QA_USER_ID = 'qa-design-user';
// Optional ?user= override so QA can walk non-seeded states (e.g. a 0-asset
// first-run library for the sploot-074 capture rig) without touching the
// seeded qa-design-user. Restricted to qa-* ids so the harness can never
// mint a session for a real account, even on a misconfigured non-prod deploy.
const QA_USER_ID_PATTERN = /^qa-[a-z0-9-]{1,64}$/;
// Keep convenience sessions within the same short-lived QA token bound.
const PWA_SESSION_SECONDS = 15 * 60;
const GALLERY_SESSION_SECONDS = 15 * 60;

/**
 * Dev-only browser sign-in for the qa-local auth harness. Reached only
 * through the compile-time NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD gate in the
 * route handler, so production bundles never contain this module; the
 * runtime isQaLocalAuthEnabled check below stays as the second gate.
 *
 * When SPLOOT_QA_AUTH_MODE=enabled, GET mints a signed qa-local token for
 * the seeded QA user (or a `?user=qa-…` override), sets it as the session
 * cookie, and redirects to /app -- so `pnpm dev:local` (PWA) and Gallery's
 * qa:gallery gate can both end at a signed-in grid without Clerk
 * credentials. Anywhere else this route is indistinguishable from a 404.
 * SPLOOT_QA_EVIDENCE_MODE is exclusively Gallery's runtime marker, so it is
 * the dispatch key between the two adapters -- PWA's own path below is
 * byte-identical to before Gallery's adapter existed.
 */
export async function handleQaLocalLoginRequest(request: NextRequest) {
  const isGalleryEvidence = process.env.SPLOOT_QA_EVIDENCE_MODE === 'enabled';
  const adapter = isGalleryEvidence
    ? await import('@/lib/auth/qa-gallery-local')
    : await import('@/lib/auth/qa-local');

  if (!adapter.isQaLocalAuthEnabled()) {
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

  const sessionSeconds = isGalleryEvidence ? GALLERY_SESSION_SECONDS : PWA_SESSION_SECONDS;
  const token = await adapter.createQaLocalAuthToken({
    userId,
    email,
    secret,
    expiresInSeconds: sessionSeconds,
  });

  const response = NextResponse.redirect(new URL('/app', request.url), 307);
  const cookie = [
    `${adapter.getQaLocalAuthCookieName()}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${sessionSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ].join('; ');
  response.headers.set('set-cookie', cookie);
  return response;
}
