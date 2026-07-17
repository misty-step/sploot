import type { AuthenticatedPrincipal } from './types';

/**
 * Private generic crypto/token core shared by the qa-local auth adapters
 * (PWA's qa-local.ts and Gallery's qa-gallery-local.ts). This module owns
 * signing, verification, payload parsing, and principal conversion; each
 * adapter owns its own binding (deploymentId/deploymentEnv/audience) and
 * deployment validation. A token signed for one binding is rejected by
 * every other binding -- see the cross-seam rejection tests in
 * __tests__/lib/auth/qa-local.test.ts and qa-gallery-local.test.ts.
 */

export const TOKEN_VERSION = 1;
export const QA_USER_ID_PATTERN = /^qa-[a-z0-9-]{1,64}$/;

export interface QaTokenBinding {
  deploymentId: string;
  deploymentEnv: string;
  audience: string;
}

export interface QaTokenPayload {
  v: typeof TOKEN_VERSION;
  userId: string;
  email?: string;
  sessionId?: string;
  audience: string;
  deploymentId: string;
  deploymentEnv: string;
  iat: number;
  exp: number;
}

export interface CreateQaTokenOptions {
  userId: string;
  email?: string;
  sessionId?: string;
  secret: string;
  expiresInSeconds: number;
  maxLifetimeSeconds: number;
  binding: QaTokenBinding;
  now?: Date;
}

export async function createQaToken({
  userId,
  email,
  sessionId,
  secret,
  expiresInSeconds,
  maxLifetimeSeconds,
  binding,
  now = new Date(),
}: CreateQaTokenOptions): Promise<string> {
  if (!userId) {
    throw new Error('qa-local token requires userId');
  }
  if (!QA_USER_ID_PATTERN.test(userId)) {
    throw new Error('qa-local token requires a qa-user namespace');
  }
  if (!secret) {
    throw new Error('qa-local token requires secret');
  }
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0 || expiresInSeconds > maxLifetimeSeconds) {
    throw new Error('qa-local token lifetime is out of bounds');
  }

  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + expiresInSeconds;
  const payload: QaTokenPayload = {
    v: TOKEN_VERSION,
    userId,
    ...(email ? { email } : {}),
    ...(sessionId ? { sessionId } : {}),
    audience: binding.audience,
    deploymentId: binding.deploymentId,
    deploymentEnv: binding.deploymentEnv,
    iat: issuedAt,
    exp: expiresAt,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signPayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export async function verifyQaToken(
  token: string,
  secret: string,
  binding: QaTokenBinding,
  maxLifetimeSeconds: number,
): Promise<QaTokenPayload | null> {
  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  const expectedSignature = await signPayload(encodedPayload, secret);
  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  let payload: QaTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as QaTokenPayload;
  } catch {
    return null;
  }

  if (!isBoundedQaPayload(payload, binding)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.iat > now || payload.exp <= now || payload.exp <= payload.iat) {
    return null;
  }
  if (payload.exp - payload.iat > maxLifetimeSeconds) {
    return null;
  }

  return payload;
}

export function isLoopbackAddress(address: string): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function principalFromPayload(payload: QaTokenPayload, provider: AuthenticatedPrincipal['provider'] = 'qa-local'): AuthenticatedPrincipal {
  return {
    userId: payload.userId,
    provider,
    providerSubject: payload.userId,
    source: 'qa-local',
    credentialKind: 'qa-local',
    sessionId: payload.sessionId ?? 'qa-local-session',
    ...(payload.email ? { email: payload.email } : {}),
  };
}

export async function signPayload(payload: string, secret: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.importKey !== 'function') {
    throw new Error('Web Crypto HMAC is unavailable');
  }

  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  );

  return base64UrlEncodeBytes(new Uint8Array(signature));
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const prefix = `${name}=`;
  const cookie = cookieHeader
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return null;
  }
}

export function hasCookie(cookieHeader: string | null, name: string): boolean {
  if (!cookieHeader) {
    return false;
  }

  const prefix = `${name}=`;
  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .some(part => part.startsWith(prefix));
}

export function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    Math.ceil(value.length / 4) * 4,
    '='
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

export function constantTimeEqual(left: string, right: string): boolean {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

function isBoundedQaPayload(payload: unknown, binding: QaTokenBinding): payload is QaTokenPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const allowedKeys = new Set(['v', 'userId', 'iat', 'exp', 'email', 'sessionId', 'audience', 'deploymentId', 'deploymentEnv']);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    return false;
  }

  return record.v === TOKEN_VERSION &&
    typeof record.userId === 'string' &&
    QA_USER_ID_PATTERN.test(record.userId) &&
    typeof record.iat === 'number' &&
    Number.isSafeInteger(record.iat) &&
    typeof record.exp === 'number' &&
    Number.isSafeInteger(record.exp) &&
    (record.email === undefined || typeof record.email === 'string') &&
    (record.sessionId === undefined || typeof record.sessionId === 'string') &&
    record.audience === binding.audience &&
    record.deploymentId === binding.deploymentId &&
    record.deploymentEnv === binding.deploymentEnv;
}
