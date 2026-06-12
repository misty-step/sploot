import Stripe from 'stripe';
import type { StoragePlanId } from './plans';
import { stripePriceIdForPlan } from './plans';

const STRIPE_API_VERSION = '2025-10-29.clover';

let stripeClient: Stripe | null = null;

export class BillingConfigurationError extends Error {
  constructor(message: string, public code = 'billing_not_configured') {
    super(message);
    this.name = 'BillingConfigurationError';
  }
}

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new BillingConfigurationError('Stripe is not configured');
  }

  stripeClient ??= new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new BillingConfigurationError('Stripe webhook secret is not configured');
  }
  return secret;
}

export function requireStripePriceForPlan(planId: StoragePlanId): string {
  const priceId = stripePriceIdForPlan(planId);
  if (!priceId) {
    throw new BillingConfigurationError(`Stripe price is not configured for ${planId}`);
  }
  return priceId;
}
