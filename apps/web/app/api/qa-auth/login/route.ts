import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dev-only qa-local browser sign-in. The compile-time flag below is inlined
 * by next.config: production builds compile this handler to an unconditional
 * 404 and dead-code-eliminate the qa-local machinery out of the bundle (the
 * production public-truth guard proves the omission). Dev/test qa builds
 * keep the runtime SPLOOT_QA_AUTH_MODE + secret gates inside the handler.
 */
export async function GET(request: NextRequest) {
  // The import must live INSIDE the statically-evaluable if: webpack only
  // eliminates dead dynamic-import chunks from a constant-false branch, not
  // from code below an early return.
  if (process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true') {
    const { handleQaLocalLoginRequest } = await import('@/lib/auth/qa-local-login');
    return handleQaLocalLoginRequest(request);
  }

  return new NextResponse(null, { status: 404 });
}
