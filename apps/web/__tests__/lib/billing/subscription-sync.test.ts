import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    userStorageQuota: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(tx)),
  };

  return { prisma, tx };
});

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}));

import {
  applyStripeSubscription,
  getBillingPlanSnapshot,
  resetBillingForCustomer,
} from '@/lib/billing/subscription-sync';

const GIB = 1024 * 1024 * 1024;

describe('billing subscription sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_ID_PLUS = 'price_plus';
    process.env.STRIPE_PRICE_ID_MAX = 'price_max';
  });

  it('returns free billing state when the user has no stored plan', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);

    await expect(getBillingPlanSnapshot('user-1')).resolves.toMatchObject({
      plan: 'free',
      limitBytes: GIB,
      billingStatus: 'none',
    });
  });

  it('maps an active Stripe subscription to a paid plan and quota', async () => {
    mocks.tx.user.findFirst.mockResolvedValue({ id: 'user-1' });
    const currentPeriodEnd = 1_782_259_200;

    await applyStripeSubscription({
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      items: {
        data: [
          {
            price: { id: 'price_plus' },
            current_period_end: currentPeriodEnd,
          },
        ],
      },
    } as any);

    expect(mocks.tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        plan: 'plus',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        stripePriceId: 'price_plus',
        billingStatus: 'active',
        billingCurrentPeriodEnd: new Date(currentPeriodEnd * 1000),
      },
    });
    expect(mocks.tx.userStorageQuota.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: { limitBytes: BigInt(20 * GIB) },
      create: {
        userId: 'user-1',
        limitBytes: BigInt(20 * GIB),
      },
    });
  });

  it('downgrades canceled subscriptions to free quota', async () => {
    mocks.tx.user.findFirst.mockResolvedValue({ id: 'user-1' });

    await applyStripeSubscription({
      id: 'sub_1',
      customer: 'cus_1',
      status: 'canceled',
      items: {
        data: [{ price: { id: 'price_plus' } }],
      },
    } as any);

    expect(mocks.tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        plan: 'free',
        billingStatus: 'canceled',
      }),
    });
    expect(mocks.tx.userStorageQuota.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: { limitBytes: BigInt(GIB) },
      create: {
        userId: 'user-1',
        limitBytes: BigInt(GIB),
      },
    });
  });

  it('resets deleted Stripe customers to the free plan and quota', async () => {
    mocks.tx.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);

    await resetBillingForCustomer('cus_1');

    expect(mocks.tx.user.updateMany).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_1' },
      data: {
        plan: 'free',
        stripeSubscriptionId: null,
        stripePriceId: null,
        billingStatus: 'canceled',
        billingCurrentPeriodEnd: null,
      },
    });
    expect(mocks.tx.userStorageQuota.updateMany).toHaveBeenCalledWith({
      where: { userId: { in: ['user-1', 'user-2'] } },
      data: { limitBytes: BigInt(GIB) },
    });
  });
});
