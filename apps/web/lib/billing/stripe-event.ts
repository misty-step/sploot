import { createCipheriv, createHash, randomBytes } from 'node:crypto';

export type StripeJsonValue = null | boolean | number | string | StripeJsonValue[] | { [key: string]: StripeJsonValue };
export type StripeJsonRecord = { [key: string]: StripeJsonValue };

export type StripeVerifiedEvent = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  accountId: string | null;
  objectId: string;
  objectType: string;
  signatureTimestamp: number;
  rawBodyDigest: string;
  signatureHeaderDigest: string;
  /** Exact verified header is retained only inside encrypted provenance. */
  signatureHeader?: string;
  rawBody?: Uint8Array;
  rawBodyCiphertext?: Uint8Array;
  rawBodyNonce?: Uint8Array;
  rawBodyKeyId?: string;
  canonicalPayloadDigest: string;
  payload: StripeJsonRecord;
};

export type StripeSubscriptionDeletedEvent = StripeVerifiedEvent & {
  type: 'customer.subscription.deleted';
};

export function canonicalizeJson(value: StripeJsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Json(value: StripeJsonRecord): string {
  return sha256Bytes(Buffer.from(canonicalizeJson(value), 'utf8'));
}

function rawBodyKey(): { key: Buffer; keyId: string } {
  const configured = process.env.STRIPE_WEBHOOK_RAW_BODY_KEY;
  if (!configured) {
    if (process.env.NODE_ENV === 'test') return { key: createHash('sha256').update('sploot-test-only-raw-body-key').digest(), keyId: 'test-fixture' };
    throw new Error('STRIPE_WEBHOOK_RAW_BODY_KEY is required for encrypted Stripe raw-body provenance');
  }
  const key = Buffer.from(configured, /^[0-9a-f]{64}$/i.test(configured) ? 'hex' : 'base64');
  if (key.length !== 32) throw new Error('STRIPE_WEBHOOK_RAW_BODY_KEY must encode exactly 32 bytes');
  return { key, keyId: process.env.STRIPE_WEBHOOK_RAW_BODY_KEY_ID?.trim() || 'stripe-webhook-key-v1' };
}

export function encryptRawBody(rawBody: Uint8Array): { ciphertext: Uint8Array; nonce: Uint8Array; keyId: string } {
  const { key, keyId } = rawBodyKey();
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(rawBody)), cipher.final(), cipher.getAuthTag()]);
  return { ciphertext, nonce, keyId };
}

export function encryptSignedProvenance(rawBody: Uint8Array, signatureHeader: string): { ciphertext: Uint8Array; nonce: Uint8Array; keyId: string } {
  if (!signatureHeader.trim()) throw new Error('Stripe signature header provenance is required');
  return encryptRawBody(Buffer.from(JSON.stringify({ rawBody: Buffer.from(rawBody).toString('base64'), signatureHeader }), 'utf8'));
}

export function eventRawBodyProvenance(event: StripeVerifiedEvent): { ciphertext: Uint8Array; nonce: Uint8Array; keyId: string; signatureHeaderDigest: string } {
  const raw = event.rawBody ?? Buffer.from(canonicalizeJson(event.payload), 'utf8');
  const encrypted = event.rawBodyCiphertext && event.rawBodyNonce && event.rawBodyKeyId
    ? { ciphertext: event.rawBodyCiphertext, nonce: event.rawBodyNonce, keyId: event.rawBodyKeyId }
    : encryptSignedProvenance(raw, event.signatureHeader ?? `synthetic:t=${event.signatureTimestamp}`);
  const signatureHeaderDigest = event.signatureHeaderDigest ?? sha256Bytes(Buffer.from(`hmac-sha256:${event.signatureTimestamp}`, 'utf8'));
  if (!/^[a-f0-9]{64}$/i.test(signatureHeaderDigest)) throw new Error('Stripe signature header provenance digest is invalid');
  return { ...encrypted, signatureHeaderDigest };
}
