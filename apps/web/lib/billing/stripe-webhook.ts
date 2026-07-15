import { createHmac, timingSafeEqual } from 'node:crypto';
import { encryptSignedProvenance, sha256Bytes, sha256Json, type StripeJsonRecord, type StripeVerifiedEvent } from './stripe-event';

/** Public billing entry point. Plain events are intentionally not exported. */
export { SubscriptionCancellationMonitor, type StripeWebhookVerifier } from './stripe-cancellation-monitor';
import { SubscriptionCancellationMonitor, type StripeWebhookVerifier } from './stripe-cancellation-monitor';

export const STRIPE_WEBHOOK_MAX_BODY_BYTES = 2_000_000;

export class StripeWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeWebhookVerificationError';
  }
}

export class StripeSignatureVerifier implements StripeWebhookVerifier {
  constructor(
    private readonly signingSecret: string,
    private readonly toleranceSeconds = 300,
    private readonly clock: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    if (!signingSecret.trim()) throw new Error('Stripe webhook signing secret is required');
    if (!Number.isInteger(toleranceSeconds) || toleranceSeconds <= 0 || toleranceSeconds > 900) throw new Error('Stripe webhook tolerance must be a finite integer between 1 and 900 seconds');
  }

  async verify(rawBody: Uint8Array, signature: string): Promise<Awaited<ReturnType<StripeWebhookVerifier['verify']>>> {
    if (rawBody.byteLength > STRIPE_WEBHOOK_MAX_BODY_BYTES) throw new StripeWebhookVerificationError('Stripe webhook body exceeds the bounded provenance storage limit');
    const parts = new Map<string, string[]>();
    for (const part of signature.split(',')) {
      const [key, value] = part.split('=', 2);
      if (key && value) parts.set(key, [...(parts.get(key) ?? []), value]);
    }
    const timestamp = Number(parts.get('t')?.[0]);
    const signatures = parts.get('v1') ?? [];
    if (!Number.isInteger(timestamp) || signatures.length === 0 || Math.abs(this.clock() - timestamp) > this.toleranceSeconds) throw new StripeWebhookVerificationError('Stripe webhook signature is missing, malformed, or outside the tolerance window');
    const signedPrefix = Buffer.from(`${timestamp}.`, 'utf8');
    const expected = createHmac('sha256', this.signingSecret).update(Buffer.concat([signedPrefix, Buffer.from(rawBody)])).digest();
    const valid = signatures.some((candidate) => {
      const supplied = Buffer.from(candidate, 'hex');
      return supplied.length === expected.length && timingSafeEqual(supplied, expected);
    });
    if (!valid) throw new StripeWebhookVerificationError('Stripe webhook signature verification failed');
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(rawBody).toString('utf8'));
    } catch {
      throw new StripeWebhookVerificationError('Stripe webhook body is not valid JSON');
    }
    if (typeof payload !== 'object' || payload === null) throw new StripeWebhookVerificationError('Stripe webhook payload is not an object');
    const event = payload as {
      id?: unknown;
      type?: unknown;
      created?: unknown;
      livemode?: unknown;
      account?: unknown;
      data?: { object?: { id?: unknown; object?: unknown } };
    };
    if (typeof event.id !== 'string' || !event.id.trim() || typeof event.type !== 'string' || !event.type.trim() || !Number.isInteger(event.created) || (event.created as number) < 0) {
      throw new StripeWebhookVerificationError('Stripe webhook event identity is incomplete');
    }
    if (typeof event.livemode !== 'boolean') throw new StripeWebhookVerificationError('Stripe webhook livemode is required');
    if (event.account !== undefined && event.account !== null && (typeof event.account !== 'string' || !event.account.trim())) throw new StripeWebhookVerificationError('Stripe webhook account identity is invalid');
    const object = event.data?.object;
    if (!object || typeof object.id !== 'string' || !object.id.trim() || typeof object.object !== 'string' || !object.object.trim()) throw new StripeWebhookVerificationError('Stripe webhook object identity is required');
    const jsonPayload = payload as StripeJsonRecord;
    const encryptedRawBody = encryptSignedProvenance(rawBody, signature);
    const verified: StripeVerifiedEvent = {
      id: event.id,
      type: event.type,
      created: event.created as number,
      livemode: event.livemode,
      accountId: event.account === undefined || event.account === null ? null : event.account,
      objectId: object.id,
      objectType: object.object,
      signatureTimestamp: timestamp,
      rawBodyDigest: sha256Bytes(Buffer.from(rawBody)),
      signatureHeaderDigest: sha256Bytes(Buffer.from(signature, 'utf8')),
      signatureHeader: signature,
      rawBody,
      rawBodyCiphertext: encryptedRawBody.ciphertext,
      rawBodyNonce: encryptedRawBody.nonce,
      rawBodyKeyId: encryptedRawBody.keyId,
      canonicalPayloadDigest: sha256Json(jsonPayload),
      payload: jsonPayload,
    };
    return verified;
  }
}

export function createStripeSignatureVerifierFromEnv(): StripeSignatureVerifier {
  const secret = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SIGNING_SECRET is not configured');
  if (!process.env.STRIPE_WEBHOOK_RAW_BODY_KEY) throw new Error('STRIPE_WEBHOOK_RAW_BODY_KEY is not configured');
  return new StripeSignatureVerifier(secret);
}

export function consumeStripeWebhook(
  rawBody: Uint8Array,
  signature: string | null,
  verifier: StripeWebhookVerifier,
  monitor: SubscriptionCancellationMonitor,
) {
  return SubscriptionCancellationMonitor.consumeSignedWebhook(rawBody, signature, verifier, monitor);
}
