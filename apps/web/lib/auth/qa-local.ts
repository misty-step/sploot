import type { AuthenticatedPrincipal, RequestAuthResult } from './types';

const QA_LOCAL_AUTH_HEADER = 'x-sploot-qa-auth';
const QA_LOCAL_AUTH_COOKIE = 'sploot_qa_auth';
const QA_LOCAL_PROXY_PROOF_HEADER = 'x-sploot-qa-proxy-proof';
const QA_LOCAL_REMOTE_ADDRESS_HEADER = 'x-sploot-qa-remote-address';
const TOKEN_VERSION = 1;
const QA_USER_ID_PATTERN = /^qa-[a-z0-9-]{1,64}$/;
const MAX_TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;
export const QA_PROOF_DEPLOYMENT_ID = 'sploot-gallery-qa-local';
export const QA_PROOF_AUDIENCE = 'sploot-gallery-evidence';
const ALLOWED_PROOF_DEPLOYMENTS = new Set([QA_PROOF_DEPLOYMENT_ID]);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

interface QaLocalAuthPayload {
  v: typeof TOKEN_VERSION;
  userId: string;
  deploymentId?: string;
  audience?: string;
  email?: string;
  sessionId?: string;
  iat: number;
  exp: number;
}

interface CreateQaLocalAuthTokenOptions {
  userId: string;
  deploymentId?: string;
  audience?: string;
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

export function hasQaLocalAuthInput(headers: Headers): boolean {
  return Boolean(
    headers.get(QA_LOCAL_AUTH_HEADER) ||
    hasCookie(headers.get('cookie'), QA_LOCAL_AUTH_COOKIE),
  );
}

/** Resolve qa-local credentials as terminal input when present. */
export async function resolveQaLocalRequestAuth(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
  request?: QaProofRequestContext,
): Promise<RequestAuthResult | null> {
  if (!hasQaLocalAuthInput(headers)) return null;
  return verifyQaLocalAuthHeaders(headers, env, request);
}

export function getQaLocalRemoteAddressHeader(): string {
  return QA_LOCAL_REMOTE_ADDRESS_HEADER;
}

export function getQaLocalProxyProofHeader(): string {
  return QA_LOCAL_PROXY_PROOF_HEADER;
}

export async function createQaLocalProxyProof(
  host: string,
  remoteAddress: string,
  secret: string,
): Promise<string> {
  const payload = base64UrlEncode(JSON.stringify({ host, remoteAddress }));
  return `${payload}.${await signPayload(payload, secret)}`;
}

export function getQaProofRequestContext(headers: Headers): QaProofRequestContext {
  const rawHost = headers.get('host') ?? '';
  const host = rawHost.startsWith('[')
    ? rawHost.slice(1, rawHost.indexOf(']'))
    : rawHost.split(':')[0];
  return {
    host,
    proxyProof: headers.get(QA_LOCAL_PROXY_PROOF_HEADER) ?? undefined,
  };
}

export interface QaProofRequestContext {
  host: string;
  /** Only populated by the server adapter or a verified front-door proof. */
  remoteAddress?: string;
  proxyProof?: string;
}

export interface QaProofConfigResult {
  valid: boolean;
  reason?: string;
}

export function validateQaProofConfig(
  env: Record<string, string | undefined> = process.env,
): QaProofConfigResult {
  if (env.SPLOOT_QA_EVIDENCE_MODE !== 'enabled') {
    return { valid: false, reason: 'qa-evidence-disabled' };
  }
  if (env.SPLOOT_QA_DEPLOYMENT_ID !== QA_PROOF_DEPLOYMENT_ID ||
      !ALLOWED_PROOF_DEPLOYMENTS.has(env.SPLOOT_QA_DEPLOYMENT_ID)) {
    return { valid: false, reason: 'qa-evidence-deployment-not-allowlisted' };
  }
  if (env.SPLOOT_QA_DEPLOYMENT_AUDIENCE !== QA_PROOF_AUDIENCE) {
    return { valid: false, reason: 'qa-evidence-audience-mismatch' };
  }
  if (env.NODE_ENV === 'production' && env.DEPLOYMENT_ENV === 'production') {
    return { valid: false, reason: 'qa-evidence-forbidden-in-production' };
  }
  if (env.DEPLOYMENT_ENV !== 'qa-local') {
    return { valid: false, reason: 'qa-evidence-non-production-marker-required' };
  }
  if (env.CLERK_SECRET_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return { valid: false, reason: 'qa-evidence-cannot-coexist-with-clerk' };
  }
  if (!env.SPLOOT_QA_AUTH_SECRET) {
    return { valid: false, reason: 'qa-evidence-secret-missing' };
  }
  return { valid: true };
}

export function isQaLocalAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SPLOOT_QA_AUTH_MODE === 'enabled' && validateQaProofConfig(env).valid;
}

export async function createQaLocalAuthToken({
  userId,
  deploymentId = QA_PROOF_DEPLOYMENT_ID,
  audience = QA_PROOF_AUDIENCE,
  email,
  sessionId,
  secret,
  expiresInSeconds = 15 * 60,
  now = new Date(),
}: CreateQaLocalAuthTokenOptions): Promise<string> {
  if (!userId) {
    throw new Error('qa-local token requires userId');
  }
  if (!QA_USER_ID_PATTERN.test(userId)) {
    throw new Error('qa-local token requires a qa-user namespace');
  }
  if (!secret) {
    throw new Error('qa-local token requires secret');
  }
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0 || expiresInSeconds > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new Error('qa-local token lifetime is out of bounds');
  }

  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + expiresInSeconds;
  const payload: QaLocalAuthPayload = {
    v: TOKEN_VERSION,
    userId,
    deploymentId,
    audience,
    ...(email ? { email } : {}),
    ...(sessionId ? { sessionId } : {}),
    iat: issuedAt,
    exp: expiresAt,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signPayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export async function verifyQaLocalAuthHeaders(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
  request?: QaProofRequestContext,
): Promise<RequestAuthResult> {
  const cookieHeader = headers.get('cookie');
  const headerToken = headers.get(QA_LOCAL_AUTH_HEADER);
  const cookieToken = readCookie(cookieHeader, QA_LOCAL_AUTH_COOKIE);
  // Browser sessions are refreshed by /api/qa-auth/login. A caller may still
  // carry an older explicit header (for example Playwright's context header),
  // so the signed session cookie is authoritative whenever it is present.
  // Header-only callers retain the token-scoped API contract.
  const token = cookieToken ?? headerToken;
  if (!token) {
    return hasCookie(cookieHeader, QA_LOCAL_AUTH_COOKIE) || headerToken !== null
      ? { status: 'unauthenticated', reason: 'qa-local-invalid' }
      : { status: 'unauthenticated', reason: 'qa-local-missing' };
  }

  const config = validateQaProofConfig(env);
  if (!env.SPLOOT_QA_AUTH_MODE || !config.valid) {
    return { status: 'forbidden', reason: 'qa-local-disabled' };
  }

  const secret = env.SPLOOT_QA_AUTH_SECRET;
  if (!secret) {
    return { status: 'forbidden', reason: 'qa-local-secret-missing' };
  }

  const context = request ?? getQaProofRequestContext(headers);
  const host = context.host;
  const remoteAddress = context.remoteAddress ?? await verifyQaLocalProxyProof(context.proxyProof, host, secret);
  if (!LOOPBACK_HOSTS.has(host) || !isLoopbackAddress(remoteAddress)) {
    return { status: 'forbidden', reason: 'qa-local-non-loopback' };
  }

  const payload = await verifyQaLocalAuthToken(token, secret, {
    deploymentId: env.SPLOOT_QA_DEPLOYMENT_ID,
    audience: env.SPLOOT_QA_DEPLOYMENT_AUDIENCE,
  });
  if (!payload) {
    return { status: 'unauthenticated', reason: 'qa-local-invalid' };
  }

  return {
    status: 'authenticated',
    principal: principalFromPayload(payload),
    syncStatus: 'skipped',
  };
}

async function verifyQaLocalProxyProof(
  proof: string | undefined,
  expectedHost: string,
  secret: string,
): Promise<string> {
  if (!proof) return '';
  const [encodedPayload, signature, extra] = proof.split('.');
  if (!encodedPayload || !signature || extra !== undefined ||
      !constantTimeEqual(signature, await signPayload(encodedPayload, secret))) {
    return '';
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as {
      host?: string;
      remoteAddress?: string;
    };
    if (payload.host !== expectedHost || typeof payload.remoteAddress !== 'string') return '';
    return payload.remoteAddress;
  } catch {
    return '';
  }
}

async function verifyQaLocalAuthToken(
  token: string,
  secret: string,
  binding: Pick<QaLocalAuthPayload, 'deploymentId' | 'audience'>,
): Promise<QaLocalAuthPayload | null> {
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

  if (!isBoundedQaPayload(payload) ||
      payload.deploymentId !== binding.deploymentId ||
      payload.audience !== binding.audience) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.iat > now || payload.exp <= now || payload.exp <= payload.iat) {
    return null;
  }
  if (payload.exp - payload.iat > MAX_TOKEN_LIFETIME_SECONDS) {
    return null;
  }

  return payload;
}

function isLoopbackAddress(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
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

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return null;
  }
}

function hasCookie(cookieHeader: string | null, name: string): boolean {
  if (!cookieHeader) {
    return false;
  }

  const prefix = `${name}=`;
  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .some(part => part.startsWith(prefix));
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

function isBoundedQaPayload(payload: unknown): payload is QaLocalAuthPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const allowedKeys = new Set(['v', 'userId', 'deploymentId', 'audience', 'iat', 'exp', 'email', 'sessionId']);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    return false;
  }

  return record.v === TOKEN_VERSION &&
    typeof record.userId === 'string' &&
    QA_USER_ID_PATTERN.test(record.userId) &&
    typeof record.deploymentId === 'string' &&
    typeof record.audience === 'string' &&
    typeof record.iat === 'number' &&
    Number.isSafeInteger(record.iat) &&
    typeof record.exp === 'number' &&
    Number.isSafeInteger(record.exp) &&
    (record.email === undefined || typeof record.email === 'string') &&
    (record.sessionId === undefined || typeof record.sessionId === 'string');
}
