import { createHash } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { createProductionStripeAlertAdapters } from '@/lib/billing/stripe-alert-delivery';

const originalEnv = {
  STRIPE_ALERT_DELIVERY_TOKEN: process.env.STRIPE_ALERT_DELIVERY_TOKEN,
  STRIPE_CIRCUIT_ENDPOINT: process.env.STRIPE_CIRCUIT_ENDPOINT,
  STRIPE_PAGE_ENDPOINT: process.env.STRIPE_PAGE_ENDPOINT,
};

const pageBytes = JSON.stringify({ action: 'page', alert: { alert_key: 'alert-1', count: 4, reason: 'rate exceeded' } });
const circuitBytes = JSON.stringify({ action: 'open', reason: 'rate exceeded', alert: { alert_key: 'alert-1', count: 4, reason: 'rate exceeded' } });
const digestOf = (bytes: string) => createHash('sha256').update(Buffer.from(bytes, 'utf8')).digest('hex');

beforeEach(() => {
  process.env.STRIPE_ALERT_DELIVERY_TOKEN = 'alert-token';
  process.env.STRIPE_CIRCUIT_ENDPOINT = 'https://alerts.example.test/circuit';
  process.env.STRIPE_PAGE_ENDPOINT = 'https://alerts.example.test/page';
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Stripe alert delivery', () => {
  it('sends the persisted bytes verbatim with a digest header covering exactly those bytes', async () => {
    let sent: { body: string; digest: string | undefined; version: string | undefined; idempotency: string | undefined } | undefined;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = init?.headers as Record<string, string>;
      sent = { body: Buffer.from(init?.body as Buffer).toString('utf8'), digest: headers['X-Sploot-Payload-Digest'], version: headers['X-Sploot-Payload-Version'], idempotency: headers['Idempotency-Key'] };
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const adapters = createProductionStripeAlertAdapters({ fetchImpl: fetchMock });
    await adapters.circuit.open(circuitBytes, 'delivery-key', digestOf(circuitBytes), 'stripe-cancellation-http-v1');
    expect(sent?.body).toBe(circuitBytes);
    expect(sent?.digest).toBe(digestOf(circuitBytes));
    expect(sent?.version).toBe('stripe-cancellation-http-v1');
    expect(sent?.idempotency).toBe('delivery-key');
    expect(JSON.parse(sent!.body)).toMatchObject({ action: 'open', reason: 'rate exceeded' });
  });

  it('refuses to send bytes that do not match the persisted digest', async () => {
    const fetchMock = vi.fn();
    const adapters = createProductionStripeAlertAdapters({ fetchImpl: fetchMock });
    await expect(adapters.page.page(pageBytes, 'delivery-key', 'a'.repeat(64), 'stripe-cancellation-http-v1')).rejects.toThrow(/do not match their persisted digest/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pins redirect:error and refuses redirect responses that escape the endpoint target', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(init?.redirect).toBe('error');
      const response = new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } });
      Object.defineProperty(response, 'url', { value: 'https://evil.example.test/page' });
      return response;
    });
    const adapters = createProductionStripeAlertAdapters({ fetchImpl: fetchMock });
    await expect(adapters.page.page(pageBytes, 'delivery-key', digestOf(pageBytes), 'stripe-cancellation-http-v1')).rejects.toThrow(/egress target/i);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejected redirect:error failures stay bounded and do not require a live Location hop', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(init?.redirect).toBe('error');
      throw Object.assign(new TypeError('redirect rejected by redirect:error'), { cause: { code: 'UND_ERR_REDIRECT', location: 'https://evil.example.test/hop' } });
    });
    const adapters = createProductionStripeAlertAdapters({ fetchImpl: fetchMock });
    await expect(adapters.circuit.open(circuitBytes, 'delivery-key', digestOf(circuitBytes), 'stripe-cancellation-http-v1')).rejects.toThrow(/redirect/i);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('refuses a response that advertises a malicious Location hop', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(init?.redirect).toBe('error');
      return new Response('', { status: 302, headers: { Location: 'https://evil.example.test/hop' } });
    });
    const adapters = createProductionStripeAlertAdapters({ fetchImpl: fetchMock });
    await expect(adapters.page.page(pageBytes, 'delivery-key', digestOf(pageBytes), 'stripe-cancellation-http-v1')).rejects.toThrow(/HTTP 302/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
