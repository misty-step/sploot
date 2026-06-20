import { prisma } from '@/lib/db';
import { logger } from '@/lib/observability-logger';
import type { AuthenticatedPrincipal } from './types';

/**
 * Personal upload tokens — hashed, revocable, upload-only credentials.
 *
 * A non-session client (Apple Shortcut, CLI) presents one as
 * `Authorization: Bearer splt_…`. Only `sha256(token)` is ever stored; the
 * plaintext is returned once at mint time and never again. Verification is
 * gated by the `allowUploadToken` policy flag, so a token authenticates ONLY on
 * routes that explicitly opt in (the upload routes) — every other route rejects
 * it. See lib/auth/request-auth.ts for the branch and
 * backlog.d/033-ios-share-sheet-ingestion.ctx.md for the design.
 */

export const UPLOAD_TOKEN_PREFIX = 'splt_';

// 32 random bytes → 256 bits of entropy. Online guessing is infeasible, so a
// fast hash (sha256) is correct here — there is no low-entropy secret to stretch.
const TOKEN_RANDOM_BYTES = 32;
// Characters of the random part kept as a non-secret display prefix.
const DISPLAY_PREFIX_CHARS = 6;

export interface MintedUploadToken {
  /** Plaintext token. Returned to the user exactly once; never persisted. */
  token: string;
  /** Non-secret display prefix, e.g. "splt_ab12cd", safe to store and show. */
  prefix: string;
  /** sha256(token), hex — the only representation stored at rest. */
  tokenHash: string;
}

/** Generate a fresh token + its hash. The caller persists hash + prefix only. */
export async function mintUploadToken(): Promise<MintedUploadToken> {
  const randomPart = base64UrlEncodeBytes(randomBytes(TOKEN_RANDOM_BYTES));
  const token = `${UPLOAD_TOKEN_PREFIX}${randomPart}`;
  const tokenHash = await hashUploadToken(token);
  const prefix = `${UPLOAD_TOKEN_PREFIX}${randomPart.slice(0, DISPLAY_PREFIX_CHARS)}`;
  return { token, prefix, tokenHash };
}

/**
 * Pull an upload token out of the Authorization header.
 *
 * Returns the value only when it is a `splt_`-prefixed Bearer token, so a Clerk
 * session JWT (`eyJ…`) is never mistaken for one. Returns null otherwise.
 */
export function extractUploadToken(headers: Headers): string | null {
  const header = headers.get('authorization');
  if (!header) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const value = match?.[1]?.trim();
  if (!value || !value.startsWith(UPLOAD_TOKEN_PREFIX)) {
    return null;
  }

  return value;
}

/** Hex sha256 of a token. Mirrors lib/checksum.ts's Web Crypto usage. */
export async function hashUploadToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Resolve a plaintext upload token to its owning principal, or null.
 *
 * Throw-safe by contract: an auth decision must never throw. Any DB error
 * (including a not-yet-migrated `upload_tokens` table) resolves to null → 401,
 * never a 500. Revoked and unknown tokens are indistinguishable: both miss the
 * `revokedAt IS NULL` lookup and return null with no reason/latency tell.
 */
export async function verifyUploadToken(token: string): Promise<AuthenticatedPrincipal | null> {
  try {
    if (!prisma) {
      return null;
    }

    const tokenHash = await hashUploadToken(token);
    const row = await prisma.uploadToken.findFirst({
      where: { tokenHash, revokedAt: null },
      select: { id: true, userId: true },
    });

    if (!row) {
      return null;
    }

    // Best-effort, never blocks the request and never resurrects a revoked row
    // (updateMany guarded on revokedAt: null matches zero if revoked meanwhile).
    void touchLastUsed(row.id);

    return {
      userId: row.userId,
      provider: 'upload-token',
      providerSubject: row.userId,
      source: 'upload-token',
      credentialKind: 'upload-token',
    };
  } catch (error) {
    logger.logError('auth:upload-token-verify-failed', error as Error);
    return null;
  }
}

async function touchLastUsed(id: string): Promise<void> {
  try {
    if (!prisma) {
      return;
    }
    await prisma.uploadToken.updateMany({
      where: { id, revokedAt: null },
      data: { lastUsedAt: new Date() },
    });
  } catch {
    // last-used tracking is non-essential; swallow.
  }
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
