import type { AuthenticatedPrincipal, RequestAuthResult } from './types';
import {
  createQaToken,
  verifyQaToken,
  isLoopbackAddress,
  principalFromPayload,
  readCookie,
  hasCookie,
  signPayload,
  base64UrlEncode,
  base64UrlDecode,
  constantTimeEqual,
  type QaTokenBinding,
} from './qa-local-core';

/**
 * Gallery's qa-local adapter: same signing/verification/principal-conversion
 * core as PWA's ./qa-local, bound to Gallery's own deployment/audience so a
 * token minted for one adapter is rejected by the other (see the cross-seam
 * rejection tests in __tests__/lib/auth/qa-gallery-local.test.ts). Gallery
 * additionally verifies an HMAC proxy-proof from the loopback front door
 * (scripts/qa-evidence-server.mjs) instead of trusting a raw peer address,
 * because the gallery evidence artifact is served through that front door
 * rather than directly by the Next process.
 */

export const QA_GALLERY_DEPLOYMENT_ID = 'sploot-gallery-qa-local';
export const QA_GALLERY_DEPLOYMENT_ENV = 'qa-local';
export const QA_GALLERY_AUDIENCE = 'sploot-gallery-evidence';
const ALLOWED_GALLERY_DEPLOYMENTS = new Set([QA_GALLERY_DEPLOYMENT_ID]);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const QA_GALLERY_BINDING: QaTokenBinding = {
  deploymentId: QA_GALLERY_DEPLOYMENT_ID,
  deploymentEnv: QA_GALLERY_DEPLOYMENT_ENV,
  audience: QA_GALLERY_AUDIENCE,
};

const QA_LOCAL_AUTH_HEADER = 'x-sploot-qa-auth';
const QA_LOCAL_AUTH_COOKIE = 'sploot_qa_auth';
const QA_LOCAL_PROXY_PROOF_HEADER = 'x-sploot-qa-proxy-proof';
const QA_LOCAL_REMOTE_ADDRESS_HEADER = 'x-sploot-qa-remote-address';
const MAX_TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

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

interface CreateQaGalleryAuthTokenOptions {
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

/**
 * Equally strict as PWA's validateQaLocalDeploymentConfig: allowlisted
 * deployment id/audience/env, an explicit non-production marker, no
 * coexistence with a real Clerk credential, a loopback-only server bind,
 * a process capability token, and a DigitalOcean-forbidden guard.
 */
export function validateQaProofConfig(
  env: Record<string, string | undefined> = process.env,
): QaProofConfigResult {
  if (env.SPLOOT_QA_EVIDENCE_MODE !== 'enabled') {
    return { valid: false, reason: 'qa-evidence-disabled' };
  }
  if (env.SPLOOT_QA_DEPLOYMENT_ID !== QA_GALLERY_DEPLOYMENT_ID ||
      !ALLOWED_GALLERY_DEPLOYMENTS.has(env.SPLOOT_QA_DEPLOYMENT_ID)) {
    return { valid: false, reason: 'qa-evidence-deployment-not-allowlisted' };
  }
  if (env.SPLOOT_QA_DEPLOYMENT_AUDIENCE !== QA_GALLERY_AUDIENCE) {
    return { valid: false, reason: 'qa-evidence-audience-mismatch' };
  }
  if (env.NODE_ENV === 'production' && env.DEPLOYMENT_ENV === 'production') {
    return { valid: false, reason: 'qa-evidence-forbidden-in-production' };
  }
  if (env.DEPLOYMENT_ENV !== QA_GALLERY_DEPLOYMENT_ENV) {
    return { valid: false, reason: 'qa-evidence-non-production-marker-required' };
  }
  if (env.CLERK_SECRET_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return { valid: false, reason: 'qa-evidence-cannot-coexist-with-clerk' };
  }
  if (env.DO_APP_PLATFORM || env.DIGITALOCEAN_APP_PLATFORM || env.DO_DEPLOYMENT_ENV) {
    return { valid: false, reason: 'qa-evidence-forbidden-on-digitalocean-deployment-infrastructure' };
  }
  if (env.NODE_ENV !== 'test' && env.SPLOOT_QA_BIND_HOST !== '127.0.0.1') {
    return { valid: false, reason: 'qa-evidence-requires-a-loopback-only-server-bind' };
  }
  if (env.NODE_ENV !== 'test' && !/^[a-f0-9]{48,}$/.test(env.SPLOOT_QA_LOCAL_CAPABILITY ?? '')) {
    return { valid: false, reason: 'qa-evidence-process-capability-is-missing-or-malformed' };
  }
  if (!env.SPLOOT_QA_AUTH_SECRET) {
    return { valid: false, reason: 'qa-evidence-secret-missing' };
  }
  return { valid: true };
}

export function isQaLocalAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SPLOOT_QA_AUTH_MODE === 'enabled' && validateQaProofConfig(env).valid;
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

export async function createQaLocalAuthToken({
  userId,
  deploymentId = QA_GALLERY_DEPLOYMENT_ID,
  audience = QA_GALLERY_AUDIENCE,
  email,
  sessionId,
  secret,
  expiresInSeconds = 15 * 60,
  now = new Date(),
}: CreateQaGalleryAuthTokenOptions): Promise<string> {
  return createQaToken({
    userId,
    email,
    sessionId,
    secret,
    expiresInSeconds,
    maxLifetimeSeconds: MAX_TOKEN_LIFETIME_SECONDS,
    binding: { deploymentId, deploymentEnv: QA_GALLERY_DEPLOYMENT_ENV, audience },
    now,
  });
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

  const payload = await verifyQaToken(token, secret, QA_GALLERY_BINDING, MAX_TOKEN_LIFETIME_SECONDS);
  if (!payload) {
    return { status: 'unauthenticated', reason: 'qa-local-invalid' };
  }

  return {
    status: 'authenticated',
    principal: principalFromPayload(payload, 'qa-local'),
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
