import { NextRequest } from 'next/server';
import { createClerkClient } from '@clerk/backend';

const DEFAULT_AUTHORIZED_PARTIES = [
  'https://sploot.app',
  'https://www.sploot.app',
  'chrome-extension://ipnlamdcakhmbidjlpoinkgimfapejna',
  'chrome-extension://hikefmnilgapfckjmillbhcocihjffhn',
  'chrome-extension://fbhkflbcnllfogefckablkafjknmcfnd',
  'http://localhost:3000',
  'http://localhost:3001',
];

function parseAuthorizedParties(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

export function getClerkAuthorizedParties(): string[] {
  return Array.from(
    new Set([
      ...DEFAULT_AUTHORIZED_PARTIES,
      ...parseAuthorizedParties(process.env.CLERK_AUTHORIZED_PARTIES),
    ])
  );
}

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
  const { isSignedIn, toAuth } = await clerk.authenticateRequest(req, {
    // Authorized parties protect against CSRF by whitelisting trusted origins.
    authorizedParties: getClerkAuthorizedParties(),
    // Accept session tokens (what the extension sends)
    acceptsToken: 'session_token',
    // Optional: Enable networkless verification if CLERK_JWT_KEY is set
    // jwtKey: process.env.CLERK_JWT_KEY,
  });

  if (!isSignedIn) {
    throw new Error('Unauthorized');
  }

  // Get userId from auth
  const userId = (await toAuth()).userId;

  if (!userId) {
    throw new Error('Unauthorized - no user ID found');
  }

  return userId;
}
