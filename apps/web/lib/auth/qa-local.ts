import type { AuthenticatedPrincipal, RequestAuthResult } from './types';

const QA_LOCAL_AUTH_HEADER = 'x-sploot-qa-auth';
const QA_LOCAL_AUTH_COOKIE = 'sploot_qa_auth';
const QA_DEPLOYMENT_IDENTITY_ENV = 'SPLOOT_DEPLOYMENT_IDENTITY';
const QA_ALLOWED_DEPLOYMENT_IDENTITIES_ENV = 'SPLOOT_QA_ALLOWED_DEPLOYMENT_IDENTITIES';
const TOKEN_VERSION = 1;
const MAX_TOKEN_LENGTH = 4096;

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
  if (env.SPLOOT_QA_AUTH_MODE !== 'enabled') {
    return false;
  }

  const deploymentIdentity = env[QA_DEPLOYMENT_IDENTITY_ENV]?.trim();
  const allowedIdentities = (env[QA_ALLOWED_DEPLOYMENT_IDENTITIES_ENV] ?? '')
    .split(',')
    .map(identity => identity.trim())
    .filter(Boolean);

  if (!deploymentIdentity || !allowedIdentities.includes(deploymentIdentity)) {
    return false;
  }

  const normalizedIdentity = deploymentIdentity.toLowerCase();
  const normalizedDeploymentEnvironment = env.DEPLOYMENT_ENV?.trim().toLowerCase();
  return env.NODE_ENV !== 'production' &&
    normalizedIdentity !== 'production' &&
    normalizedIdentity !== 'prod' &&
    normalizedDeploymentEnvironment !== 'production' &&
    normalizedDeploymentEnvironment !== 'prod';
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
  const hasHeader = headers.has(QA_LOCAL_AUTH_HEADER);
  const hasCookie = hasQaLocalCookie(headers);

  if (!isQaLocalAuthEnabled(env)) {
    // A stray QA marker is not an auth decision when this deployment has not
    // explicitly opted into QA. Let a valid Clerk or upload-token credential
    // continue through the normal policy chain.
    return { status: 'unauthenticated', reason: 'qa-local-missing' };
  }

  // Do not decode, JSON-parse, or verify any QA credential until the
  // environment gate above has explicitly enabled this local-only door.
  const headerToken = headers.get(QA_LOCAL_AUTH_HEADER);
  const cookieToken = readCookie(headers.get('cookie'), QA_LOCAL_AUTH_COOKIE);

  if (hasHeader && hasCookie) {
    return { status: 'unauthenticated', reason: 'qa-local-duplicate' };
  }

  const token = headerToken ?? cookieToken;
  if (!token) {
    return hasQaLocalCredential(headers)
      ? { status: 'unauthenticated', reason: 'qa-local-invalid' }
      : { status: 'unauthenticated', reason: 'qa-local-missing' };
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
  if (token.length > MAX_TOKEN_LENGTH) {
    return null;
  }

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
  const cookies = cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(part => part.startsWith(prefix));

  if (cookies.length !== 1) {
    return null;
  }

  try {
    return decodeURIComponent(cookies[0].slice(prefix.length));
  } catch {
    return null;
  }
}

function hasQaLocalCredential(headers: Headers): boolean {
  return headers.has(QA_LOCAL_AUTH_HEADER) || hasQaLocalCookie(headers);
}

function hasQaLocalCookie(headers: Headers): boolean {
  return (headers.get('cookie') ?? '')
    .split(';')
    .some(part => part.trim().startsWith(`${QA_LOCAL_AUTH_COOKIE}=`));
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
