import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { BillingConfigurationError, getStripe, requireStripePriceForPlan } from '@/lib/billing/stripe';
import { PAID_STORAGE_PLANS, isStoragePlanId } from '@/lib/billing/plans';
import { getBillingPlanSnapshot } from '@/lib/billing/subscription-sync';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/vercel-logger';

const PAID_PLAN_IDS = new Set(PAID_STORAGE_PLANS.map((plan) => plan.id));
const ACTIVE_BILLING_STATUSES = new Set(['active', 'trialing', 'past_due']);

async function postHandler(req: NextRequest, _context: unknown, { principal }: { principal: { userId: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const planId = typeof body.planId === 'string' ? body.planId : '';
    if (!isStoragePlanId(planId) || !PAID_PLAN_IDS.has(planId)) {
      return NextResponse.json({ error: 'Invalid storage plan' }, { status: 400 });
    }

    if (!prisma) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { id: true, email: true, stripeCustomerId: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'Account is still syncing. Try again in a moment.', code: 'user_not_ready' },
        { status: 409 }
      );
    }

    const billing = await getBillingPlanSnapshot(user.id);
    if (
      billing.stripeSubscriptionId &&
      billing.plan !== 'free' &&
      ACTIVE_BILLING_STATUSES.has(billing.billingStatus)
    ) {
      return NextResponse.json(
        {
          error: 'Manage your current subscription in the billing portal.',
          code: 'billing_subscription_exists',
        },
        { status: 409 }
      );
    }

    const stripe = getStripe();
    const priceId = requireStripePriceForPlan(planId);
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const origin = new URL(req.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/app/settings?billing=success`,
      cancel_url: `${origin}/app/settings?billing=cancelled`,
      metadata: { userId: user.id, planId },
      subscription_data: {
        metadata: { userId: user.id, planId },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof BillingConfigurationError) {
      return NextResponse.json(
        { error: error.message, code: error.code, retryable: false },
        { status: 503 }
      );
    }

    logError('billing:checkout-failed', error);
    return NextResponse.json({ error: 'Failed to start checkout' }, { status: 500 });
  }
}

export const POST = withObservability(withAuthenticatedApi(postHandler), { operation: 'billing:checkout' });
