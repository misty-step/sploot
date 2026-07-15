import { PrismaClient } from '@prisma/client';
import { createDecipheriv, createHash, createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  STRIPE_BILLING_CAPABILITIES,
  assertStripeCredential,
  assertStripeOperation,
  requireVerifiedMintLease,
} from '@/lib/billing/stripe-policy';
import {
  CANCELLATION_RATE_REASON,
  SubscriptionCancellationMonitor,
  createProductionSubscriptionCancellationMonitor,
  type StripeCircuitAdapter,
  type StripePageAdapter,
  type StripeSubscriptionDeletedEvent,
  type StripeVerifiedEvent,
} from '@/lib/billing/stripe-cancellation-monitor';
import { consumeStripeWebhook, StripeSignatureVerifier, type StripeWebhookVerifier } from '@/lib/billing/stripe-webhook';
import {
  createProductionStripeCancellationLedger,
  type CancellationDeliveryClaim,
  type CancellationDeliveryCompletion,
  type CancellationLedgerPolicy,
  type CancellationLedgerState,
  type StripeCancellationLedger,
} from '@/lib/billing/stripe-cancellation-ledger';
import { sha256Bytes, sha256Json } from '@/lib/billing/stripe-event';
import { STRIPE_FAILURE_CODE } from '@/lib/billing/stripe-failure-codes';
import {
  buildSubscriptionRecoveryPlan,
  computeRecoverySnapshotDigest,
  parseRecoverySnapshot,
  serializeRecoverySnapshot,
  serializeRecoverySnapshotManifest,
  verifyRecoverySnapshotManifest,
  type StripeRecoverySnapshot,
} from '@/lib/billing/stripe-recovery';

const sandboxKey = ['sk', 'test', 'fixture'].join('_');
const snapshotSigningKeys = generateKeyPairSync('ed25519');
const mintSigningKeys = generateKeyPairSync('ed25519');

const mintRequest = {
  nonce: 'caller-nonce-1',
  principal: 'svc:billing-recovery', workload: 'sploot-web', environment: 'sandbox', purpose: 'subscription-recovery',
  resourceScope: ['customer:cus_1', 'subscription:create'], audience: 'stripe-sandbox', maxTtlSeconds: 300,
  capability: 'subscriptions.create' as const, operation: 'write' as const, egressOrigin: 'https://api.stripe.com', ipScope: ['10.0.0.0/8'],
};

function canonicalMintPayload(lease: Record<string, unknown>): string {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value !== null && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
    return JSON.stringify(value);
  };
  return canonical(Object.fromEntries(Object.entries(lease).filter(([key]) => key !== 'signature' && key !== 'verificationDigest')));
}

function signedMintLease(overrides: Record<string, unknown> = {}) {
  const unsigned = {
    leaseId: 'lease-1', alias: 'mint-authority-1', ...mintRequest,
    issuedAt: '2026-07-14T00:00:00.000Z', nonce: mintRequest.nonce, expiresAt: '2026-07-14T00:05:00.000Z', verificationDigest: '', signature: '',
    ...overrides,
  };
  const payload = canonicalMintPayload(unsigned);
  return { ...unsigned, verificationDigest: createHash('sha256').update(payload).digest('hex'), signature: sign(null, Buffer.from(payload), mintSigningKeys.privateKey).toString('base64') };
}

class ExplicitTestMemoryLedger implements StripeCancellationLedger {
  readonly durability = 'test-memory' as const;
  private readonly events = new Map<string, StripeVerifiedEvent>();
  private alertKey: string | null = null;
  private delivery = { circuitOpened: false, pageSent: false };
  private readonly claims = new Map<string, CancellationDeliveryClaim>();

  async recordEvent(event: StripeVerifiedEvent): Promise<void> {
    const existing = this.events.get(event.id);
    if (existing && (existing.rawBodyDigest !== event.rawBodyDigest || existing.canonicalPayloadDigest !== event.canonicalPayloadDigest)) throw new Error('Stripe event ID was replayed with different authenticated bytes');
    this.events.set(event.id, event);
  }

  async recordCancellation(event: StripeSubscriptionDeletedEvent, policy: CancellationLedgerPolicy, now: number): Promise<CancellationLedgerState> {
    await this.recordEvent(event);
    for (const [id, stored] of this.events) if (stored.created < now - policy.windowSeconds) this.events.delete(id);
    if (this.events.size === 0) {
      this.alertKey = null;
      this.delivery = { circuitOpened: false, pageSent: false };
    }
    const eventIds = [...this.events.values()].filter((stored) => stored.type === 'customer.subscription.deleted' && stored.created >= now - policy.windowSeconds && stored.created <= now).map((stored) => stored.id);
    const breach = eventIds.length > policy.maxCancellations;
    if (breach && !this.alertKey) this.alertKey = `test-alert-${now}`;
    return { alertKey: this.alertKey, count: eventIds.length, eventIds, breach, delivery: { ...this.delivery } };
  }

  async claimDeliveries(alertKey: string, now: number, _leaseSeconds: number, claimToken: string): Promise<readonly CancellationDeliveryClaim[]> {
    if (alertKey !== this.alertKey) throw new Error('unknown test alert');
    const claims: CancellationDeliveryClaim[] = [];
    for (const adapter of ['circuit', 'page'] as const) {
      const deliveryKey = `${alertKey}:${adapter}`;
      if ((adapter === 'circuit' && this.delivery.circuitOpened) || (adapter === 'page' && this.delivery.pageSent)) continue;
      if ([...this.claims.values()].some((claim) => claim.deliveryKey === deliveryKey && claim.leaseExpiresAt > now)) continue;
      const alertPayload = { alert_key: alertKey, reason: CANCELLATION_RATE_REASON };
      const wrapper = adapter === 'circuit'
        ? { action: 'open', reason: CANCELLATION_RATE_REASON, alert: alertPayload }
        : { action: 'page', alert: alertPayload };
      const payloadBytes = JSON.stringify(wrapper);
      const claim = { alertKey, adapter, deliveryKey, replayKey: `test-replay:${deliveryKey}`, claimToken, generation: now, leaseExpiresAt: now + 60, payloadDigest: createHash('sha256').update(Buffer.from(payloadBytes, 'utf8')).digest('hex'), payloadVersion: 'stripe-cancellation-http-v1', payload: wrapper, payloadBytes };
      this.claims.set(deliveryKey, claim);
      claims.push(claim);
    }
    return claims;
  }

  async completeDelivery(claim: CancellationDeliveryClaim, completion: CancellationDeliveryCompletion, now: number): Promise<boolean> {
    const current = this.claims.get(claim.deliveryKey);
    if (!current || current.claimToken !== claim.claimToken || current.generation !== claim.generation || current.leaseExpiresAt <= now) return false;
    if (completion.succeeded) this.delivery[claim.adapter === 'circuit' ? 'circuitOpened' : 'pageSent'] = true;
    this.claims.delete(claim.deliveryKey);
    return true;
  }

  async drainDeliveries(now: number, leaseSeconds: number, claimToken: string): Promise<readonly CancellationDeliveryClaim[]> {
    if (!this.alertKey) return [];
    return this.claimDeliveries(this.alertKey, now, leaseSeconds, claimToken);
  }

  async replayDeadLetter(_replayKey: string, _now: number): Promise<boolean> { return false; }

  async deliveryHealth(alertKey?: string | null): Promise<{ pending: number; claimed: number; deadLetter: number; unresolved: number }> {
    const deliveryKeys = [...this.claims.values()].filter((claim) => alertKey === undefined || alertKey === null || claim.alertKey === alertKey);
    const deadLetter = deliveryKeys.filter((claim) => claim.leaseExpiresAt <= 0).length;
    return { pending: 0, claimed: deliveryKeys.length, deadLetter, unresolved: deliveryKeys.length + deadLetter };
  }
}

function monitorWith(ledger: StripeCancellationLedger, circuit: StripeCircuitAdapter, page: StripePageAdapter) {
  return new SubscriptionCancellationMonitor({ maxCancellations: 3, windowSeconds: 3600, clock: () => 1_700_000_000, ledger, circuit, page });
}

function eventFor(id: string, type: string = 'customer.subscription.deleted'): StripeVerifiedEvent {
  const payload = { id, type, created: 1_700_000_000, livemode: false, account: null, data: { object: { id: `obj_${id}`, object: 'subscription' } } } as const;
  return { id, type, created: 1_700_000_000, livemode: false, accountId: null, objectId: `obj_${id}`, objectType: 'subscription', signatureTimestamp: 1_700_000_000, rawBodyDigest: sha256Bytes(Buffer.from(JSON.stringify(payload))), canonicalPayloadDigest: sha256Json(payload), payload } as StripeVerifiedEvent;
}

function cancellationFor(id: string): StripeSubscriptionDeletedEvent {
  return eventFor(id) as StripeSubscriptionDeletedEvent;
}

async function signed(monitor: SubscriptionCancellationMonitor, event: StripeSubscriptionDeletedEvent) {
  const verifier: StripeWebhookVerifier = { async verify() { return event; } };
  return consumeStripeWebhook(new TextEncoder().encode('{}'), 'sig_test', verifier, monitor);
}

function snapshotWithoutDigest(): Omit<StripeRecoverySnapshot, 'provenance'> & { provenance: Omit<StripeRecoverySnapshot['provenance'], 'digestSha256'> & { digestSha256?: string } } {
  return {
    source: 'preincident-snapshot',
    capturedAt: '2026-07-14T00:00:00.000Z',
    provenance: {
      kind: 'stripe-preincident-export', sourceRef: 'stripe-export-2026-07-14', capturedAt: '2026-07-14T00:00:00.000Z',
      manifest: { algorithm: 'ed25519', keyId: 'test-key', sourceRef: 'stripe-export-2026-07-14', capturedAt: '2026-07-14T00:00:00.000Z', digestSha256: 'placeholder', validUntil: '2099-01-01T00:00:00.000Z', signature: 'placeholder' },
    },
    customers: [{ id: 'cus_1', email: 'customer@example.test', invoice_settings: { default_payment_method: 'pm_1' } }],
    activePrices: [{ id: 'price_basic', active: true, currency: 'usd', unitAmount: 1200, recurring: { interval: 'month', intervalCount: 1 } }],
    paymentMethods: [{ id: 'pm_1', customer: 'cus_1', type: 'card', card: { last4: '4242' } }],
    taxRates: [{ id: 'txr_1', active: true, percentage: 20 }],
    coupons: [{ id: 'coupon_1', percentOff: 10, name: 'saved' }],
    promotionCodes: [{ id: 'promo_1', code: 'SAVE10', coupon: 'coupon_1', active: true }],
    subscriptions: [{
      id: 'sub_canceled', customer: 'cus_1', status: 'canceled', currency: 'usd', items: [{ price: 'price_basic', quantity: 2, taxRates: ['txr_1'] }],
      defaultPaymentMethod: 'pm_1', billingCycleAnchor: 1_700_000_100, trialEnd: 1_700_000_200,
      discounts: [{ promotionCode: 'promo_1' }], defaultTaxRates: ['txr_1'], automaticTax: true,
      collectionMethod: 'charge_automatically', metadata: { plan: 'basic' },
    }],
  };
}

function completeSnapshot(): StripeRecoverySnapshot {
  const snapshot = snapshotWithoutDigest();
  const digest = computeRecoverySnapshotDigest(snapshot);
  const unsigned = { ...snapshot, provenance: { ...snapshot.provenance, digestSha256: digest, manifest: { ...snapshot.provenance.manifest, digestSha256: digest } } } as StripeRecoverySnapshot;
  const signature = sign(null, Buffer.from(serializeRecoverySnapshotManifest(unsigned)), snapshotSigningKeys.privateKey).toString('base64');
  return { ...unsigned, provenance: { ...unsigned.provenance, manifest: { ...unsigned.provenance.manifest, signature } } };
}

describe('Stripe sandbox and capability policy', () => {
  it('accepts only a sandbox secret and refuses a forged live alias', () => {
    expect(assertStripeCredential({ mode: 'test', source: 'sandbox-env', secretKey: sandboxKey })).toMatchObject({ mode: 'test', source: 'sandbox-env' });
    expect(() => assertStripeCredential({ mode: 'live', source: 'mint-alias', alias: 'prod-stripe' })).toThrow(/live Stripe access is unavailable/i);
    expect(() => assertStripeCredential({ mode: 'test', source: 'sandbox-env', secretKey: ['sk', 'live', 'never'].join('_') })).toThrow(/live Stripe keys are not accepted/i);
  });

  it('allows only the explicit billing capability contract', () => {
    expect(STRIPE_BILLING_CAPABILITIES).toContain('subscriptions.create');
    expect(STRIPE_BILLING_CAPABILITIES).toContain('subscriptions.cancel_at_period_end');
    expect(STRIPE_BILLING_CAPABILITIES).not.toContain('subscriptions.delete');
    expect(() => assertStripeOperation('subscriptions.delete')).toThrow(/not granted/i);
  });

  it('refuses Mint aliases without a verifiable lease, TTL, and IP scope', async () => {
    await expect(requireVerifiedMintLease(undefined, mintRequest)).rejects.toThrow(/authority adapter/i);
    await expect(requireVerifiedMintLease({ verificationKeyPem: mintSigningKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), async verifyLease() { return signedMintLease({ expiresAt: '2020-01-01T00:00:00.000Z' }); }, async consumeNonce() { return true; } }, mintRequest, new Date('2026-07-14T00:01:00.000Z'))).rejects.toThrow(/expired/i);
    await expect(requireVerifiedMintLease({ verificationKeyPem: mintSigningKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), async verifyLease() { return signedMintLease({ principal: 'svc:other' }); }, async consumeNonce() { return true; } }, mintRequest, new Date('2026-07-14T00:01:00.000Z'))).rejects.toThrow(/identity/i);
    await expect(requireVerifiedMintLease({ verificationKeyPem: mintSigningKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), async verifyLease() { return signedMintLease({ expiresAt: '2026-07-14T00:10:00.000Z' }); }, async consumeNonce() { return true; } }, mintRequest, new Date('2026-07-14T00:01:00.000Z'))).rejects.toThrow(/TTL/i);
    await expect(requireVerifiedMintLease({ verificationKeyPem: mintSigningKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), async verifyLease() { return signedMintLease({ issuedAt: '2026-07-14T00:00:30.000Z', expiresAt: '2026-07-14T00:05:29.000Z' }); }, async consumeNonce() { return true; } }, mintRequest, new Date('2026-07-14T00:01:00.000Z'))).rejects.toThrow(/exact TTL/i);
    await expect(requireVerifiedMintLease({ verificationKeyPem: mintSigningKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), async verifyLease() { return signedMintLease({ ipScope: ['8.8.8.8/32'] }); }, async consumeNonce() { return true; } }, mintRequest, new Date('2026-07-14T00:01:00.000Z'))).rejects.toThrow(/restricted IP scope/i);
  });

  it('requires signed identity-bound leases and consumes the nonce exactly once', async () => {
    const consumed = new Set<string>();
    const authority = {
      verificationKeyPem: mintSigningKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      async verifyLease() { return signedMintLease(); },
      async consumeNonce(lease: { nonce: string }) { if (consumed.has(lease.nonce)) return false; consumed.add(lease.nonce); return true; },
    };
    const now = new Date('2026-07-14T00:01:00.000Z');
    await expect(requireVerifiedMintLease(authority, mintRequest, now)).resolves.toMatchObject({ principal: mintRequest.principal, audience: mintRequest.audience });
    await expect(requireVerifiedMintLease(authority, mintRequest, now)).rejects.toThrow(/nonce/i);
    await expect(requireVerifiedMintLease({ ...authority, async verifyLease() { return signedMintLease({ resourceScope: ['customer:other'] }); } }, mintRequest, now)).rejects.toThrow(/resource scope/i);
  });
});

describe('subscription cancellation monitor', () => {
  it('requires the production factory to construct against configured Postgres', () => {
    expect(() => createProductionSubscriptionCancellationMonitor({
      database: null,
      maxCancellations: 3,
      windowSeconds: 3600,
      circuit: { async open() {} },
      page: { async page() {} },
    })).toThrow(/configured Postgres/i);
  });

  it('has no public plain-event bypass and deduplicates through the signed boundary', async () => {
    const ledger = new ExplicitTestMemoryLedger();
    const circuitReasons: string[] = [];
    const pages: string[] = [];
    const monitor = monitorWith(
      ledger,
      { async open(payloadBytes) { circuitReasons.push((JSON.parse(payloadBytes) as { reason: string }).reason); } },
      { async page(payloadBytes) { pages.push((JSON.parse(payloadBytes) as { alert: { reason: string } }).alert.reason); } },
    );
    expect((monitor as unknown as { observe?: unknown }).observe).toBeUndefined();
    for (let i = 0; i < 3; i += 1) await signed(monitor, cancellationFor(`evt_${i}`));
    const result = (await signed(monitor, cancellationFor('evt_3'))).observation!;
    await signed(monitor, cancellationFor('evt_3'));
    expect(result.operationalStatus).toBe('tripped');
    expect(circuitReasons).toEqual(['stripe subscription cancellation rate exceeded']);
    expect(pages).toEqual(['stripe subscription cancellation rate exceeded']);
  });

  it('refuses unsigned or unverifiable webhook events and keeps delivery failures retryable', async () => {
    const monitor = monitorWith(new ExplicitTestMemoryLedger(), { async open() { throw new Error('circuit unavailable'); } }, { async page() { throw new Error('pager unavailable'); } });
    const verifier: StripeWebhookVerifier = { async verify() { return eventFor('evt_verified') as StripeSubscriptionDeletedEvent; } };
    await expect(consumeStripeWebhook(new TextEncoder().encode('{}'), null, verifier, monitor)).rejects.toThrow(/signature is required/i);
    const noEvent: StripeWebhookVerifier = { async verify() { return null; } };
    expect(await consumeStripeWebhook(new TextEncoder().encode('{}'), 'sig_test', noEvent, monitor)).toEqual({ handled: false });
    for (let i = 0; i < 4; i += 1) {
      const result = (await signed(monitor, cancellationFor(`failure_${i}`))).observation!;
      if (i === 3) {
        expect(result.operationalStatus).toBe('delivery-failed');
        expect(result.outcomes.every((outcome) => outcome.error === STRIPE_FAILURE_CODE.DELIVERY_FAILED)).toBe(true);
        expect(result.outcomes.some((outcome) => outcome.error === 'circuit unavailable' || outcome.error === 'pager unavailable')).toBe(false);
      }
    }
  });

  it('returns truthful handled/ignored for an authenticated irrelevant event', async () => {
    const ledger = new ExplicitTestMemoryLedger();
    const monitor = monitorWith(ledger, { async open() {} }, { async page() {} });
    const result = await signed(monitor, eventFor('evt_irrelevant', 'invoice.paid'));
    expect(result).toEqual({ handled: true, ignored: true });
  });

  it('verifies Stripe signed raw request bytes before accepting a cancellation event', async () => {
    const rawBody = JSON.stringify({ id: 'evt_signed', type: 'customer.subscription.deleted', created: 1_700_000_000, livemode: false, account: null, data: { object: { id: 'sub_signed', object: 'subscription' } } });
    const rawBytes = new TextEncoder().encode(rawBody);
    const timestamp = 1_700_000_000;
    const secret = 'whsec_test_fixture';
    const digest = createHmac('sha256', secret).update(Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(rawBytes)])).digest('hex');
    const verifier = new StripeSignatureVerifier(secret, 300, () => timestamp);
    const verified = await verifier.verify(rawBytes, `t=${timestamp},v1=${digest}`);
    expect(verified).toMatchObject({ id: 'evt_signed', type: 'customer.subscription.deleted', created: timestamp, objectId: 'sub_signed' });
    const encrypted = verified?.rawBodyCiphertext!;
    const configuredKey = process.env.STRIPE_WEBHOOK_RAW_BODY_KEY;
    const key = configuredKey ? Buffer.from(configuredKey, /^[0-9a-f]{64}$/i.test(configuredKey) ? 'hex' : 'base64') : createHash('sha256').update('sploot-test-only-raw-body-key').digest();
    const decipher = createDecipheriv('aes-256-gcm', key, verified?.rawBodyNonce);
    decipher.setAuthTag(Buffer.from(encrypted).subarray(-16));
    const provenance = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted).subarray(0, -16)), decipher.final()]).toString('utf8')) as { rawBody: string; signatureHeader: string };
    expect(Buffer.from(provenance.rawBody, 'base64').equals(rawBytes)).toBe(true);
    expect(provenance.signatureHeader).toBe(`t=${timestamp},v1=${digest}`);
    await expect(verifier.verify(rawBytes, `t=${timestamp},v1=${'0'.repeat(64)}`)).rejects.toThrow(/signature verification failed/i);
    await expect(verifier.verify(rawBytes, `t=${timestamp - 301},v1=${digest}`)).rejects.toThrow(/tolerance/i);
  });
});

describe('immutable subscription recovery snapshots', () => {
  it('rejects missing or lossy state and verifies provenance digest', () => {
    const snapshot = completeSnapshot();
    expect(() => parseRecoverySnapshot({ ...snapshot, activePrices: undefined })).toThrow(/activePrices.*(undefined|array)/i);
    expect(() => parseRecoverySnapshot({ ...snapshot, subscriptions: [{ ...snapshot.subscriptions[0], defaultPaymentMethod: 'pm_missing' }] })).toThrow(/absent payment method/i);
    expect(() => parseRecoverySnapshot({ ...snapshot, provenance: { ...snapshot.provenance, digestSha256: '0'.repeat(64), manifest: { ...snapshot.provenance.manifest, digestSha256: '0'.repeat(64) } } })).toThrow(/digest does not match|manifest digest/i);
    const roundTrip = JSON.parse(serializeRecoverySnapshot(snapshot)) as StripeRecoverySnapshot;
    expect(roundTrip).toEqual(snapshot);
    expect(roundTrip.subscriptions[0].discounts?.[0]).toEqual({ promotionCode: 'promo_1' });
    expect(serializeRecoverySnapshotManifest(snapshot)).toBe(serializeRecoverySnapshotManifest(JSON.parse(serializeRecoverySnapshot(snapshot))));
  });

  it('rejects a validated-but-unsupported field before any recovery execution', () => {
    const snapshot = completeSnapshot();
    const unsupported = JSON.parse(JSON.stringify(snapshot)) as StripeRecoverySnapshot;
    (unsupported.subscriptions[0] as unknown as Record<string, unknown>).pauseCollection = { behavior: 'void' };
    const digest = computeRecoverySnapshotDigest(unsupported);
    unsupported.provenance.digestSha256 = digest;
    unsupported.provenance.manifest.digestSha256 = digest;
    unsupported.provenance.manifest.signature = sign(null, Buffer.from(serializeRecoverySnapshotManifest(unsupported)), snapshotSigningKeys.privateKey).toString('base64');
    expect(() => buildSubscriptionRecoveryPlan(unsupported)).toThrow(/unsupported recovery fields.*pauseCollection/i);
  });

  it('preserves quantities, currency, promotion codes, coupons, and payment references in the recovery plan', () => {
    const plan = buildSubscriptionRecoveryPlan(completeSnapshot());
    expect(plan.creations).toEqual([expect.objectContaining({
      customer: 'cus_1', currency: 'usd', default_payment_method: 'pm_1', items: [{ price: 'price_basic', quantity: 2, tax_rates: ['txr_1'] }],
      discounts: [{ promotion_code: 'promo_1' }], billing_cycle_anchor: 1_700_000_100, trial_end: 1_700_000_200,
      default_tax_rates: ['txr_1'], automatic_tax: { enabled: true }, metadata: { plan: 'basic', sploot_recreated_from: 'sub_canceled' },
    })]);
    expect(plan.warnings.some((warning) => warning.includes('was canceled in the snapshot'))).toBe(true);
    expect(plan.warnings.some((warning) => warning.includes('SCA/off-session authorization must be re-established'))).toBe(true);
  });

  it('requires an externally supplied manifest key and rejects tampering or the wrong key', () => {
    const snapshot = completeSnapshot();
    expect(() => verifyRecoverySnapshotManifest(snapshot, { keyId: 'wrong-key', publicKeyPem: snapshotSigningKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }, new Date('2026-07-14T12:00:00.000Z'))).toThrow(/key ID/i);
    const tampered = { ...snapshot, customers: [{ ...snapshot.customers[0], email: 'tampered@example.test' }] } as StripeRecoverySnapshot;
    expect(() => verifyRecoverySnapshotManifest(tampered, { keyId: 'test-key', publicKeyPem: snapshotSigningKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }, new Date('2026-07-14T12:00:00.000Z'))).toThrow(/digest|signature/i);
    expect(() => verifyRecoverySnapshotManifest(snapshot, { keyId: 'test-key', publicKeyPem: generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString() }, new Date('2026-07-14T12:00:00.000Z'))).toThrow(/signature/i);
  });
});

describe.skipIf(!process.env.DATABASE_URL || !process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL || !process.env.STRIPE_LEDGER_ISSUER_DATABASE_URL)('durable Postgres cancellation ledger', () => {
  it('concurrently deduplicates, fences outbox claims, and rejects app-role mutation', async () => {
    const database = new PrismaClient();
    const adminUrl = process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL;
    const issuerUrl = process.env.STRIPE_LEDGER_ISSUER_DATABASE_URL;
    if (!adminUrl || !issuerUrl) throw new Error('DB authority test requires admin and issuer URLs');
    const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
    const issuer = new PrismaClient({ datasources: { db: { url: issuerUrl } } });
    const ledger = createProductionStripeCancellationLedger(database);
    const policy = { maxCancellations: 3, windowSeconds: 1 };
    const prefix = `db-ledger-${Date.now()}`;
    // Disjoint synthetic epoch (~4 months ahead of wall clock): the window
    // count in sploot_record_stripe_cancellation is by created_epoch, so this
    // keeps the 1-second test window from ever overlapping events written by
    // the other Postgres-backed Stripe suites, while to_timestamp(now) still
    // sorts after the CURRENT_TIMESTAMP defaults used for outbox rows.
    const now = Math.floor(Date.now() / 1000) + 10_000_000;
    try {
      await Promise.all(Array.from({ length: 4 }, (_, i) => ledger.recordCancellation({ ...cancellationFor(`${prefix}-${i}`), created: now, signatureTimestamp: now }, policy, now)));
      const first = await ledger.recordCancellation({ ...cancellationFor(`${prefix}-3`), created: now, signatureTimestamp: now }, policy, now);
      expect(first.count).toBe(4);
      expect(first.breach).toBe(true);
      const events = await admin.stripeCancellationEvent.count({ where: { eventId: { startsWith: prefix } } });
      const audit = await admin.stripeCancellationAudit.count({ where: { eventId: { startsWith: prefix } } });
      expect(events).toBe(4);
      expect(audit).toBeGreaterThanOrEqual(5);
      expect(first.eventIds).toHaveLength(4);
      expect(await admin.stripeCancellationDelivery.count({ where: { alertKey: first.alertKey! } })).toBe(2);
      await expect(ledger.recordEvent({ ...cancellationFor(`${prefix}-0`), rawBodyDigest: 'f'.repeat(64) })).rejects.toThrow(/different authenticated bytes|replayed/i);
      const grants = await database.$queryRaw<Array<{ event_insert: boolean; audit_delete: boolean; append_execute: boolean }>>`
        SELECT has_table_privilege(current_user, 'public.stripe_cancellation_events', 'INSERT') AS event_insert,
               has_table_privilege(current_user, 'public.stripe_cancellation_audit', 'DELETE') AS audit_delete,
               has_function_privilege(current_user, 'public.sploot_append_stripe_event(text,text,integer,boolean,text,text,text,integer,jsonb,text,text,bytea,bytea,text,text)', 'EXECUTE') AS append_execute
      `;
      expect(grants).toEqual([{ event_insert: false, audit_delete: false, append_execute: false }]);
      const issuerGrant = await issuer.$queryRaw<Array<{ append_execute: boolean }>>`SELECT has_function_privilege(current_user, 'public.sploot_append_stripe_event(text,text,integer,boolean,text,text,text,integer,jsonb,text,text,bytea,bytea,text,text)', 'EXECUTE') AS append_execute`;
      expect(issuerGrant).toEqual([{ append_execute: true }]);

      const claimNow = now + 2;
      const [claimsA, claimsB] = await Promise.all([ledger.claimDeliveries(first.alertKey!, claimNow, 60, 'claim-a'), ledger.claimDeliveries(first.alertKey!, claimNow, 60, 'claim-b')]);
      expect(claimsA.length + claimsB.length).toBe(2);
      const claims = [...claimsA, ...claimsB];
      expect(new Set(claims.map((claim) => claim.deliveryKey)).size).toBe(2);
      const circuit = claims.find((claim) => claim.adapter === 'circuit')!;
      const page = claims.find((claim) => claim.adapter === 'page')!;
      expect(await ledger.completeDelivery(page, { succeeded: false, error: 'injected page failure' }, claimNow)).toBe(true);
      expect(await admin.stripeCancellationDelivery.findUnique({ where: { deliveryKey: page.deliveryKey }, select: { nextAttemptAt: true, attempts: true, status: true, lastError: true } })).toMatchObject({ status: 'pending', attempts: 1, lastError: 'stripe_delivery_failed' });
      const retries = await ledger.claimDeliveries(first.alertKey!, claimNow + 300, 60, 'claim-retry');
      const retry = retries.find((claim) => claim.adapter === 'page')!;
      const retryCircuit = retries.find((claim) => claim.adapter === 'circuit')!;
      expect(retry.claimToken).not.toBe(page.claimToken);
      expect(await ledger.completeDelivery(page, { succeeded: true }, claimNow + 361)).toBe(false);
      expect(await ledger.completeDelivery(circuit, { succeeded: true }, claimNow)).toBe(false);
      expect(await ledger.completeDelivery(retryCircuit, { succeeded: true }, claimNow + 300)).toBe(true);
      expect(await ledger.completeDelivery(retry, { succeeded: true }, claimNow + 300)).toBe(true);
      expect(await ledger.completeDelivery(retry, { succeeded: true }, claimNow + 300)).toBe(false);
      const deadAlertKey = `${prefix}:dead-letter`;
      await admin.stripeCancellationAlert.create({ data: { alertKey: deadAlertKey, windowStart: now, windowSeconds: 1, count: 0, eventIds: [] } });
      const deadWrapperBytes = JSON.stringify({ action: 'page', alert: { alert_key: deadAlertKey } });
      await admin.stripeCancellationDelivery.create({ data: { deliveryKey: `${deadAlertKey}:page`, replayKey: `stripe-delivery-replay:${deadAlertKey}:page`, alertKey: deadAlertKey, adapter: 'page', payloadDigest: createHash('sha256').update(Buffer.from(deadWrapperBytes, 'utf8')).digest('hex'), payloadVersion: 'stripe-cancellation-http-v1', payload: JSON.parse(deadWrapperBytes), payloadBytes: deadWrapperBytes, nextAttemptAt: new Date(now * 1000) } });
      let deadNow = now;
      let deadClaim: CancellationDeliveryClaim | undefined;
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        deadClaim = (await ledger.claimDeliveries(deadAlertKey, deadNow, 60, `dead-${attempt}`))[0];
        expect(deadClaim).toBeDefined();
        expect(await ledger.completeDelivery(deadClaim!, { succeeded: false, error: `injected-${attempt}` }, deadNow)).toBe(true);
        deadNow += 300;
      }
      expect(await admin.stripeCancellationDelivery.findUnique({ where: { deliveryKey: `${deadAlertKey}:page` }, select: { status: true, attempts: true } })).toEqual({ status: 'dead-letter', attempts: 8 });
      expect(await ledger.deliveryHealth(deadAlertKey)).toMatchObject({ deadLetter: 1, unresolved: 1 });
      expect(await admin.stripeCancellationAudit.count({ where: { alertKey: deadAlertKey, action: 'delivery-dead-lettered' } })).toBeGreaterThan(0);
      const replayedByMaintenance = await admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL SESSION AUTHORIZATION "sploot_stripe_ledger_maintenance"');
        const result = await tx.$queryRaw<Array<{ sploot_replay_stripe_dead_letter: boolean }>>`SELECT public.sploot_replay_stripe_dead_letter(${deadClaim!.replayKey}::text, ${deadNow}::integer)`;
        return result[0]?.sploot_replay_stripe_dead_letter;
      });
      expect(replayedByMaintenance).toBe(true);
      const replayed = (await ledger.claimDeliveries(deadAlertKey, deadNow, 60, 'dead-replay'))[0];
      expect(await ledger.completeDelivery(replayed, { succeeded: true }, deadNow)).toBe(true);
      expect(await ledger.deliveryHealth(deadAlertKey)).toMatchObject({ deadLetter: 0, unresolved: 0 });
      await expect(database.$executeRaw`UPDATE "stripe_cancellation_events" SET "event_type" = 'forged' WHERE "event_id" = ${`${prefix}-0`}`).rejects.toThrow(/permission|append-only/i);
      await expect(database.$executeRaw`DELETE FROM "stripe_cancellation_audit" WHERE "event_id" = ${`${prefix}-0`}`).rejects.toThrow(/permission|append-only/i);

      const issuedAt = new Date();
      const rangeStart = new Date(issuedAt.getTime() - 120_000);
      const rangeEnd = new Date(issuedAt.getTime() - 30_000);
      const legalMinimumSince = new Date(issuedAt.getTime() - 20_000);
      const subjectA = `obj_${prefix}-0`;
      const subjectB = `obj_${prefix}-1`;
      const oldAuditCreatedAt = new Date(issuedAt.getTime() - 60_000);
      await admin.stripeCancellationAudit.createMany({ data: [
        { id: `${prefix}-old-audit-a`, eventId: `${prefix}-0`, action: 'retention-fixture', provenanceDigest: 'retention:a', details: {}, createdAt: oldAuditCreatedAt },
        { id: `${prefix}-old-audit-b`, eventId: `${prefix}-1`, action: 'retention-fixture', provenanceDigest: 'retention:b', details: {}, createdAt: oldAuditCreatedAt },
      ] });
      const token = `${prefix}-maintenance-token`;
      await issuer.$queryRaw`SELECT public.sploot_issue_stripe_maintenance_token(encode(public.digest(${token}, 'sha256'), 'hex'), 1, ${'test-maintainer'}, ${'failure-injection purge'}, ${'object'}, ${subjectA}, ${'audit.created_at'}, ${rangeStart}::timestamp, ${rangeEnd}::timestamp, ${legalMinimumSince}::timestamp, ${issuedAt}::timestamp, ${new Date(Date.now() + 60_000)}::timestamp)`;
      await expect(issuer.$queryRaw`SELECT public.sploot_issue_stripe_maintenance_token(encode(public.digest(${`${token}-badkind`}, 'sha256'), 'hex'), 1, ${'test-maintainer'}, ${'bad subject'}, ${'everything'}, ${subjectA}, ${'audit.created_at'}, ${rangeStart}::timestamp, ${rangeEnd}::timestamp, ${legalMinimumSince}::timestamp, ${issuedAt}::timestamp, ${new Date(Date.now() + 60_000)}::timestamp)`).rejects.toThrow(/subject binding is invalid/i);
      await expect(issuer.$queryRaw`SELECT public.sploot_issue_stripe_maintenance_token(encode(public.digest(${`${token}-future-cutoff`}, 'sha256'), 'hex'), 1, ${'test-maintainer'}, ${'future cutoff'}, ${'object'}, ${subjectA}, ${'audit.created_at'}, ${rangeStart}::timestamp, ${issuedAt}::timestamp, ${new Date(issuedAt.getTime() + 60_000)}::timestamp, ${issuedAt}::timestamp, ${new Date(Date.now() + 60_000)}::timestamp)`).rejects.toThrow(/contract is invalid/i);
      await expect(admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL SESSION AUTHORIZATION "sploot_stripe_ledger_maintenance"');
        const result = await tx.$queryRaw<Array<{ sploot_purge_stripe_audit: number }>>`SELECT public.sploot_purge_stripe_audit(${token}::text, 1, ${'test-maintainer'}::text, ${'failure-injection purge'}::text, ${'object'}::text, ${subjectA}::text, ${rangeStart}::timestamp, ${rangeEnd}::timestamp, ${new Date(Date.now() - 20_000)}::timestamp)`;
        return result[0]?.sploot_purge_stripe_audit;
      })).rejects.toThrow(/mismatched/i);
      // Two-subject adversary: a token bound to subject A cannot purge B's
      // rows even with a matching time range and legal cutoff.
      await expect(admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL SESSION AUTHORIZATION "sploot_stripe_ledger_maintenance"');
        const result = await tx.$queryRaw<Array<{ sploot_purge_stripe_audit: number }>>`SELECT public.sploot_purge_stripe_audit(${token}::text, 1, ${'test-maintainer'}::text, ${'failure-injection purge'}::text, ${'object'}::text, ${subjectB}::text, ${rangeStart}::timestamp, ${rangeEnd}::timestamp, ${legalMinimumSince}::timestamp)`;
        return result[0]?.sploot_purge_stripe_audit;
      })).rejects.toThrow(/mismatched/i);
      // Operation binding: an audit.created_at token cannot erase encrypted
      // event provenance even when every caller-supplied field matches.
      await expect(admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL SESSION AUTHORIZATION "sploot_stripe_ledger_maintenance"');
        return tx.$queryRaw`SELECT public.sploot_purge_stripe_raw_provenance(${token}::text, 1, ${'test-maintainer'}::text, ${'failure-injection purge'}::text, ${'object'}::text, ${subjectA}::text, ${rangeStart}::timestamp, ${rangeEnd}::timestamp, ${legalMinimumSince}::timestamp)`;
      })).rejects.toThrow(/mismatched/i);
      const subjectBAuditBefore = await admin.stripeCancellationAudit.count({ where: { eventId: `${prefix}-1` } });
      expect(subjectBAuditBefore).toBeGreaterThan(0);
      const subjectAAuditBefore = await admin.stripeCancellationAudit.count({ where: { eventId: `${prefix}-0` } });
      const purged = await admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL SESSION AUTHORIZATION "sploot_stripe_ledger_maintenance"');
        const result = await tx.$queryRaw<Array<{ sploot_purge_stripe_audit: number }>>`SELECT public.sploot_purge_stripe_audit(${token}::text, 1, ${'test-maintainer'}::text, ${'failure-injection purge'}::text, ${'object'}::text, ${subjectA}::text, ${rangeStart}::timestamp, ${rangeEnd}::timestamp, ${legalMinimumSince}::timestamp)`;
        return result[0]?.sploot_purge_stripe_audit;
      });
      expect(purged).toBeGreaterThan(0);
      expect(await admin.stripeCancellationAudit.count({ where: { eventId: `${prefix}-0` } })).toBe(subjectAAuditBefore - purged);
      expect(await admin.stripeCancellationAudit.count({ where: { eventId: `${prefix}-1` } })).toBe(subjectBAuditBefore);
      const concurrentToken = `${prefix}-maintenance-concurrent`;
      await issuer.$queryRaw`SELECT public.sploot_issue_stripe_maintenance_token(encode(public.digest(${concurrentToken}, 'sha256'), 'hex'), 2, ${'test-maintainer'}, ${'concurrent purge'}, ${'object'}, ${subjectB}, ${'audit.created_at'}, ${rangeStart}::timestamp, ${rangeEnd}::timestamp, ${legalMinimumSince}::timestamp, ${issuedAt}::timestamp, ${new Date(Date.now() + 60_000)}::timestamp)`;
      const concurrentPurge = () => admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL SESSION AUTHORIZATION "sploot_stripe_ledger_maintenance"');
        const result = await tx.$queryRaw<Array<{ sploot_purge_stripe_audit: number }>>`SELECT public.sploot_purge_stripe_audit(${concurrentToken}::text, 2, ${'test-maintainer'}::text, ${'concurrent purge'}::text, ${'object'}::text, ${subjectB}::text, ${rangeStart}::timestamp, ${rangeEnd}::timestamp, ${legalMinimumSince}::timestamp)`;
        return result[0]?.sploot_purge_stripe_audit;
      });
      const concurrentResults = await Promise.allSettled([concurrentPurge(), concurrentPurge()]);
      expect(concurrentResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(concurrentResults.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const rawPurgeToken = `${prefix}-raw-provenance-purge`;
      const rawRangeStart = new Date(issuedAt.getTime() - 300_000);
      const rawRangeEnd = issuedAt;
      const rawLegalMinimumSince = issuedAt;
      await issuer.$queryRaw`SELECT public.sploot_issue_stripe_maintenance_token(encode(public.digest(${rawPurgeToken}, 'sha256'), 'hex'), 3, ${'test-maintainer'}, ${'raw provenance retention'}, ${'object'}, ${subjectA}, ${'event.received_at'}, ${rawRangeStart}::timestamp, ${rawRangeEnd}::timestamp, ${rawLegalMinimumSince}::timestamp, ${issuedAt}::timestamp, ${new Date(Date.now() + 60_000)}::timestamp)`;
      const rawPurged = await admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL SESSION AUTHORIZATION "sploot_stripe_ledger_maintenance"');
        const result = await tx.$queryRaw<Array<{ sploot_purge_stripe_raw_provenance: number }>>`SELECT public.sploot_purge_stripe_raw_provenance(${rawPurgeToken}::text, 3, ${'test-maintainer'}::text, ${'raw provenance retention'}::text, ${'object'}::text, ${subjectA}::text, ${rawRangeStart}::timestamp, ${rawRangeEnd}::timestamp, ${rawLegalMinimumSince}::timestamp)`;
        return result[0]?.sploot_purge_stripe_raw_provenance;
      });
      // Subject binding: only subject A's encrypted provenance is erased; the
      // other three events in the identical time range keep their bytes.
      expect(rawPurged).toBe(1);
      expect(await admin.stripeCancellationEvent.count({ where: { eventId: { startsWith: prefix }, rawBodyKeyId: 'purged:v1' } })).toBe(1);
      expect(await admin.stripeCancellationEvent.count({ where: { eventId: `${prefix}-0`, rawBodyKeyId: 'purged:v1' } })).toBe(1);
      expect(await admin.stripeCancellationEvent.count({ where: { eventId: { startsWith: prefix }, rawBodyKeyId: { not: 'purged:v1' } } })).toBe(3);
      const maintenanceRows = await admin.$queryRaw<Array<{ record_digest: string; previous_record_digest: string | null }>>`SELECT "record_digest", "previous_record_digest" FROM "stripe_cancellation_maintenance" ORDER BY "created_at" DESC LIMIT 1`;
      expect(maintenanceRows[0]?.record_digest).toMatch(/^[a-f0-9]{64}$/);
      await expect(database.$executeRaw`UPDATE "stripe_cancellation_maintenance" SET "reason" = 'tampered'`).rejects.toThrow(/permission|append-only/i);
      await admin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL SESSION AUTHORIZATION "sploot_stripe_adversary"');
        const privileges = await tx.$queryRaw<Array<{ execute: boolean; select: boolean; delete: boolean }>>`SELECT has_function_privilege(current_user, 'public.sploot_append_stripe_event(text,text,integer,boolean,text,text,text,integer,jsonb,text,text,bytea,bytea,text,text)', 'EXECUTE') AS execute, has_table_privilege(current_user, 'public.stripe_cancellation_events', 'SELECT') AS select, has_table_privilege(current_user, 'public.stripe_cancellation_deliveries', 'DELETE') AS delete`;
        expect(privileges).toEqual([{ execute: false, select: false, delete: false }]);
      });
      const publicDefinerGrants = await admin.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef AND EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')`;
      expect(Number(publicDefinerGrants[0]?.count ?? 0)).toBe(0);
    } finally {
      await issuer.$disconnect();
      await admin.$disconnect();
      await database.$disconnect();
    }
  });
});
