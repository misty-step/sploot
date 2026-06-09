import type { AuthenticatedPrincipal, RequestAuthResult } from './types';

const QA_LOCAL_AUTH_HEADER = 'x-sploot-qa-auth';
const QA_LOCAL_AUTH_COOKIE = 'sploot_qa_auth';
const TOKEN_VERSION = 1;

interface QaLocalAuthPayload {
  v: typeof TOKEN_VERSION;
  userId: string;
  email?: string;
  sessionId?: string;
  iat: number;
  exp: number;
}

interface CreateQaLocalAuthTokenOptions {
  userId: string;
  email?: string;
  sessionId?: string;
  secret: string;
  expiresInSeconds?: number;
  now?: Date;
}

export function getQaLocalAuthHeader(): string {
  return QA_LOCAL_AUTH_HEADER;
}

export function getQaLocalAuthCookieName(): string {
  return QA_LOCAL_AUTH_COOKIE;
}

export function isQaLocalAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SPLOOT_QA_AUTH_MODE === 'enabled' &&
    env.NODE_ENV !== 'production' &&
    env.VERCEL_ENV !== 'production';
}

export async function createQaLocalAuthToken({
  userId,
  email,
  sessionId,
  secret,
  expiresInSeconds = 15 * 60,
  now = new Date(),
}: CreateQaLocalAuthTokenOptions): Promise<string> {
  if (!userId) {
    throw new Error('qa-local token requires userId');
  }
  if (!secret) {
    throw new Error('qa-local token requires secret');
  }

  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: QaLocalAuthPayload = {
    v: TOKEN_VERSION,
    userId,
    ...(email ? { email } : {}),
    ...(sessionId ? { sessionId } : {}),
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signPayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export async function verifyQaLocalAuthHeaders(
  headers: Headers,
  env: Record<string, string | undefined> = process.env
): Promise<RequestAuthResult> {
  const token = headers.get(QA_LOCAL_AUTH_HEADER) ?? readCookie(headers.get('cookie'), QA_LOCAL_AUTH_COOKIE);
  if (!token) {
    return { status: 'unauthenticated', reason: 'qa-local-missing' };
  }

  if (!isQaLocalAuthEnabled(env)) {
    return { status: 'forbidden', reason: 'qa-local-disabled' };
  }

  const secret = env.SPLOOT_QA_AUTH_SECRET;
  if (!secret) {
    return { status: 'forbidden', reason: 'qa-local-secret-missing' };
  }

  const payload = await verifyQaLocalAuthToken(token, secret);
  if (!payload) {
    return { status: 'unauthenticated', reason: 'qa-local-invalid' };
  }

  return {
    status: 'authenticated',
    principal: principalFromPayload(payload),
    syncStatus: 'skipped',
  };
}

async function verifyQaLocalAuthToken(token: string, secret: string): Promise<QaLocalAuthPayload | null> {
  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  const expectedSignature = await signPayload(encodedPayload, secret);
  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  let payload: QaLocalAuthPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as QaLocalAuthPayload;
  } catch {
    return null;
  }

  if (payload.v !== TOKEN_VERSION || typeof payload.userId !== 'string' || payload.userId.length === 0) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    return null;
  }

  return payload;
}

function principalFromPayload(payload: QaLocalAuthPayload): AuthenticatedPrincipal {
  return {
    userId: payload.userId,
    provider: 'qa-local',
    providerSubject: payload.userId,
    source: 'qa-local',
    credentialKind: 'qa-local',
    sessionId: payload.sessionId ?? 'qa-local-session',
    ...(payload.email ? { email: payload.email } : {}),
  };
}

async function signPayload(payload: string, secret: string): Promise<string> {
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

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const prefix = `${name}=`;
  const cookie = cookieHeader
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
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

function base64UrlDecode(value: string): string {
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

function constantTimeEqual(left: string, right: string): boolean {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}
