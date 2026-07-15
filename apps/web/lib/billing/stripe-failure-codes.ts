/** Stable, bounded failure vocabulary for the Stripe safety boundary. */
export const STRIPE_FAILURE_CODE = {
  DELIVERY_FAILED: 'stripe_delivery_failed',
  DELIVERY_CLAIM_FENCED: 'stripe_delivery_claim_fenced',
  WEBHOOK_CONFIGURATION_FAILED: 'stripe_webhook_configuration_failed',
  WEBHOOK_PROCESSING_FAILED: 'stripe_webhook_processing_failed',
  WEBHOOK_VERIFICATION_FAILED: 'stripe_webhook_verification_failed',
} as const;

const DURABLE_DELIVERY_CODES = new Set<string>([
  STRIPE_FAILURE_CODE.DELIVERY_FAILED,
  STRIPE_FAILURE_CODE.DELIVERY_CLAIM_FENCED,
]);

export function normalizeStripeDeliveryFailureCode(value: string | undefined):
  | typeof STRIPE_FAILURE_CODE.DELIVERY_FAILED
  | typeof STRIPE_FAILURE_CODE.DELIVERY_CLAIM_FENCED {
  return value && DURABLE_DELIVERY_CODES.has(value)
    ? (value as typeof STRIPE_FAILURE_CODE.DELIVERY_FAILED | typeof STRIPE_FAILURE_CODE.DELIVERY_CLAIM_FENCED)
    : STRIPE_FAILURE_CODE.DELIVERY_FAILED;
}
