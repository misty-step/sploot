import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieveSubscription: vi.fn(),
  applyStripeSubscription: vi.fn(),
  resetBillingForCustomer: vi.fn(),
  updateMany: vi.fn(),
  webhookSecret: 'whsec_test',
  BillingConfigurationError: class BillingConfigurationError extends Error {
    constructor(message: string, public readonly code = 'billing_not_configured') {
      super(message);
    }
  },
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

vi.mock('@/lib/vercel-logger', () => ({
  logError: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock('@/lib/billing/stripe', () => ({
  BillingConfigurationError: mocks.BillingConfigurationError,
  getStripe: () => ({
    webhooks: { constructEvent: mocks.constructEvent },
    subscriptions: { retrieve: mocks.retrieveSubscription },
  }),
  getStripeWebhookSecret: () => mocks.webhookSecret,
}));

vi.mock('@/lib/billing/subscription-sync', () => ({
  applyStripeSubscription: mocks.applyStripeSubscription,
  resetBillingForCustomer: mocks.resetBillingForCustomer,
}));

import { POST } from '@/app/api/billing/webhook/route';

function webhookRequest(body = '{}', signature?: string) {
  return new NextRequest('http://localhost:3000/api/billing/webhook', {
    method: 'POST',
    body,
    headers: signature ? { 'stripe-signature': signature } : undefined,
  });
}

describe('billing webhook API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.webhookSecret = 'whsec_test';
    mocks.retrieveSubscription.mockResolvedValue({ id: 'sub_1' });
  });

  it('rejects unsigned webhook requests', async () => {
    const response = await POST(webhookRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('invalid_signature');
    expect(mocks.constructEvent).not.toHaveBeenCalled();
  });

  it('verifies the raw body and syncs checkout subscription state', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          subscription: 'sub_1',
          customer: 'cus_1',
          metadata: { userId: 'user-1' },
          client_reference_id: null,
        },
      },
    });
    mocks.retrieveSubscription.mockResolvedValue({ id: 'sub_1', status: 'active' });

    const response = await POST(webhookRequest('{"id":"evt_1"}', 'sig_test'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(mocks.constructEvent).toHaveBeenCalledWith('{"id":"evt_1"}', 'sig_test', 'whsec_test');
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { stripeCustomerId: 'cus_1' },
    });
    expect(mocks.retrieveSubscription).toHaveBeenCalledWith('sub_1');
    expect(mocks.applyStripeSubscription).toHaveBeenCalledWith({ id: 'sub_1', status: 'active' });
  });

  it('applies subscription update events', async () => {
    const subscription = { id: 'sub_1', customer: 'cus_1', status: 'past_due' };
    mocks.constructEvent.mockReturnValue({
      id: 'evt_2',
      type: 'customer.subscription.updated',
      data: { object: subscription },
    });

    const response = await POST(webhookRequest('{"id":"evt_2"}', 'sig_test'));

    expect(response.status).toBe(200);
    expect(mocks.applyStripeSubscription).toHaveBeenCalledWith(subscription);
  });

  it('resets deleted Stripe customers', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_3',
      type: 'customer.deleted',
      data: { object: { id: 'cus_1' } },
    });

    const response = await POST(webhookRequest('{"id":"evt_3"}', 'sig_test'));

    expect(response.status).toBe(200);
    expect(mocks.resetBillingForCustomer).toHaveBeenCalledWith('cus_1');
  });
});
