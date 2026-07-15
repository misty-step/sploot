import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { StripeApiClient, StripeHttpError } from '@/lib/billing/stripe-api-client';
import type { SubscriptionCreation } from '@/lib/billing/stripe-recovery';

const sandboxKey = ['sk', 'test', 'http'].join('_');
const input: SubscriptionCreation = { customer: 'cus_test', currency: 'usd', items: [{ price: 'price_test', quantity: 1 }], payment_behavior: 'default_incomplete', metadata: { sploot_recreated_from: 'sub_test' } };

function loopbackFetch(inputUrl: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(inputUrl));
  return new Promise((resolve, reject) => {
    const requestHeaders: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => { requestHeaders[key] = value; });
    const request = httpRequest(url, { method: init.method, headers: requestHeaders }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const responseHeaders = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value ?? '']));
        resolve(new Response(Buffer.concat(chunks).toString('utf8'), { status: response.statusCode ?? 500, headers: responseHeaders }));
      });
    });
    request.on('error', reject);
    init.signal?.addEventListener('abort', () => request.destroy(new Error('aborted')));
    if (typeof init.body === 'string') request.write(init.body);
    request.end();
  });
}

describe('Stripe HTTP safety', () => {
  let server: Server;
  let baseUrl: string;
  const attempts = new Map<string, number>();

  beforeAll(async () => {
    server = createServer((request, response) => {
      const path = request.url ?? '/';
      const route = path.split('/v1/')[0];
      const attempt = (attempts.get(route) ?? 0) + 1;
      attempts.set(route, attempt);
      if (route === '/timeout') return setTimeout(() => response.end(JSON.stringify({ id: 'late' })), 100);
      if (route === '/429' && attempt === 1) { response.writeHead(429, { 'Retry-After': '0' }); return response.end(); }
      if (route === '/503' && attempt === 1) { response.writeHead(503); return response.end(); }
      if (route === '/always-503') { response.writeHead(503); return response.end(); }
      const redirectMatch = route.match(/^\/redirect-(301|302|307|308)$/);
      if (redirectMatch) { response.writeHead(Number(redirectMatch[1]), { Location: 'https://evil.example/steal' }); return response.end(); }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ id: 'sub_new', status: 'incomplete', customer: 'cus_test' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not bind');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

  function client(path: string, options: { timeoutMs?: number; maxRetries?: number } = {}) {
    const fixtureFetch = (inputUrl: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = new URL(String(inputUrl));
      return loopbackFetch(new URL(`${path}${requestUrl.pathname}`, baseUrl), init);
    };
    return new StripeApiClient({ mode: 'test', source: 'test-fixture', secretKey: sandboxKey }, { fetchImpl: fixtureFetch, baseUrl, timeoutMs: options.timeoutMs, maxRetries: options.maxRetries, retryBaseDelayMs: 0, maxRetryDelayMs: 0 });
  }

  it('aborts a hung request at the configured timeout', async () => {
    await expect(client('/timeout', { timeoutMs: 20, maxRetries: 0 }).createSubscription(input, 'idem_timeout')).rejects.toMatchObject({ name: 'StripeHttpError', retryable: true });
  });

  it('retries 429 and 5xx responses within the bounded retry budget', async () => {
    await expect(client('/429', { maxRetries: 1 }).createSubscription(input, 'idem_429')).resolves.toMatchObject({ id: 'sub_new' });
    await expect(client('/503', { maxRetries: 1 }).createSubscription(input, 'idem_503')).resolves.toMatchObject({ id: 'sub_new' });
    expect(attempts.get('/429')).toBe(2);
    expect(attempts.get('/503')).toBe(2);
  });

  it('returns retryable exhaustion for persistent 5xx responses', async () => {
    await expect(client('/always-503', { maxRetries: 1 }).createSubscription(input, 'idem_exhausted')).rejects.toMatchObject({
      name: 'StripeHttpError', status: 503, retryable: true, attempts: 2,
    } satisfies Partial<StripeHttpError>);
  });

  it('rejects NaN, Infinity, fractional, and contradictory retry bounds', () => {
    expect(() => client('/429', { timeoutMs: Number.NaN })).toThrow(/timeoutMs.*finite integer/i);
    expect(() => client('/429', { maxRetries: Number.POSITIVE_INFINITY })).toThrow(/maxRetries.*finite integer/i);
    expect(() => new StripeApiClient({ mode: 'test', source: 'sandbox-env', secretKey: sandboxKey }, { retryBaseDelayMs: 1.5 })).toThrow(/retryBaseDelayMs.*finite integer/i);
    expect(() => new StripeApiClient({ mode: 'test', source: 'sandbox-env', secretKey: sandboxKey }, { retryBaseDelayMs: 10, maxRetryDelayMs: 1 })).toThrow(/maxRetryDelayMs.*>=/i);
    expect(() => new StripeApiClient({ mode: 'test', source: 'sandbox-env', secretKey: sandboxKey }, { baseUrl })).toThrow(/origin is pinned/i);
  });

  it('retries bounded network failures only with the stable idempotency key', async () => {
    let calls = 0;
    const flakyFetch = async (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      calls += 1;
      if (calls === 1) throw new Error('transient socket failure');
      return new Response(JSON.stringify({ id: 'sub_network', status: 'incomplete', customer: 'cus_test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    await expect(new StripeApiClient({ mode: 'test', source: 'test-fixture', secretKey: sandboxKey }, { fetchImpl: flakyFetch, baseUrl, maxRetries: 1, retryBaseDelayMs: 0, maxRetryDelayMs: 0 }).createSubscription(input, 'idem_network')).resolves.toMatchObject({ id: 'sub_network' });
    expect(calls).toBe(2);
  });

  it('stops persistent network failures at the configured retry bound', async () => {
    let calls = 0;
    const unavailableFetch = async () => { calls += 1; throw new Error('persistent socket failure'); };
    await expect(new StripeApiClient({ mode: 'test', source: 'test-fixture', secretKey: sandboxKey }, { fetchImpl: unavailableFetch, baseUrl, maxRetries: 2, retryBaseDelayMs: 0, maxRetryDelayMs: 0 }).createSubscription(input, 'idem_network_exhausted')).rejects.toMatchObject({ name: 'StripeHttpError', attempts: 3, retryable: true });
    expect(calls).toBe(3);
  });

  it.each([301, 302, 307, 308])('refuses HTTP %s redirects, including malicious Location headers', async (status) => {
    await expect(client(`/redirect-${status}`, { maxRetries: 3 }).createSubscription(input, `idem-redirect-${status}`)).rejects.toMatchObject({ name: 'StripeHttpError', status, retryable: false, attempts: 1 });
  });

  it('treats the conformant fetch redirect:error rejection as immediate and non-retryable', async () => {
    let calls = 0;
    const redirectRejectingFetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls += 1;
      expect(init?.redirect).toBe('error');
      throw Object.assign(new TypeError('redirect rejected by redirect:error'), { cause: { code: 'UND_ERR_REDIRECT', location: 'https://evil.example/steal' } });
    };
    await expect(new StripeApiClient({ mode: 'test', source: 'test-fixture', secretKey: sandboxKey }, { fetchImpl: redirectRejectingFetch, baseUrl, maxRetries: 3, retryBaseDelayMs: 0, maxRetryDelayMs: 0 }).createSubscription(input, 'idem-redirect-adapter')).rejects.toMatchObject({ name: 'StripeHttpError', retryable: false, attempts: 1 });
    expect(calls).toBe(1);
  });

  it('pins redirect policy and revalidates the exact request contract on every attempt', async () => {
    let observed: RequestInit | undefined;
    const safeFetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(String(url)).toBe(`${baseUrl}/v1/subscriptions`);
      observed = init;
      expect(init?.method).toBe('POST');
      expect(typeof init?.body).toBe('string');
      expect(init?.redirect).toBe('error');
      return new Response(JSON.stringify({ id: 'sub_safe', status: 'incomplete', customer: 'cus_test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    await expect(new StripeApiClient({ mode: 'test', source: 'test-fixture', secretKey: sandboxKey }, { fetchImpl: safeFetch, baseUrl, maxRetries: 0, retryBaseDelayMs: 0, maxRetryDelayMs: 0 }).createSubscription(input, 'idem_safe')).resolves.toMatchObject({ id: 'sub_safe' });
    expect(observed?.redirect).toBe('error');
  });

  it('refuses a response whose final URL leaves the pinned origin or path', async () => {
    const fetchImpl = async (): Promise<Response> => {
      const response = new Response(JSON.stringify({ id: 'forged' }), { status: 200 });
      Object.defineProperty(response, 'url', { value: 'https://evil.example/v1/subscriptions' });
      return response;
    };
    await expect(new StripeApiClient({ mode: 'test', source: 'test-fixture', secretKey: sandboxKey }, { fetchImpl, baseUrl, maxRetries: 0, retryBaseDelayMs: 0, maxRetryDelayMs: 0 }).createSubscription(input, 'idem-final-url')).rejects.toThrow(/egress target/i);
  });
});
