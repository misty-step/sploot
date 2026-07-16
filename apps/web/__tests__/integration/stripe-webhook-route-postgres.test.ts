/**
 * Real composition acceptance for the Stripe webhook boundary: the actual
 * Next.js route handler, the actual HMAC signature verifier, and the actual
 * Postgres-backed ledger (SECURITY DEFINER functions via the issuer role).
 * Nothing on the verifier→DB→route seam is mocked.
 *
 * Proves the stop-ship retry contract: a legitimate Stripe retry carries a
 * fresh timestamp and signature header over identical raw body bytes, and
 * must be accepted (deduplicated), while a replay of the same event ID with
 * different bytes must be refused.
 */
import { PrismaClient } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDatabase = Boolean(
  process.env.DATABASE_URL &&
  process.env.STRIPE_LEDGER_ISSUER_DATABASE_URL &&
  process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL,
);
const describeWithDatabase = hasDatabase ? describe.sequential : describe.skip;

const SIGNING_SECRET = 'whsec_route_composition_fixture';

function stripeSignature(rawBody: string, timestamp: number): string {
  const digest = createHmac('sha256', SIGNING_SECRET).update(Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(rawBody)])).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

function webhookRequest(rawBody: string, signature: string): NextRequest {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    body: rawBody,
  }) as unknown as NextRequest;
}

describeWithDatabase('Stripe webhook route with real verifier and Postgres ledger', () => {
  let admin: PrismaClient;
  const savedEnv: Record<string, string | undefined> = {};
  const managedEnv: Record<string, string> = {
    STRIPE_WEBHOOK_SIGNING_SECRET: SIGNING_SECRET,
    STRIPE_WEBHOOK_RAW_BODY_KEY: '22'.repeat(32),
    STRIPE_ALERT_DELIVERY_TOKEN: 'route-composition-alert-token',
    STRIPE_CIRCUIT_ENDPOINT: 'https://alerts.invalid.test/circuit',
    STRIPE_PAGE_ENDPOINT: 'https://alerts.invalid.test/page',
    // High threshold: this suite proves ingestion/idempotency, not breach
    // delivery, so no alert egress is attempted.
    STRIPE_CANCELLATION_MAX: '100000',
    STRIPE_CANCELLATION_WINDOW_SECONDS: '300',
  };

  beforeAll(() => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL! } } });
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
    await admin.$disconnect();
  });

  it('accepts a legitimate retry with a fresh timestamp/signature over identical bytes and records signature audit separately', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const eventId = `evt_route_retry_${randomUUID().slice(0, 12)}`;
    const created = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify({
      id: eventId,
      type: 'customer.subscription.deleted',
      created,
      livemode: false,
      account: null,
      data: { object: { id: `sub_${eventId}`, object: 'subscription' } },
    });

    const firstTimestamp = Math.floor(Date.now() / 1000);
    const firstSignature = stripeSignature(rawBody, firstTimestamp);
    const firstResponse = await POST(webhookRequest(rawBody, firstSignature), { params: Promise.resolve({}) });
    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toEqual({ ok: true });

    // Stripe retry: identical raw bytes, fresh timestamp, fresh signature.
    const retryTimestamp = firstTimestamp + 45;
    const retrySignature = stripeSignature(rawBody, retryTimestamp);
    expect(retrySignature).not.toBe(firstSignature);
    const retryResponse = await POST(webhookRequest(rawBody, retrySignature), { params: Promise.resolve({}) });
    expect(retryResponse.status).toBe(200);
    await expect(retryResponse.json()).resolves.toEqual({ ok: true });

    const events = await admin.stripeCancellationEvent.findMany({ where: { eventId } });
    expect(events).toHaveLength(1);
    const recorded = await admin.stripeCancellationAudit.findMany({ where: { eventId, action: 'event-recorded' } });
    const deduplicated = await admin.stripeCancellationAudit.findMany({ where: { eventId, action: 'event-deduplicated' } });
    expect(recorded).toHaveLength(1);
    expect(deduplicated).toHaveLength(1);
    const dedupDetails = deduplicated[0].details as Record<string, unknown>;
    expect(dedupDetails.signature_header_changed).toBe(true);
    expect(dedupDetails.stored_signature_header_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(dedupDetails.retry_signature_header_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(dedupDetails.retry_signature_header_digest).not.toBe(dedupDetails.stored_signature_header_digest);
    expect(dedupDetails.retry_signature_timestamp).toBe(retryTimestamp);
  });

  it('refuses a validly signed replay of the same event ID with different bytes', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const eventId = `evt_route_forge_${randomUUID().slice(0, 12)}`;
    const created = Math.floor(Date.now() / 1000);
    const bodyFor = (objectId: string) => JSON.stringify({
      id: eventId,
      type: 'customer.subscription.deleted',
      created,
      livemode: false,
      account: null,
      data: { object: { id: objectId, object: 'subscription' } },
    });
    const timestamp = Math.floor(Date.now() / 1000);

    const original = await POST(webhookRequest(bodyFor('sub_original'), stripeSignature(bodyFor('sub_original'), timestamp)), { params: Promise.resolve({}) });
    expect(original.status).toBe(200);

    const forged = await POST(webhookRequest(bodyFor('sub_forged'), stripeSignature(bodyFor('sub_forged'), timestamp + 5)), { params: Promise.resolve({}) });
    expect(forged.status).toBe(503);
    await expect(forged.json()).resolves.toEqual({ ok: false, error: 'temporarily_unavailable' });

    const events = await admin.stripeCancellationEvent.findMany({ where: { eventId } });
    expect(events).toHaveLength(1);
    expect(events[0].objectId).toBe('sub_original');
  });

  it('refuses an invalid signature at the real verifier without touching the ledger', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const eventId = `evt_route_badsig_${randomUUID().slice(0, 12)}`;
    const rawBody = JSON.stringify({
      id: eventId,
      type: 'customer.subscription.deleted',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      account: null,
      data: { object: { id: `sub_${eventId}`, object: 'subscription' } },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await POST(webhookRequest(rawBody, `t=${timestamp},v1=${'0'.repeat(64)}`), { params: Promise.resolve({}) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'invalid_webhook' });
    expect(await admin.stripeCancellationEvent.count({ where: { eventId } })).toBe(0);
  });

  it('reuses one bounded issuer pool across concurrent production-shaped webhook requests', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const countIssuerConnections = async () => {
      const rows = await admin.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM pg_stat_activity
        WHERE usename = 'sploot_stripe_ledger_issuer'
      `;
      return Number(rows[0]?.count ?? 0);
    };
    const baseline = await countIssuerConnections();
    const created = Math.floor(Date.now() / 1000);

    const requests = Array.from({ length: 20 }, (_, index) => {
      const eventId = `evt_route_pool_${randomUUID().slice(0, 12)}`;
      const rawBody = JSON.stringify({
        id: eventId,
        type: 'invoice.paid',
        created,
        livemode: false,
        account: null,
        data: { object: { id: `in_${eventId}`, object: 'invoice' } },
      });
      return POST(webhookRequest(rawBody, stripeSignature(rawBody, created + index)), { params: Promise.resolve({}) });
    });
    const responses = await Promise.all(requests);
    for (const response of responses) {
      expect(response.status).toBe(200);
    }

    expect(await countIssuerConnections()).toBeLessThanOrEqual(baseline + 1);
  });
});
