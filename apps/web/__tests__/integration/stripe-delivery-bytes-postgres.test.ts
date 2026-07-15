/**
 * Exact-byte delivery proof over the real composition: real HMAC verifier,
 * real Postgres ledger (issuer-role SECURITY DEFINER functions), and the real
 * production HTTP alert adapters with only the network fetch injected.
 *
 * Proves the stop-ship contract: X-Sploot-Payload-Digest covers the exact
 * serialized HTTP wrapper bytes that are sent ({"action":"open",...} /
 * {"action":"page",...}), those bytes are persisted once at breach time, and
 * a retry after a failed attempt transmits byte-identical content.
 */
import { PrismaClient } from '@prisma/client';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaStripeCancellationLedger } from '@/lib/billing/stripe-cancellation-ledger';
import { SubscriptionCancellationMonitor } from '@/lib/billing/stripe-cancellation-monitor';
import { createProductionStripeAlertAdapters } from '@/lib/billing/stripe-alert-delivery';
import { CANCELLATION_RATE_REASON, DELIVERY_PAYLOAD_VERSION } from '@/lib/billing/stripe-delivery-contract';
import { StripeSignatureVerifier } from '@/lib/billing/stripe-webhook';
import { consumeStripeWebhook } from '@/lib/billing/stripe-webhook';

const hasDatabase = Boolean(
  process.env.DATABASE_URL &&
  process.env.STRIPE_LEDGER_ISSUER_DATABASE_URL &&
  process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL,
);
const describeWithDatabase = hasDatabase ? describe.sequential : describe.skip;

const SIGNING_SECRET = 'whsec_delivery_bytes_fixture';

type Capture = { endpoint: string; body: string; digest: string | undefined; version: string | undefined; idempotencyKey: string | undefined };

describeWithDatabase('Stripe alert delivery exact HTTP bytes against Postgres', () => {
  let admin: PrismaClient;
  let issuer: PrismaClient;
  const savedEnv: Record<string, string | undefined> = {};
  const managedEnv: Record<string, string> = {
    STRIPE_ALERT_DELIVERY_TOKEN: 'delivery-bytes-token',
    STRIPE_CIRCUIT_ENDPOINT: 'https://alerts.example.test/circuit',
    STRIPE_PAGE_ENDPOINT: 'https://alerts.example.test/page',
  };

  beforeAll(() => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL! } } });
    issuer = new PrismaClient({ datasources: { db: { url: process.env.STRIPE_LEDGER_ISSUER_DATABASE_URL! } } });
    for (const [key, value] of Object.entries(managedEnv)) {
      savedEnv[key] = process.env[key];
      process.env[key] = value;
    }
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await issuer.$disconnect();
    await admin.$disconnect();
  });

  it('digests, persists, and retries the exact serialized wrapper bytes', async () => {
    const now = Math.floor(Date.now() / 1000);
    const observeNow = now + 2;
    const windowSeconds = 300;
    const expectedAlertKey = `stripe-cancellation:${Math.floor(observeNow / windowSeconds) * windowSeconds}:${windowSeconds}`;
    // Local reruns inside the same window would otherwise see already
    // delivered rows; deliveries/alerts are operational (non-append-only).
    await admin.stripeCancellationDelivery.deleteMany({ where: { alertKey: expectedAlertKey } });
    await admin.stripeCancellationAlert.deleteMany({ where: { alertKey: expectedAlertKey } });

    const captures: Capture[] = [];
    const statuses: number[] = [500, 500, 200, 200];
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = init?.headers as Record<string, string>;
      captures.push({
        endpoint: String(url),
        body: Buffer.from(init?.body as Buffer).toString('utf8'),
        digest: headers['X-Sploot-Payload-Digest'],
        version: headers['X-Sploot-Payload-Version'],
        idempotencyKey: headers['Idempotency-Key'],
      });
      return new Response('{}', { status: statuses.shift() ?? 200, headers: { 'Content-Type': 'application/json' } });
    };
    const adapters = createProductionStripeAlertAdapters({ fetchImpl });
    const ledger = new PrismaStripeCancellationLedger(issuer);
    const monitor = new SubscriptionCancellationMonitor({
      maxCancellations: 0,
      windowSeconds,
      clock: () => observeNow,
      ledger,
      ...adapters,
    });

    const eventId = `evt_bytes_${randomUUID().slice(0, 12)}`;
    const rawBody = JSON.stringify({
      id: eventId,
      type: 'customer.subscription.deleted',
      created: now,
      livemode: false,
      account: null,
      data: { object: { id: `sub_${eventId}`, object: 'subscription' } },
    });
    const signature = `t=${now},v1=${createHmac('sha256', SIGNING_SECRET).update(Buffer.concat([Buffer.from(`${now}.`), Buffer.from(rawBody)])).digest('hex')}`;
    const verifier = new StripeSignatureVerifier(SIGNING_SECRET, 300, () => now);

    // First attempt: both adapters fail with HTTP 500 after transmitting.
    const first = await consumeStripeWebhook(new TextEncoder().encode(rawBody), signature, verifier, monitor);
    expect(first.observation?.operationalStatus).toBe('delivery-failed');
    expect(first.observation?.retryable).toBe(true);
    expect(captures).toHaveLength(2);

    // Retry after backoff: claim the pending rows again and deliver.
    const retryClaims = await ledger.claimDeliveries(expectedAlertKey, now + 400, 60, `retry-${randomUUID().slice(0, 8)}`);
    expect(retryClaims).toHaveLength(2);
    for (const claim of retryClaims) {
      if (claim.adapter === 'circuit') await adapters.circuit.open(claim.payloadBytes, claim.deliveryKey, claim.payloadDigest, claim.payloadVersion);
      else await adapters.page.page(claim.payloadBytes, claim.deliveryKey, claim.payloadDigest, claim.payloadVersion);
      expect(await ledger.completeDelivery(claim, { succeeded: true }, now + 400)).toBe(true);
    }
    expect(captures).toHaveLength(4);

    const byEndpoint = (endpoint: string) => captures.filter((capture) => capture.endpoint.includes(endpoint));
    const circuitAttempts = byEndpoint('/circuit');
    const pageAttempts = byEndpoint('/page');
    expect(circuitAttempts).toHaveLength(2);
    expect(pageAttempts).toHaveLength(2);

    // Byte-identical retries.
    expect(circuitAttempts[1].body).toBe(circuitAttempts[0].body);
    expect(pageAttempts[1].body).toBe(pageAttempts[0].body);

    // The digest header covers exactly the sent bytes — the full wrapper,
    // not just the inner alert payload.
    for (const capture of captures) {
      expect(capture.digest).toBe(createHash('sha256').update(Buffer.from(capture.body, 'utf8')).digest('hex'));
      expect(capture.version).toBe(DELIVERY_PAYLOAD_VERSION);
    }

    // Exact wrapper shapes on the wire.
    const circuitWire = JSON.parse(circuitAttempts[0].body) as { action: string; reason: string; alert: Record<string, unknown> };
    expect(circuitWire.action).toBe('open');
    expect(circuitWire.reason).toBe(CANCELLATION_RATE_REASON);
    expect(Object.keys(circuitWire).sort()).toEqual(['action', 'alert', 'reason']);
    expect(circuitWire.alert.alert_key).toBe(expectedAlertKey);
    expect(circuitWire.alert.reason).toBe(CANCELLATION_RATE_REASON);
    const pageWire = JSON.parse(pageAttempts[0].body) as { action: string; alert: Record<string, unknown> };
    expect(pageWire.action).toBe('page');
    expect(Object.keys(pageWire).sort()).toEqual(['action', 'alert']);
    expect(pageWire.alert.alert_key).toBe(expectedAlertKey);

    // Persisted bytes are the authority: DB digest matches the header digest
    // and the stored payload_bytes are exactly what was transmitted.
    const rows = await admin.stripeCancellationDelivery.findMany({ where: { alertKey: expectedAlertKey } });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const attempts = row.adapter === 'circuit' ? circuitAttempts : pageAttempts;
      expect(row.payloadBytes).toBe(attempts[0].body);
      expect(row.payloadDigest).toBe(createHash('sha256').update(Buffer.from(row.payloadBytes, 'utf8')).digest('hex'));
      expect(row.payloadVersion).toBe(DELIVERY_PAYLOAD_VERSION);
      expect(row.status).toBe('delivered');
    }
  });
});
