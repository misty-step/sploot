import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { STORAGE_PLANS, planForId, planForStripePriceId, type StoragePlanId } from './plans';

const ACTIVE_BILLING_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
]);

export interface BillingPlanSnapshot {
  plan: StoragePlanId;
  limitBytes: number;
  billingStatus: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  billingCurrentPeriodEnd: Date | null;
}

export async function getBillingPlanSnapshot(userId: string): Promise<BillingPlanSnapshot> {
  if (!prisma) {
    return freeSnapshot();
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
      billingStatus: true,
      billingCurrentPeriodEnd: true,
    },
  });

  if (!user) {
    return freeSnapshot();
  }

  const plan = planForId(user.plan).id;
  return {
    plan,
    limitBytes: STORAGE_PLANS[plan].limitBytes,
    billingStatus: user.billingStatus,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    stripePriceId: user.stripePriceId,
    billingCurrentPeriodEnd: user.billingCurrentPeriodEnd,
  };
}

export async function applyStripeSubscription(subscription: Stripe.Subscription): Promise<void> {
  if (!prisma) {
    throw new Error('Database not configured');
  }

  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const nextPlan = ACTIVE_BILLING_STATUSES.has(subscription.status)
    ? planForStripePriceId(priceId)
    : 'free';
  const currentPeriodEndSeconds = subscription.items.data[0]?.current_period_end;
  const currentPeriodEnd = currentPeriodEndSeconds
    ? new Date(currentPeriodEndSeconds * 1000)
    : null;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: {
        OR: [
          { stripeCustomerId: customerId },
          { stripeSubscriptionId: subscription.id },
        ],
      },
      select: { id: true },
    });

    if (!user) {
      return;
    }

    await tx.user.update({
      where: { id: user.id },
      data: {
        plan: nextPlan,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        billingStatus: subscription.status,
        billingCurrentPeriodEnd: currentPeriodEnd,
      },
    });

    await tx.userStorageQuota.upsert({
      where: { userId: user.id },
      update: { limitBytes: BigInt(STORAGE_PLANS[nextPlan].limitBytes) },
      create: {
        userId: user.id,
        limitBytes: BigInt(STORAGE_PLANS[nextPlan].limitBytes),
      },
    });
  });
}

export async function resetBillingForCustomer(customerId: string): Promise<void> {
  if (!prisma) {
    throw new Error('Database not configured');
  }

  await prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });

    if (users.length === 0) {
      return;
    }

    await tx.user.updateMany({
      where: { stripeCustomerId: customerId },
      data: {
        plan: 'free',
        stripeSubscriptionId: null,
        stripePriceId: null,
        billingStatus: 'canceled',
        billingCurrentPeriodEnd: null,
      },
    });

    await tx.userStorageQuota.updateMany({
      where: { userId: { in: users.map((user) => user.id) } },
      data: { limitBytes: BigInt(STORAGE_PLANS.free.limitBytes) },
    });
  });
}

function freeSnapshot(): BillingPlanSnapshot {
  return {
    plan: 'free',
    limitBytes: STORAGE_PLANS.free.limitBytes,
    billingStatus: 'none',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    billingCurrentPeriodEnd: null,
  };
}
