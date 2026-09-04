import { captureOperationalError } from './sentry';

/** Errors crossing every embedding entrypoint. Keep policy and provider
 * outcomes distinct so callers can persist the right state and HTTP status. */
export interface AdmittedEmbeddingProviderLease {
  generation: number;
  probeGeneration: number | null;
  probeLeaseToken: string | null;
}

export const EMBEDDING_DEFAULT_RETRY_AFTER_SECONDS = 30;
// The largest practical finite delay that remains representable by a JS Date
// after conversion to milliseconds. Provider Retry-After is a lower bound;
// ordinary application policy must never shorten it.
export const EMBEDDING_MAX_RETRY_AFTER_SECONDS = 8_000_000_000_000;
export const EMBEDDING_MAX_MONTHLY_RETRY_AFTER_SECONDS = 32 * 24 * 60 * 60;
export const OBSERVABILITY_OWNER_HEADER = 'X-Sploot-Observability-Owner';


/** The only response marker understood by the request observability boundary. */
export const EMBEDDING_OUTCOMES = [
  'provider_circuit_open',
  'provider_rate_limit',
  'provider_unavailable',
  'user_rate',
  'global_rate',
  'user_concurrency',
  'global_concurrency',
  'daily_budget',
  'monthly_budget',
  'limiter_unavailable',
  'embedding_configuration',
] as const;

export type EmbeddingOutcome = (typeof EMBEDDING_OUTCOMES)[number];

export function isEmbeddingOutcome(value: unknown): value is EmbeddingOutcome {
  return typeof value === 'string' && (EMBEDDING_OUTCOMES as readonly string[]).includes(value);
}

export function normalizeEmbeddingRetryAfter(
  value: unknown,
  fallback = EMBEDDING_DEFAULT_RETRY_AFTER_SECONDS,
  max = EMBEDDING_MAX_RETRY_AFTER_SECONDS,
): number {
  const safeFallback = Number.isFinite(fallback)
    ? Math.min(max, Math.max(1, Math.ceil(fallback)))
    : EMBEDDING_DEFAULT_RETRY_AFTER_SECONDS;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return safeFallback;
  }
  return Math.min(max, Math.max(1, Math.ceil(value)));
}

export const EMBEDDING_PROVIDER_LEASE = Symbol('embedding-provider-lease');

type LeaseCarrier = {
  [EMBEDDING_PROVIDER_LEASE]?: AdmittedEmbeddingProviderLease;
};

export function attachEmbeddingProviderLease(
  error: unknown,
  lease: AdmittedEmbeddingProviderLease,
): void {
  if (error && typeof error === 'object') {
    Object.defineProperty(error, EMBEDDING_PROVIDER_LEASE, {
      configurable: true,
      value: lease,
    });
  }
}

export function getEmbeddingProviderLease(
  error: unknown,
): AdmittedEmbeddingProviderLease | undefined {
  if (!error || typeof error !== 'object') return undefined;
  return (error as LeaseCarrier)[EMBEDDING_PROVIDER_LEASE];
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public retryable: boolean = false,
    public retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'EmbeddingError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EmbeddingProviderCircuitOpenError extends EmbeddingError {
  readonly reason = 'provider_circuit_open' as const;

  constructor(retryAfterSec?: number) {
    super(
      'Embedding provider temporarily unavailable',
      503,
      true,
      normalizeEmbeddingRetryAfter(retryAfterSec),
    );
    this.name = 'EmbeddingProviderCircuitOpenError';
  }
}

export class EmbeddingProviderRateLimitError extends EmbeddingError {
  readonly reason = 'provider_rate_limit' as const;

  constructor(
    retryAfterSec?: number,
    message = 'Embedding provider rate limited',
  ) {
    super(message, 429, true, normalizeEmbeddingRetryAfter(retryAfterSec));
    this.name = 'EmbeddingProviderRateLimitError';
  }
}

export class EmbeddingProviderUnavailableError extends EmbeddingError {
  readonly reason = 'provider_unavailable' as const;

  constructor(
    message = 'Embedding provider temporarily unavailable',
    retryAfterSec = EMBEDDING_DEFAULT_RETRY_AFTER_SECONDS,
  ) {
    super(message, 503, true, normalizeEmbeddingRetryAfter(retryAfterSec));
    this.name = 'EmbeddingProviderUnavailableError';
  }
}

/**
 * Deterministic provider setup failure. This is operator-remediable, not a
 * transient provider outcome: callers must not spend an attempt or advertise
 * an automatic retry.
 */
export class EmbeddingConfigurationError extends EmbeddingError {
  readonly reason = 'embedding_configuration' as const;

  constructor(message = 'Embedding provider configuration is unavailable', cause?: unknown) {
    super(message, 503, false);
    this.name = 'EmbeddingConfigurationError';
    if (cause !== undefined) this.cause = cause;
  }
}

const configurationReports = new WeakSet<object>();

function isConfigurationErrorLike(error: unknown): error is {
  message: string;
  name?: string;
  stack?: string;
  cause?: unknown;
  reason?: unknown;
} {
  return Boolean(error && typeof error === 'object' && 'message' in error);
}

/**
 * Emit the deterministic configuration signal exactly once for an error
 * chain. Route-owned response headers are only valid after this returns (or
 * after a caller observes that the same chain was already reported).
 */
export async function reportEmbeddingConfigurationErrorOnce(
  error: unknown,
  context: string,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  if (!isConfigurationErrorLike(error)) return false;
  let current: unknown = error;
  let reportTarget: { message: string; name?: string; stack?: string } = error;
  for (let depth = 0; depth < 5 && isConfigurationErrorLike(current); depth += 1) {
    if (configurationReports.has(current)) return false;
    if (current.reason === 'embedding_configuration') reportTarget = current;
    current = current.cause;
  }

  const emitted = captureOperationalError({
    context,
    error: {
      name: reportTarget.name ?? 'EmbeddingConfigurationError',
      message: reportTarget.message,
      stack: reportTarget.stack,
    },
    metadata: {
      ...metadata,
      retryable: false,
      providerAttempt: false,
    },
  });
  if (emitted) configurationReports.add(reportTarget);
  return emitted;
}

export function hasEmbeddingConfigurationReport(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && isConfigurationErrorLike(current); depth += 1) {
    if (configurationReports.has(current)) return true;
    current = current.cause;
  }
  return false;
}

export function embeddingRetryHeaders(error: EmbeddingError): HeadersInit | undefined {
  const retryAfter = error.retryAfterSec === undefined && error.statusCode === 429
    ? EMBEDDING_DEFAULT_RETRY_AFTER_SECONDS
    : error.retryAfterSec;
  const reason = 'reason' in error && typeof error.reason === 'string'
    ? error.reason
    : undefined;
  if (retryAfter === undefined && reason === undefined) return undefined;

  const headers: Record<string, string> = {};
  if (retryAfter !== undefined) {
    headers['Retry-After'] = normalizeEmbeddingRetryAfter(retryAfter).toString();
  }
  if (reason) headers['X-Sploot-Embedding-Outcome'] = reason;
  return headers;
}

/** Add the observability suppression marker only after a route-owned report. */
export function embeddingConfigurationHeaders(error: EmbeddingError): HeadersInit | undefined {
  const headers = embeddingRetryHeaders(error);
  const reason = 'reason' in error && typeof error.reason === 'string'
    ? error.reason
    : undefined;
  if (reason !== 'embedding_configuration' || !hasEmbeddingConfigurationReport(error)) {
    return headers;
  }
  return { ...(headers ?? {}), [OBSERVABILITY_OWNER_HEADER]: 'route' };
}

export function embeddingRetryAfterHeader(value: unknown): HeadersInit {
  return {
    'Retry-After': normalizeEmbeddingRetryAfter(value).toString(),
  };
}

export function embeddingOutcomeHeaders(
  outcome: EmbeddingOutcome,
  retryAfter?: unknown,
): HeadersInit {
  return {
    ...embeddingRetryAfterHeader(retryAfter),
    'X-Sploot-Embedding-Outcome': outcome,
  };
}
