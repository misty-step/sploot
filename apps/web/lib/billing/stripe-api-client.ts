import { createHash } from 'node:crypto';
import { assertSandboxCredential, assertStripeOperation, type StripeCredential } from './stripe-policy';
import type { RecoveryStripeWriter, SubscriptionCreation } from './stripe-recovery';

type StripeFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export const STRIPE_API_ORIGIN = 'https://api.stripe.com';

export class StripeHttpError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly attempts: number;

  constructor(message: string, options: { status?: number; retryable: boolean; attempts: number; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'StripeHttpError';
    this.status = options.status;
    this.retryable = options.retryable;
    this.attempts = options.attempts;
  }
}

export const STRIPE_HTTP_LIMITS = {
  timeoutMs: { min: 1, max: 120_000 },
  maxRetries: { min: 0, max: 8 },
  retryBaseDelayMs: { min: 0, max: 60_000 },
  maxRetryDelayMs: { min: 0, max: 120_000 },
} as const;

function assertBoundedInteger(name: string, value: number, bounds: { min: number; max: number }): void {
  if (!Number.isInteger(value) || !Number.isFinite(value) || value < bounds.min || value > bounds.max) {
    throw new Error(`${name} must be a finite integer between ${bounds.min} and ${bounds.max}`);
  }
}

function encodeForm(input: Record<string, string | number | undefined>): string {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRedirectRejection(error: unknown): boolean {
  if (error instanceof Error && /redirect|location/i.test(error.message)) return true;
  return typeof error === 'object' && error !== null && (error as { cause?: { code?: string } }).cause?.code === 'UND_ERR_REDIRECT';
}

/** Minimal, bounded, sandbox-only Stripe REST client for recovery writes. */
export class StripeApiClient implements RecoveryStripeWriter {
  readonly credential: Extract<StripeCredential, { mode: 'test' }>;
  private readonly fetchImpl: StripeFetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxRetryDelayMs: number;

  constructor(
    credential: Extract<StripeCredential, { mode: 'test' }>,
    options: {
      fetchImpl?: StripeFetch;
      baseUrl?: string;
      timeoutMs?: number;
      maxRetries?: number;
      retryBaseDelayMs?: number;
      maxRetryDelayMs?: number;
    } = {}
  ) {
    assertSandboxCredential(credential);
    this.credential = credential;
    this.fetchImpl = options.fetchImpl ?? fetch;
    const configuredUrl = new URL(options.baseUrl ?? STRIPE_API_ORIGIN);
    if (configuredUrl.pathname !== '/' || configuredUrl.search || configuredUrl.hash || configuredUrl.username || configuredUrl.password) throw new Error('Stripe base URL must be an origin without a path');
    this.baseUrl = configuredUrl.origin;
    if (credential.source === 'sandbox-env' && this.baseUrl !== STRIPE_API_ORIGIN) throw new Error(`Stripe sandbox origin is pinned to ${STRIPE_API_ORIGIN}`);
    if (credential.source === 'test-fixture' && !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(this.baseUrl)) throw new Error('Stripe test fixtures may only use a loopback origin');
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 100;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 1_000;
    assertBoundedInteger('timeoutMs', this.timeoutMs, STRIPE_HTTP_LIMITS.timeoutMs);
    assertBoundedInteger('maxRetries', this.maxRetries, STRIPE_HTTP_LIMITS.maxRetries);
    assertBoundedInteger('retryBaseDelayMs', this.retryBaseDelayMs, STRIPE_HTTP_LIMITS.retryBaseDelayMs);
    assertBoundedInteger('maxRetryDelayMs', this.maxRetryDelayMs, STRIPE_HTTP_LIMITS.maxRetryDelayMs);
    if (this.maxRetryDelayMs < this.retryBaseDelayMs) throw new Error('maxRetryDelayMs must be >= retryBaseDelayMs');
  }

  async createSubscription(input: SubscriptionCreation, idempotencyKey: string): Promise<{ id: string; status: string; customer: string }> {
    assertStripeOperation('subscriptions.create');
    if (!idempotencyKey.trim()) throw new Error('Stripe write requires a non-empty idempotency key');
    const form: Record<string, string | number | undefined> = {
      customer: input.customer,
      payment_behavior: input.payment_behavior,
      default_payment_method: input.default_payment_method,
      billing_cycle_anchor: input.billing_cycle_anchor,
      trial_end: input.trial_end,
      collection_method: input.collection_method,
      days_until_due: input.days_until_due,
      'automatic_tax[enabled]': input.automatic_tax?.enabled ? 'true' : input.automatic_tax ? 'false' : undefined,
    };
    input.items.forEach((item, index) => {
      form[`items[${index}][price]`] = item.price;
      form[`items[${index}][quantity]`] = item.quantity;
      item.tax_rates?.forEach((taxRate, taxRateIndex) => {
        form[`items[${index}][tax_rates][${taxRateIndex}]`] = taxRate;
      });
    });
    input.discounts?.forEach((discount, index) => {
      form[`discounts[${index}][coupon]`] = discount.coupon;
      form[`discounts[${index}][promotion_code]`] = discount.promotion_code;
    });
    input.default_tax_rates?.forEach((taxRate, index) => {
      form[`default_tax_rates[${index}]`] = taxRate;
    });
    Object.entries(input.metadata).forEach(([key, value]) => {
      form[`metadata[${key}]`] = value;
    });
    return this.request('/v1/subscriptions', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeForm(form),
    });
  }

  private async request<T = { id: string; status: string; customer: string }>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Basic ${btoa(`${this.credential.secretKey}:`)}`);
    const method = (init.method ?? 'GET').toUpperCase();
    const canRetry = method !== 'POST' || headers.has('Idempotency-Key');
    const expectedBodyDigest = typeof init.body === 'string' ? createHash('sha256').update(init.body).digest('hex') : null;
    this.assertRequestTarget(path, method, init.body, expectedBodyDigest);
    let attempt = 0;

    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        this.assertRequestTarget(path, method, init.body, expectedBodyDigest);
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers, redirect: 'error', signal: controller.signal });
        if (response.url) this.assertResponseTarget(response.url, path);
        if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308 || response.headers.has('Location')) {
          throw new StripeHttpError('Stripe sandbox redirect refused', { status: response.status, retryable: false, attempts: attempt + 1 });
        }
        if (response.ok) return (await response.json()) as T;
        const retryable = isRetryableStatus(response.status);
        if (!retryable || !canRetry || attempt >= this.maxRetries) {
          throw new StripeHttpError(`Stripe sandbox request failed with HTTP ${response.status}`, {
            status: response.status,
            retryable,
            attempts: attempt + 1,
          });
        }
        await this.wait(this.retryDelay(attempt, response.headers.get('Retry-After')));
        attempt += 1;
      } catch (error) {
        if (error instanceof StripeHttpError) throw error;
        if (isRedirectRejection(error)) throw new StripeHttpError('Stripe sandbox redirect refused by redirect:error policy', { retryable: false, attempts: attempt + 1, cause: error });
        const timedOut = controller.signal.aborted;
        if (canRetry && attempt < this.maxRetries) {
          await this.wait(this.retryDelay(attempt, null));
          attempt += 1;
          continue;
        }
        throw new StripeHttpError(timedOut ? 'Stripe sandbox request timed out' : 'Stripe sandbox request aborted', { retryable: true, attempts: attempt + 1, cause: error });
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  private assertRequestTarget(path: string, method: string, body: BodyInit | null | undefined, expectedBodyDigest: string | null): void {
    const url = new URL(`${this.baseUrl}${path}`);
    if (url.origin !== this.baseUrl || url.pathname !== path || url.search || url.hash || method !== 'POST') throw new StripeHttpError('Stripe sandbox request target refused', { retryable: false, attempts: 1 });
    if (expectedBodyDigest !== null && (typeof body !== 'string' || createHash('sha256').update(body).digest('hex') !== expectedBodyDigest)) throw new StripeHttpError('Stripe sandbox request body changed', { retryable: false, attempts: 1 });
  }

  private assertResponseTarget(responseUrl: string, path: string): void {
    const url = new URL(responseUrl);
    if (url.origin !== this.baseUrl || url.pathname !== path || url.search || url.hash) throw new StripeHttpError('Stripe sandbox response egress target refused', { retryable: false, attempts: 1 });
  }

  private retryDelay(attempt: number, retryAfter: string | null): number {
    const requested = retryAfter === null ? this.retryBaseDelayMs * 2 ** attempt : Number(retryAfter) * 1_000;
    return Math.min(this.maxRetryDelayMs, Number.isFinite(requested) && requested >= 0 ? requested : this.retryBaseDelayMs);
  }

  private wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
