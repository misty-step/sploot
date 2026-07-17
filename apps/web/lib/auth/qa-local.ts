import type { AuthenticatedPrincipal, RequestAuthResult } from './types';
import { isQaLocalAuthEnabled } from './qa-local-enabled';
import {
  createQaToken,
  verifyQaToken,
  isLoopbackAddress,
  principalFromPayload,
  readCookie,
  hasCookie,
  type QaTokenBinding,
} from './qa-local-core';

export { isQaLocalAuthEnabled } from './qa-local-enabled';

export const QA_LOCAL_DEPLOYMENT_ID = 'local-pwa-capture-v1';
export const QA_LOCAL_DEPLOYMENT_ENV = 'local-qa';
export const QA_LOCAL_AUDIENCE = 'sploot-pwa-capture';

const QA_LOCAL_BINDING: QaTokenBinding = {
  deploymentId: QA_LOCAL_DEPLOYMENT_ID,
  deploymentEnv: QA_LOCAL_DEPLOYMENT_ENV,
  audience: QA_LOCAL_AUDIENCE,
};

export interface QaLocalRequestBoundary {
  peerAddress?: string | null;
}

export function validateQaLocalDeploymentConfig(env: Record<string, string | undefined> = process.env): { valid: boolean; reason?: string } {
  const proofEnabled = env.SPLOOT_QA_AUTH_MODE === 'enabled' || env.SPLOOT_PWA_CAPTURE_MODE === 'enabled' || env.NEXT_PUBLIC_SPLOOT_QA_AUTH_MODE === 'enabled';
  if (!proofEnabled) return { valid: true };
  if (env.SPLOOT_QA_DEPLOYMENT_ID !== QA_LOCAL_DEPLOYMENT_ID) return { valid: false, reason: 'qa-local deployment id is not allowlisted' };
  if (env.SPLOOT_QA_DEPLOYMENT_ENV !== QA_LOCAL_DEPLOYMENT_ENV) return { valid: false, reason: 'qa-local deployment is not explicitly non-production' };
  if (env.SPLOOT_QA_AUDIENCE !== QA_LOCAL_AUDIENCE) return { valid: false, reason: 'qa-local audience is not canonical' };
  const deploymentMarker = env.SPLOOT_DEPLOYMENT_ENV?.trim().toLowerCase();
  if (deploymentMarker !== 'development' && deploymentMarker !== 'test') return { valid: false, reason: 'qa-local proof authentication requires an explicit development/test SPLOOT_DEPLOYMENT_ENV marker' };
  if (env.NODE_ENV === 'production' && env.DEPLOYMENT_ENV !== QA_LOCAL_DEPLOYMENT_ENV) return { valid: false, reason: 'production process must declare the local-qa deployment environment' };
  if (env.DEPLOYMENT_ENV === 'production') return { valid: false, reason: 'qa-local proof authentication is forbidden in production deployment' };
  if (env.DO_APP_PLATFORM || env.DIGITALOCEAN_APP_PLATFORM || env.DO_DEPLOYMENT_ENV) return { valid: false, reason: 'qa-local proof authentication is forbidden on DigitalOcean deployment infrastructure' };
  if (env.NODE_ENV !== 'test' && env.SPLOOT_QA_BIND_HOST !== '127.0.0.1') return { valid: false, reason: 'qa-local proof authentication requires a loopback-only server bind' };
  if (env.NODE_ENV !== 'test' && !/^[a-f0-9]{48,}$/.test(env.SPLOOT_QA_LOCAL_CAPABILITY ?? '')) return { valid: false, reason: 'qa-local process capability is missing or malformed' };
  if (!env.SPLOOT_QA_AUTH_SECRET) return { valid: false, reason: 'qa-local proof secret is missing' };
  return { valid: true };
}

const QA_LOCAL_AUTH_HEADER = 'x-sploot-qa-auth';
const QA_LOCAL_AUTH_COOKIE = 'sploot_qa_auth';
const MAX_TOKEN_LIFETIME_SECONDS = 15 * 60;

interface CreateQaLocalAuthTokenOptions {
  userId: string;
  email?: string;
  sessionId?: string;
  audience?: string;
  deploymentId?: string;
  deploymentEnv?: string;
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

/**
 * Terminal request-auth resolution for qa-local input: returns null when the
 * request carries no qa-local credential at all, otherwise the (possibly
 * forbidden/unauthenticated) qa verdict that must never fall through to Clerk.
 */
export async function resolveQaLocalRequestAuth(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
  boundary: QaLocalRequestBoundary = {},
): Promise<RequestAuthResult | null> {
  if (!hasQaLocalAuthInput(headers)) return null;
  return verifyQaLocalAuthHeaders(headers, env, boundary);
}

export async function createQaLocalAuthToken({
  userId,
  email,
  sessionId,
  audience = QA_LOCAL_AUDIENCE,
  deploymentId = QA_LOCAL_DEPLOYMENT_ID,
  deploymentEnv = QA_LOCAL_DEPLOYMENT_ENV,
  secret,
  expiresInSeconds = 15 * 60,
  now = new Date(),
}: CreateQaLocalAuthTokenOptions): Promise<string> {
  return createQaToken({
    userId,
    email,
    sessionId,
    secret,
    expiresInSeconds,
    maxLifetimeSeconds: MAX_TOKEN_LIFETIME_SECONDS,
    binding: { deploymentId, deploymentEnv, audience },
    now,
  });
}

export async function verifyQaLocalAuthHeaders(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
  boundary: QaLocalRequestBoundary = {},
): Promise<RequestAuthResult> {
  const cookieHeader = headers.get('cookie');
  const headerToken = headers.get(QA_LOCAL_AUTH_HEADER);
  const cookieToken = readCookie(cookieHeader, QA_LOCAL_AUTH_COOKIE);
  const token = headerToken ?? cookieToken;
  if (!token) {
    return hasCookie(cookieHeader, QA_LOCAL_AUTH_COOKIE) || headerToken !== null
      ? { status: 'unauthenticated', reason: 'qa-local-invalid' }
      : { status: 'unauthenticated', reason: 'qa-local-missing' };
  }

  const deployment = validateQaLocalDeploymentConfig(env);
  if (!deployment.valid || !isQaLocalAuthEnabled(env)) {
    return { status: 'forbidden', reason: 'qa-local-disabled' };
  }

  if (boundary.peerAddress && !isLoopbackAddress(boundary.peerAddress)) {
    return { status: 'forbidden', reason: 'qa-local-boundary' };
  }

  const secret = env.SPLOOT_QA_AUTH_SECRET;
  if (!secret) {
    return { status: 'forbidden', reason: 'qa-local-secret-missing' };
  }

  const payload = await verifyQaToken(token, secret, QA_LOCAL_BINDING, MAX_TOKEN_LIFETIME_SECONDS);
  const hasProviderCredential = Boolean(
    headers.get('authorization') ||
    hasCookie(cookieHeader, '__session'),
  );
  if (!payload) {
    return hasProviderCredential
      ? { status: 'forbidden', reason: 'qa-local-production-auth-coexistence' }
      : { status: 'unauthenticated', reason: 'qa-local-invalid' };
  }
  if (hasProviderCredential) {
    return { status: 'unauthenticated', reason: 'qa-local-production-auth-coexistence' };
  }

  return {
    status: 'authenticated',
    principal: principalFromPayload(payload, 'qa-local'),
    syncStatus: 'skipped',
  };
}
