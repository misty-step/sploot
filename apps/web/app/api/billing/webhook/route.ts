import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { BillingConfigurationError, getStripe, getStripeWebhookSecret } from '@/lib/billing/stripe';
import { applyStripeSubscription, resetBillingForCustomer } from '@/lib/billing/subscription-sync';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/vercel-logger';

async function postHandler(req: NextRequest) {
  let event: Stripe.Event;

  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json(
        { error: 'Missing Stripe signature', code: 'invalid_signature' },
        { status: 400 }
      );
    }

    event = getStripe().webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (error) {
    const status = error instanceof BillingConfigurationError ? 503 : 400;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Invalid Stripe webhook',
        code: error instanceof BillingConfigurationError ? error.code : 'invalid_signature',
      },
      { status }
    );
  }

  try {
    await handleStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    logError('billing:webhook-failed', error, { eventType: event.type, eventId: event.id });
    return NextResponse.json({ error: 'Failed to process Stripe webhook' }, { status: 500 });
  }
}

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription' || !session.subscription) return;
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;
      const customerId = typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;
      const userId = session.metadata?.userId ?? session.client_reference_id;

      if (customerId && userId) {
        await prisma?.user.updateMany({
          where: { id: userId },
          data: { stripeCustomerId: customerId },
        });
      }

      const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
      await applyStripeSubscription(subscription);
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await applyStripeSubscription(event.data.object as Stripe.Subscription);
      return;
    case 'customer.deleted': {
      const customer = event.data.object as Stripe.Customer;
      await resetBillingForCustomer(customer.id);
      return;
    }
  }
}

export const POST = withObservability(postHandler, { operation: 'billing:webhook' });
