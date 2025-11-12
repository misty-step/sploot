import { NextRequest } from 'next/server';
import { createClerkClient } from '@clerk/backend';

/**
 * Verify Bearer token or cookie authentication for API requests
 *
 * This helper uses Clerk's authenticateRequest() to verify authentication
 * from EITHER the Authorization header (Bearer token) OR cookies.
 *
 * Use this for API routes that need to accept requests from:
 * - Chrome extension (sends Authorization: Bearer <token>)
 * - Web app (sends cookies)
 *
 * @param req - Next.js request object
 * @returns userId - Clerk user ID
 * @throws Error if not authenticated or authorization fails
 *
 * @example
 * // In API route handler
 * const userId = await verifyBearerOrThrow(req);
 */
export async function verifyBearerOrThrow(req: NextRequest): Promise<string> {
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY!,
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });

  // authenticateRequest() automatically checks both Authorization header and cookies
  const { isSignedIn, sessionClaims, toAuth } = await clerk.authenticateRequest(req, {
    // Authorized parties - protect against CSRF by whitelisting origins
    authorizedParties: [
      'https://sploot.app',
      'https://www.sploot.app',
      'chrome-extension://ipnlamdcakhmbidjlpoinkgimfapejna', // Extension ID
      'http://localhost:3000',
    ],
    // Accept session tokens (what the extension sends)
    acceptsToken: 'session_token',
    // Optional: Enable networkless verification if CLERK_JWT_KEY is set
    // jwtKey: process.env.CLERK_JWT_KEY,
  });

  if (!isSignedIn) {
    throw new Error('Unauthorized');
  }

  // Prefer sessionClaims.sub (from token), fallback to toAuth() (from cookies)
  const userId = sessionClaims?.sub ?? (await toAuth()).userId;

  if (!userId) {
    throw new Error('Unauthorized - no user ID found');
  }

  return userId;
}
