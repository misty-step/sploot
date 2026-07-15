/**
 * Shared leaf constants for the durable Stripe alert delivery contract.
 *
 * The exact serialized HTTP body bytes for circuit/page deliveries are
 * authored once inside the database (sploot_record_stripe_cancellation) as
 * the adapter wrappers {"action":"open","reason":...,"alert":...} and
 * {"action":"page","alert":...}. The persisted `payload_bytes` column is the
 * delivery authority: `payload_digest` covers exactly those bytes, the HTTP
 * client sends them verbatim, and every retry is byte-identical.
 */
export const CANCELLATION_RATE_REASON = 'stripe subscription cancellation rate exceeded';

/** Version tag for the exact-HTTP-bytes wrapper contract. Must match the
 * value written by sploot_record_stripe_cancellation in
 * prisma/stripe-ledger-bootstrap-post.sql. */
export const DELIVERY_PAYLOAD_VERSION = 'stripe-cancellation-http-v1';
