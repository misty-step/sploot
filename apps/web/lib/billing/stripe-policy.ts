import { isIP } from 'node:net';
import { createHash, verify as verifyDetachedSignature } from 'node:crypto';

/**
 * Stripe blast-radius policy.
 *
 * The repository owns sandbox work only. A Mint alias is not a credential or
 * a receipt: production use remains refused until an external authority can
 * verify a short-lived, verb-scoped lease and its network scope.
 */

export const STRIPE_BILLING_CAPABILITIES = [
  'customers.read',
  'checkout.sessions.create',
  'subscriptions.read',
  'subscriptions.create',
  'subscriptions.cancel_at_period_end',
  'products.read',
  'payment_methods.read',
] as const;

export type StripeBillingCapability = (typeof STRIPE_BILLING_CAPABILITIES)[number];

export type StripeCredential = {
  mode: 'test';
  source: 'sandbox-env' | 'test-fixture';
  secretKey: string;
};

export type StripeCredentialReceipt = {
  mode: 'test';
  source: StripeCredential['source'];
  capabilities: readonly StripeBillingCapability[];
};

export type MintLeaseRequest = {
  nonce: string;
  principal: string;
  workload: string;
  environment: string;
  purpose: string;
  resourceScope: readonly string[];
  audience: string;
  maxTtlSeconds: number;
  capability: StripeBillingCapability;
  operation: 'read' | 'write';
  egressOrigin: string;
  ipScope: readonly string[];
};

export type VerifiedMintLease = {
  leaseId: string;
  alias: string;
  principal: string;
  workload: string;
  environment: string;
  purpose: string;
  resourceScope: readonly string[];
  audience: string;
  issuedAt: string;
  nonce: string;
  maxTtlSeconds: number;
  capability: StripeBillingCapability;
  operation: 'read' | 'write';
  expiresAt: string;
  ipScope: readonly string[];
  egressOrigin: string;
  verificationDigest: string;
  signature: string;
};

export interface MintAuthorityAdapter {
  readonly verificationKeyPem: string;
  verifyLease(request: MintLeaseRequest): Promise<VerifiedMintLease | null>;
  consumeNonce(lease: VerifiedMintLease): Promise<boolean>;
}

const CAPABILITY_SET = new Set<string>(STRIPE_BILLING_CAPABILITIES);
const TEST_KEY_PATTERN = /^(?:sk|rk)_test_[A-Za-z0-9]+$/;
const LIVE_KEY_PATTERN = /^(?:sk|rk)_live_[A-Za-z0-9]+$/;

function isTestSecretKey(value: string): boolean {
  return TEST_KEY_PATTERN.test(value);
}

function isLiveSecretKey(value: unknown): boolean {
  return typeof value === 'string' && LIVE_KEY_PATTERN.test(value);
}

export function assertStripeCredential(credential: unknown): StripeCredentialReceipt {
  if (typeof credential !== 'object' || credential === null) {
    throw new Error('Stripe sandbox credential is required');
  }

  const candidate = credential as Partial<StripeCredential> & { mode?: string; source?: string; alias?: string };
  if (candidate.mode !== 'test') {
    if (isLiveSecretKey(candidate.secretKey)) {
      throw new Error('live Stripe keys are not accepted by repository-owned code');
    }
    throw new Error('live Stripe access is unavailable: no verifiable Mint authority is wired');
  }
  if (isLiveSecretKey(candidate.secretKey)) {
    throw new Error('live Stripe keys are not accepted by repository-owned code');
  }
  if (candidate.source !== 'sandbox-env' && candidate.source !== 'test-fixture') {
    throw new Error('Stripe sandbox access requires an explicit sandbox source');
  }
  if (typeof candidate.secretKey !== 'string' || !isTestSecretKey(candidate.secretKey)) {
    throw new Error('Stripe sandbox access requires an sk_test_ or rk_test_ secret key');
  }

  return {
    mode: 'test',
    source: candidate.source,
    capabilities: STRIPE_BILLING_CAPABILITIES,
  };
}

export function assertStripeOperation(operation: string): asserts operation is StripeBillingCapability {
  if (!CAPABILITY_SET.has(operation)) {
    throw new Error(`Stripe operation ${operation} is not granted by the billing capability contract`);
  }
}

export function assertSandboxCredential(credential: unknown): StripeCredentialReceipt {
  return assertStripeCredential(credential);
}

function isFiniteIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function canonicalLeasePayload(lease: VerifiedMintLease): string {
  const { signature: _signature, verificationDigest: _digest, ...unsigned } = lease;
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value !== null && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
    }
    return JSON.stringify(value);
  };
  return canonical(unsigned);
}

function normalizeOrigin(value: string, path: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${path} must be an absolute HTTPS origin`);
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error(`${path} must be an absolute HTTPS origin`);
  return url.origin;
}

function parseIpv4(value: string): number | null {
  const octets = value.split('.');
  if (octets.length !== 4) return null;
  let result = 0;
  for (const octet of octets) {
    if (!/^\d+$/.test(octet)) return null;
    const part = Number(octet);
    if (!Number.isInteger(part) || part < 0 || part > 255) return null;
    result = (result << 8) | part;
  }
  return result >>> 0;
}

function isAllowedPrivateControlCidr(value: string): boolean {
  const parts = value.split('/');
  if (parts.length !== 2) return false;
  const prefix = Number(parts[1]);
  if (!Number.isInteger(prefix)) return false;
  if (isIP(parts[0]) === 4) {
    const ip = parseIpv4(parts[0]);
    if (ip === null || prefix < 8 || prefix > 32) return false;
    const first = ip >>> 24;
    const second = (ip >>> 16) & 0xff;
    return (
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127)
    );
  }
  if (isIP(parts[0]) !== 6) return false;
  const normalized = parts[0].toLowerCase();
  if (prefix < 7 || prefix > 128 || normalized.includes('%')) return false;
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/i.test(normalized)
  );
}

function isRestrictedCidr(value: string): boolean {
  return isAllowedPrivateControlCidr(value);
}

/**
 * This is intentionally the only production-facing Mint check. It returns a
 * lease for an eventual external adapter, never a Stripe secret or a live
 * credential receipt.
 */
export async function requireVerifiedMintLease(
  authority: MintAuthorityAdapter | undefined,
  request: MintLeaseRequest,
  now: Date = new Date(),
): Promise<VerifiedMintLease> {
  if (!authority) {
    throw new Error('live Stripe action refused: Mint authority adapter is not configured');
  }
  if (!Number.isInteger(request.maxTtlSeconds) || !Number.isFinite(request.maxTtlSeconds) || request.maxTtlSeconds <= 0 || request.maxTtlSeconds > 900) throw new Error('live Stripe action refused: requested Mint TTL is invalid');
  if (![request.principal, request.workload, request.environment, request.purpose, request.audience, request.egressOrigin, request.nonce].every((value) => typeof value === 'string' && value.trim()) || !Array.isArray(request.resourceScope) || !Array.isArray(request.ipScope)) throw new Error('live Stripe action refused: Mint request identity or scope is incomplete');
  const lease = await authority.verifyLease(request);
  if (!lease) {
    throw new Error('live Stripe action refused: Mint lease could not be verified');
  }
  assertStripeOperation(lease.capability);
  if (!lease.leaseId.trim() || !lease.alias.trim() || !lease.principal.trim() || !lease.workload.trim() || !lease.environment.trim() || !lease.purpose.trim() || !lease.audience.trim() || !lease.nonce.trim() || !Number.isInteger(lease.maxTtlSeconds) || !Number.isFinite(lease.maxTtlSeconds) || lease.maxTtlSeconds <= 0 || lease.maxTtlSeconds > 900 || lease.capability !== request.capability || lease.operation !== request.operation) {
    throw new Error('live Stripe action refused: Mint lease is not verb-scoped');
  }
  if (lease.principal !== request.principal || lease.workload !== request.workload || lease.environment !== request.environment || lease.purpose !== request.purpose || lease.audience !== request.audience || lease.maxTtlSeconds !== request.maxTtlSeconds || lease.nonce !== request.nonce) throw new Error('live Stripe action refused: Mint lease identity, nonce, or purpose does not bind to the request');
  if (!isFiniteIsoDate(lease.issuedAt) || !isFiniteIsoDate(lease.expiresAt) || Date.parse(lease.issuedAt) > now.getTime() || Date.parse(lease.expiresAt) <= now.getTime() || Date.parse(lease.expiresAt) - Date.parse(lease.issuedAt) !== request.maxTtlSeconds * 1000) {
    throw new Error('live Stripe action refused: Mint lease is expired or has invalid exact TTL');
  }
  if (!Array.isArray(lease.ipScope) || lease.ipScope.length === 0 || lease.ipScope.some((scope) => !scope.trim() || !isRestrictedCidr(scope))) {
    throw new Error('live Stripe action refused: Mint lease has no restricted IP scope');
  }
  const requestedResourceScope = [...request.resourceScope].sort();
  const grantedResourceScope = [...lease.resourceScope].sort();
  if (requestedResourceScope.length === 0 || requestedResourceScope.some((scope) => !scope.trim()) || lease.resourceScope.some((scope) => !scope.trim()) || JSON.stringify(requestedResourceScope) !== JSON.stringify(grantedResourceScope)) throw new Error('live Stripe action refused: Mint resource scope does not bind to the request');
  const requestedIpScope = [...request.ipScope].sort();
  const grantedIpScope = [...lease.ipScope].sort();
  if (requestedIpScope.length === 0 || requestedIpScope.some((scope) => !isRestrictedCidr(scope)) || JSON.stringify(requestedIpScope) !== JSON.stringify(grantedIpScope)) throw new Error('live Stripe action refused: Mint IP scope does not bind to the requested egress scope');
  if (normalizeOrigin(lease.egressOrigin, 'Mint lease egressOrigin') !== normalizeOrigin(request.egressOrigin, 'requested egressOrigin')) throw new Error('live Stripe action refused: Mint lease egress origin does not bind to the requested origin');
  if (!/^[a-f0-9]{64}$/i.test(lease.verificationDigest)) {
    throw new Error('live Stripe action refused: Mint lease has no verifiable provenance digest');
  }
  const signedPayload = canonicalLeasePayload(lease);
  if (createHash('sha256').update(signedPayload).digest('hex') !== lease.verificationDigest || !lease.signature.trim() || !verifyDetachedSignature(null, Buffer.from(signedPayload), authority.verificationKeyPem, Buffer.from(lease.signature, 'base64'))) throw new Error('live Stripe action refused: Mint lease signature or provenance is invalid');
  if (!(await authority.consumeNonce(lease))) throw new Error('live Stripe action refused: Mint lease nonce was already consumed');
  return lease;
}
