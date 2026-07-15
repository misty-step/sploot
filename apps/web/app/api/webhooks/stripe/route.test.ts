import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verify, consume, logError } = vi.hoisted(() => ({ verify: vi.fn(), consume: vi.fn(), logError: vi.fn() }));

vi.mock('@/lib/with-observability', () => ({ withObservability: (handler: unknown) => handler }));
vi.mock('@/lib/billing/stripe-alert-delivery', () => ({ createProductionStripeAlertAdapters: vi.fn(() => ({ circuit: { open: vi.fn() }, page: { page: vi.fn() } })) }));
vi.mock('@/lib/billing/stripe-cancellation-monitor', () => ({ createProductionSubscriptionCancellationMonitor: vi.fn(() => ({})) }));
vi.mock('@/lib/billing/stripe-webhook', () => ({
  STRIPE_WEBHOOK_MAX_BODY_BYTES: 2_000_000,
  StripeWebhookVerificationError: class StripeWebhookVerificationError extends Error {},
  createStripeSignatureVerifierFromEnv: vi.fn(() => ({ verify })),
  consumeStripeWebhook: consume,
}));
vi.mock('@/lib/observability-logger', () => ({ logger: { logError } }));

import { POST } from './route';

describe('Stripe webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SIGNING_SECRET = 'whsec_test';
    process.env.STRIPE_WEBHOOK_RAW_BODY_KEY = '11'.repeat(32);
    process.env.STRIPE_CANCELLATION_MAX = '3';
    process.env.STRIPE_CANCELLATION_WINDOW_SECONDS = '300';
  });

  it('passes exact raw bytes and returns 2xx for a signed irrelevant event', async () => {
    const raw = '{"type":"invoice.paid","data":{"object":{"id":"in_1"}}}';
    consume.mockResolvedValue({ handled: true, ignored: true });
    const request = new Request('http://localhost/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=verified' }, body: raw }) as unknown as NextRequest;
    const response = await POST(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect(consume).toHaveBeenCalledWith(expect.any(Uint8Array), 't=1,v1=verified', expect.objectContaining({ verify }), expect.anything());
    expect(Buffer.from(consume.mock.calls[0][0]).toString()).toBe(raw);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('maps verifier failures to 400 without treating them as delivery failures', async () => {
    const { StripeWebhookVerificationError } = await import('@/lib/billing/stripe-webhook');
    consume.mockRejectedValue(new StripeWebhookVerificationError('bad signature'));
    const response = await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: '{}' }) as unknown as NextRequest, { params: Promise.resolve({}) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'invalid_webhook' });
    expect(JSON.stringify(logError.mock.calls)).not.toContain('bad signature');
  });

  it('refuses an unsigned request at the route boundary', async () => {
    consume.mockRejectedValue(new Error('Stripe webhook signature is required'));
    const response = await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: '{}' }) as unknown as NextRequest, { params: Promise.resolve({}) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'invalid_webhook' });
  });

  it('rejects an oversized declared body without reading its stream', async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1));
      },
    });
    const request = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=oversized', 'content-length': '2000001' },
      body,
      duplex: 'half',
    } as RequestInit) as unknown as NextRequest;

    const response = await POST(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'invalid_webhook' });
    expect(pulls).toBeLessThanOrEqual(1); // Request construction may perform one eager pull.
    expect(request.body?.locked).toBe(false);
    expect(consume).not.toHaveBeenCalled();
  });

  it('stops reading a chunked body as soon as the bounded limit is crossed', async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1_000_001));
      },
    });
    const request = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=oversized' },
      body,
      duplex: 'half',
    } as RequestInit) as unknown as NextRequest;

    const response = await POST(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'invalid_webhook' });
    expect(pulls).toBe(2);
    expect(consume).not.toHaveBeenCalled();
  });

  it.each([
    'SECRET_CONFIG_DATABASE_URL=postgres://attacker:secret@example.test/db',
    'provider token SECRET_ADAPTER_TOKEN=shh',
    'password=SECRET_DB_PASSWORD raw connection failure',
  ])('does not expose signed-path internal failures: %s', async (secretMessage) => {
    consume.mockRejectedValue(new Error(secretMessage));
    const response = await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 'verified' }, body: '{}' }) as unknown as NextRequest, { params: Promise.resolve({}) });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ ok: false, error: 'temporarily_unavailable' });
    expect(JSON.stringify(body)).not.toContain(secretMessage);
    expect(JSON.stringify(logError.mock.calls)).not.toContain(secretMessage);
    expect(JSON.stringify(logError.mock.calls)).toContain('stripe_webhook_processing_failed');
  });

  it('does not serialize signed cancellation identifiers, alert state, or adapter details', async () => {
    const secret = 'SECRET_ADAPTER_EXCEPTION';
    consume.mockResolvedValue({
      handled: true,
      observation: { count: 99, operationalStatus: 'delivery-failed', retryable: true, outcomes: [{ adapter: 'page', status: 'failed', retryable: true, error: secret }], alert: { alertKey: 'alert-secret', eventIds: ['evt-secret'], count: 99 } },
      alert: { alertKey: 'alert-secret', eventIds: ['evt-secret'] },
    });
    const response = await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 'verified' }, body: '{}' }) as unknown as NextRequest, { params: Promise.resolve({}) });
    expect(response.status).toBe(503);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toBe(JSON.stringify({ ok: false, error: 'temporarily_unavailable' }));
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('alert-secret');
    expect(serialized).not.toContain('evt-secret');
  });
});
