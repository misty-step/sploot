import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticatedUserId: 'user-1',
  getBillingPlanSnapshot: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  checkoutCreate: vi.fn(),
  customerCreate: vi.fn(),
  portalCreate: vi.fn(),
  billingConfigured: true,
  priceId: 'price_plus',
  BillingConfigurationError: class BillingConfigurationError extends Error {
    constructor(message: string, public readonly code = 'billing_not_configured') {
      super(message);
    }
  },
}));

vi.mock('next/navigation', () => ({
  unstable_rethrow: vi.fn(),
}));

vi.mock('@/lib/auth/with-authenticated-api', () => ({
  withAuthenticatedApi: (handler: any) => async (req: any, context: any = {}) => {
    if (!mocks.authenticatedUserId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return handler(req, context, {
      principal: { userId: mocks.authenticatedUserId },
      auth: { status: 'authenticated' },
    });
  },
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

vi.mock('@/lib/vercel-logger', () => ({
  logError: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}));

vi.mock('@/lib/billing/subscription-sync', () => ({
  getBillingPlanSnapshot: mocks.getBillingPlanSnapshot,
}));

vi.mock('@/lib/billing/stripe', () => ({
  BillingConfigurationError: mocks.BillingConfigurationError,
  getStripe: () => {
    if (!mocks.billingConfigured) {
      throw new mocks.BillingConfigurationError('STRIPE_SECRET_KEY is not configured');
    }

    return {
      customers: { create: mocks.customerCreate },
      checkout: { sessions: { create: mocks.checkoutCreate } },
      billingPortal: { sessions: { create: mocks.portalCreate } },
    };
  },
  requireStripePriceForPlan: () => {
    if (!mocks.priceId) {
      throw new mocks.BillingConfigurationError('STRIPE_PRICE_ID_PLUS is not configured');
    }
    return mocks.priceId;
  },
}));

import { GET } from '@/app/api/billing/route';
import { POST as CHECKOUT_POST } from '@/app/api/billing/checkout/route';
import { POST as PORTAL_POST } from '@/app/api/billing/portal/route';

function request(path: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'content-type': 'application/json' } : undefined,
  });
}

describe('billing API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatedUserId = 'user-1';
    mocks.billingConfigured = true;
    mocks.priceId = 'price_plus';
    mocks.getBillingPlanSnapshot.mockResolvedValue({
      plan: 'free',
      limitBytes: 1024 * 1024 * 1024,
      billingStatus: 'none',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      billingCurrentPeriodEnd: null,
    });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      stripeCustomerId: null,
    });
    mocks.prisma.user.update.mockResolvedValue({});
    mocks.customerCreate.mockResolvedValue({ id: 'cus_1' });
    mocks.checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
    mocks.portalCreate.mockResolvedValue({ url: 'https://billing.stripe.test/session' });
  });

  it('returns current billing state and storage plans', async () => {
    const response = await GET(request('/api/billing'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.current.plan).toBe('free');
    expect(body.plans.map((plan: any) => plan.id)).toEqual(['free', 'plus', 'max']);
    expect(body.plans.find((plan: any) => plan.id === 'plus')).toMatchObject({
      priceUsd: 5,
      limitLabel: '20 GB',
    });
  });

  it('rejects invalid checkout plans before creating Stripe sessions', async () => {
    const response = await CHECKOUT_POST(request('/api/billing/checkout', { planId: 'free' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid storage plan');
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('returns a typed 503 when Stripe checkout is not configured', async () => {
    mocks.billingConfigured = false;

    const response = await CHECKOUT_POST(request('/api/billing/checkout', { planId: 'plus' }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      code: 'billing_not_configured',
      retryable: false,
    });
  });

  it('rejects checkout for users with an active subscription', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      stripeCustomerId: 'cus_1',
    });
    mocks.getBillingPlanSnapshot.mockResolvedValue({
      plan: 'plus',
      limitBytes: 20 * 1024 * 1024 * 1024,
      billingStatus: 'active',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      stripePriceId: 'price_plus',
      billingCurrentPeriodEnd: null,
    });

    const response = await CHECKOUT_POST(request('/api/billing/checkout', { planId: 'max' }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('billing_subscription_exists');
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('creates a Stripe customer and subscription checkout session', async () => {
    const response = await CHECKOUT_POST(request('/api/billing/checkout', { planId: 'plus' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.test/session');
    expect(mocks.customerCreate).toHaveBeenCalledWith({
      email: 'user@example.com',
      metadata: { userId: 'user-1' },
    });
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { stripeCustomerId: 'cus_1' },
    });
    expect(mocks.checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      customer: 'cus_1',
      line_items: [{ price: 'price_plus', quantity: 1 }],
      success_url: 'http://localhost:3000/app/settings?billing=success',
      cancel_url: 'http://localhost:3000/app/settings?billing=cancelled',
    }));
  });

  it('requires an existing billing customer before opening the portal', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ stripeCustomerId: null });

    const response = await PORTAL_POST(request('/api/billing/portal', {}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('billing_customer_missing');
    expect(mocks.portalCreate).not.toHaveBeenCalled();
  });

  it('creates a Stripe billing portal session for paying users', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' });

    const response = await PORTAL_POST(request('/api/billing/portal', {}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://billing.stripe.test/session');
    expect(mocks.portalCreate).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'http://localhost:3000/app/settings?billing=portal',
    });
  });
});
