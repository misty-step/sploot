import { createHash } from 'node:crypto';

import type { StripeCircuitAdapter, StripePageAdapter } from './stripe-cancellation-monitor';

type AlertFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function requiredHttpsEndpoint(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not configured`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an HTTPS URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${name} must be an HTTPS URL without embedded credentials`);
  return url.toString();
}

class HttpAlertDelivery {
  constructor(private readonly endpoint: string, private readonly token: string, private readonly fetchImpl: AlertFetch = fetch) {}

  /**
   * Sends the exact persisted delivery bytes verbatim. `payloadDigest` is the
   * persisted digest over exactly `payloadBytes`; it is re-verified here so a
   * mismatched digest can never be attached to different bytes, and every
   * retry of the same delivery key transmits byte-identical content.
   */
  async post(payloadBytes: string, deliveryKey: string, payloadDigest: string, payloadVersion: string): Promise<void> {
    if (!payloadBytes || !deliveryKey.trim() || !payloadDigest.trim() || !payloadVersion.trim()) throw new Error('alert delivery contract requires exact payload bytes, key, digest, and version');
    const body = Buffer.from(payloadBytes, 'utf8');
    const actualDigest = createHash('sha256').update(body).digest('hex');
    if (actualDigest !== payloadDigest) throw new Error('alert delivery payload bytes do not match their persisted digest');
    const target = new URL(this.endpoint);
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': deliveryKey, 'X-Sploot-Payload-Digest': payloadDigest, 'X-Sploot-Payload-Version': payloadVersion },
      redirect: 'error',
      body,
      signal: AbortSignal.timeout(10_000),
    });
    this.assertResponseTarget(response, target);
    if (!response.ok) throw new Error(`alert delivery failed with HTTP ${response.status}`);
  }

  private assertResponseTarget(response: Response, target: URL): void {
    if (!response.url) return;
    const url = new URL(response.url);
    if (url.origin !== target.origin || url.pathname !== target.pathname || url.search !== target.search || url.hash !== target.hash) {
      throw new Error('alert delivery response egress target refused');
    }
  }
}

export function createProductionStripeAlertAdapters(options: { fetchImpl?: AlertFetch } = {}): { circuit: StripeCircuitAdapter; page: StripePageAdapter } {
  const token = process.env.STRIPE_ALERT_DELIVERY_TOKEN;
  if (!token) throw new Error('STRIPE_ALERT_DELIVERY_TOKEN is not configured');
  const circuit = new HttpAlertDelivery(requiredHttpsEndpoint('STRIPE_CIRCUIT_ENDPOINT', process.env.STRIPE_CIRCUIT_ENDPOINT), token, options.fetchImpl);
  const page = new HttpAlertDelivery(requiredHttpsEndpoint('STRIPE_PAGE_ENDPOINT', process.env.STRIPE_PAGE_ENDPOINT), token, options.fetchImpl);
  return {
    circuit: { open: (payloadBytes: string, deliveryKey: string, payloadDigest: string, payloadVersion: string) => circuit.post(payloadBytes, deliveryKey, payloadDigest, payloadVersion) },
    page: { page: (payloadBytes: string, deliveryKey: string, payloadDigest: string, payloadVersion: string) => page.post(payloadBytes, deliveryKey, payloadDigest, payloadVersion) },
  };
}
