import { PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/db';
import { CANCELLATION_RATE_REASON } from './stripe-delivery-contract';
import { eventRawBodyProvenance } from './stripe-event';
import type { StripeSubscriptionDeletedEvent, StripeVerifiedEvent } from './stripe-event';
import { normalizeStripeDeliveryFailureCode } from './stripe-failure-codes';

declare global {
  // One issuer-authority pool per application isolate. Creating a Prisma
  // client per webhook would retain a new pool per request and can exhaust the
  // shared database before the cancellation circuit has a chance to operate.
  var splootStripeIssuerClient: { authorityUrl: string; client: PrismaClient } | undefined;
}

export type CancellationLedgerPolicy = { maxCancellations: number; windowSeconds: number };
export type CancellationDelivery = { circuitOpened: boolean; pageSent: boolean };
export type CancellationLedgerState = { alertKey: string | null; count: number; eventIds: readonly string[]; breach: boolean; delivery: CancellationDelivery };
export type CancellationDeliveryAdapter = 'circuit' | 'page';

export type CancellationDeliveryClaim = {
  alertKey: string;
  adapter: CancellationDeliveryAdapter;
  deliveryKey: string;
  replayKey: string;
  claimToken: string;
  generation: number;
  leaseExpiresAt: number;
  payloadDigest: string;
  payloadVersion: string;
  payload: Record<string, unknown>;
  /** Exact serialized HTTP body bytes; payloadDigest covers exactly this string. */
  payloadBytes: string;
};

export type CancellationDeliveryCompletion = { succeeded: boolean; error?: string };
export type CancellationDeliveryHealth = { pending: number; claimed: number; deadLetter: number; unresolved: number };

export interface StripeCancellationLedger {
  readonly durability: 'durable' | 'test-memory';
  recordEvent(event: StripeVerifiedEvent): Promise<void>;
  recordCancellation(event: StripeSubscriptionDeletedEvent, policy: CancellationLedgerPolicy, now: number): Promise<CancellationLedgerState>;
  claimDeliveries(alertKey: string, now: number, leaseSeconds: number, claimToken: string): Promise<readonly CancellationDeliveryClaim[]>;
  drainDeliveries(now: number, leaseSeconds: number, claimToken: string): Promise<readonly CancellationDeliveryClaim[]>;
  completeDelivery(claim: CancellationDeliveryClaim, completion: CancellationDeliveryCompletion, now: number): Promise<boolean>;
  replayDeadLetter(replayKey: string, now: number): Promise<boolean>;
  deliveryHealth(alertKey?: string | null): Promise<CancellationDeliveryHealth>;
}

export interface DurableStripeCancellationLedger extends StripeCancellationLedger { readonly durability: 'durable' }

const DELIVERY_LEASE_LIMIT_SECONDS = 300;
export const DELIVERY_MAX_ATTEMPTS = 8;
export const DELIVERY_BACKOFF_LIMIT_SECONDS = 300;

function assertPolicy(policy: CancellationLedgerPolicy): void {
  if (!Number.isInteger(policy.maxCancellations) || !Number.isFinite(policy.maxCancellations) || policy.maxCancellations < 0) throw new Error('maxCancellations must be a non-negative finite integer');
  if (!Number.isInteger(policy.windowSeconds) || !Number.isFinite(policy.windowSeconds) || policy.windowSeconds <= 0) throw new Error('windowSeconds must be a positive finite integer');
}

function assertTime(now: number): void {
  if (!Number.isInteger(now) || !Number.isFinite(now) || now < 0) throw new Error('ledger time must be a non-negative finite integer');
}

function assertLeaseSeconds(value: number): void {
  if (!Number.isInteger(value) || !Number.isFinite(value) || value < 1 || value > DELIVERY_LEASE_LIMIT_SECONDS) throw new Error(`delivery lease must be a finite integer between 1 and ${DELIVERY_LEASE_LIMIT_SECONDS} seconds`);
}

function mapClaim(row: Record<string, unknown>): CancellationDeliveryClaim {
  return {
    alertKey: String(row.alert_key), adapter: String(row.adapter) as CancellationDeliveryAdapter,
    deliveryKey: String(row.delivery_key), replayKey: String(row.replay_key), claimToken: String(row.claim_token),
    generation: Number(row.generation), leaseExpiresAt: Number(row.lease_expires_at),
    payloadDigest: String(row.payload_digest), payloadVersion: String(row.payload_version), payload: (row.payload ?? {}) as Record<string, unknown>,
    payloadBytes: String(row.payload_bytes),
  };
}

function mapState(row: Record<string, unknown>): CancellationLedgerState {
  const ids = Array.isArray(row.event_ids) ? row.event_ids.map(String) : [];
  return { alertKey: row.alert_key ? String(row.alert_key) : null, count: Number(row.cancellation_count), eventIds: ids, breach: Boolean(row.breach), delivery: { circuitOpened: Boolean(row.circuit_opened), pageSent: Boolean(row.page_sent) } };
}

/** Durable Postgres adapter. All ledger, alert, audit, and outbox mutation is
 * performed by narrowly typed SECURITY DEFINER functions; the runtime role
 * has no table DML privileges. */
export class PrismaStripeCancellationLedger implements DurableStripeCancellationLedger {
  readonly durability = 'durable' as const;
  constructor(private readonly database: PrismaClient) {}

  async recordEvent(event: StripeVerifiedEvent): Promise<void> {
    if (!event.id.trim() || !event.type.trim() || !Number.isInteger(event.created) || event.created < 0) throw new Error('verified Stripe event identity is invalid');
    const provenance = eventRawBodyProvenance(event);
    const rows = await this.database.$queryRaw<Array<{ event_id: string }>>`
      SELECT * FROM public.sploot_append_stripe_event(
        ${event.id}::text, ${event.type}::text, ${event.created}::integer, ${event.livemode}::boolean,
        ${event.accountId}::text, ${event.objectId}::text, ${event.objectType}::text, ${event.signatureTimestamp}::integer,
        ${JSON.stringify(event.payload)}::jsonb, ${event.canonicalPayloadDigest}::text, ${event.rawBodyDigest}::text,
        ${Buffer.from(provenance.ciphertext)}::bytea, ${Buffer.from(provenance.nonce)}::bytea, ${provenance.keyId}::text, ${provenance.signatureHeaderDigest}::text
      )`;
    if (rows.length !== 1) throw new Error('Stripe event append path returned an invalid result');
  }

  async recordCancellation(event: StripeSubscriptionDeletedEvent, policy: CancellationLedgerPolicy, now: number): Promise<CancellationLedgerState> {
    assertPolicy(policy); assertTime(now);
    if (!event.id.trim() || event.type !== 'customer.subscription.deleted' || !Number.isInteger(event.created) || event.created < 0) throw new Error('Stripe cancellation event is incomplete or invalid');
    const provenance = eventRawBodyProvenance(event);
    const rows = await this.database.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM public.sploot_record_stripe_cancellation(
        ${event.id}::text, ${event.type}::text, ${event.created}::integer, ${event.livemode}::boolean,
        ${event.accountId}::text, ${event.objectId}::text, ${event.objectType}::text, ${event.signatureTimestamp}::integer,
        ${JSON.stringify(event.payload)}::jsonb, ${event.canonicalPayloadDigest}::text, ${event.rawBodyDigest}::text,
        ${Buffer.from(provenance.ciphertext)}::bytea, ${Buffer.from(provenance.nonce)}::bytea, ${provenance.keyId}::text, ${provenance.signatureHeaderDigest}::text,
        ${CANCELLATION_RATE_REASON}::text, ${policy.maxCancellations}::integer, ${policy.windowSeconds}::integer, ${now}::integer
      )`;
    if (rows.length !== 1) throw new Error('Stripe cancellation recording path returned an invalid result');
    return mapState(rows[0]);
  }

  async claimDeliveries(alertKey: string, now: number, leaseSeconds: number, claimToken: string): Promise<readonly CancellationDeliveryClaim[]> {
    if (!alertKey.trim() || !claimToken.trim()) throw new Error('Stripe delivery claim identity is required');
    assertTime(now); assertLeaseSeconds(leaseSeconds);
    const rows = await this.database.$queryRaw<Array<Record<string, unknown>> >`
      SELECT * FROM public.sploot_stripe_claim_deliveries(${alertKey}::text, ${now}::integer, ${leaseSeconds}::integer, ${claimToken}::text)`;
    return rows.map(mapClaim);
  }

  async drainDeliveries(now: number, leaseSeconds: number, claimToken: string): Promise<readonly CancellationDeliveryClaim[]> {
    assertTime(now); assertLeaseSeconds(leaseSeconds); if (!claimToken.trim()) throw new Error('Stripe delivery drain claim token is required');
    const rows = await this.database.$queryRaw<Array<Record<string, unknown>> >`
      SELECT * FROM public.sploot_stripe_drain_deliveries(${now}::integer, ${leaseSeconds}::integer, ${claimToken}::text)`;
    return rows.map(mapClaim);
  }

  async completeDelivery(claim: CancellationDeliveryClaim, completion: CancellationDeliveryCompletion, now: number): Promise<boolean> {
    assertTime(now);
    const rows = await this.database.$queryRaw<Array<{ sploot_stripe_complete_delivery: boolean }>>`
      SELECT public.sploot_stripe_complete_delivery(${claim.deliveryKey}::text, ${claim.alertKey}::text, ${claim.adapter}::text, ${claim.replayKey}::text, ${claim.payloadDigest}::text, ${claim.payloadVersion}::text, ${claim.claimToken}::text, ${claim.generation}::integer, ${completion.succeeded}::boolean, ${completion.succeeded ? null : normalizeStripeDeliveryFailureCode(completion.error)}::text, ${now}::integer)`;
    return rows[0]?.sploot_stripe_complete_delivery === true;
  }

  async replayDeadLetter(replayKey: string, now: number): Promise<boolean> {
    assertTime(now); if (!replayKey.trim()) throw new Error('dead-letter replay identity is required');
    const rows = await this.database.$queryRaw<Array<{ sploot_replay_stripe_dead_letter: boolean }>>`
      SELECT public.sploot_replay_stripe_dead_letter(${replayKey}::text, ${now}::integer)`;
    return rows[0]?.sploot_replay_stripe_dead_letter === true;
  }

  async deliveryHealth(alertKey?: string | null): Promise<CancellationDeliveryHealth> {
    const rows = await this.database.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM public.sploot_stripe_delivery_health(${alertKey ?? null}::text)`;
    const row = rows[0] ?? {};
    return {
      pending: Number(row.pending ?? 0),
      claimed: Number(row.claimed ?? 0),
      deadLetter: Number(row.dead_letter ?? 0),
      unresolved: Number(row.unresolved ?? 0),
    };
  }
}

export function createProductionStripeCancellationLedger(database: PrismaClient | null | undefined = prisma, authorityUrl = process.env.STRIPE_LEDGER_ISSUER_DATABASE_URL): DurableStripeCancellationLedger {
  if (!database) throw new Error('production Stripe cancellation monitoring requires configured Postgres and issuer authority');
  const issuerUrl = authorityUrl;
  if (!issuerUrl) throw new Error('production Stripe cancellation monitoring requires the separate issuer authority URL');
  const cached = globalThis.splootStripeIssuerClient;
  if (cached && cached.authorityUrl !== issuerUrl) {
    throw new Error('Stripe issuer authority changed after initialization; restart the application to rotate it');
  }
  const client = cached?.client ?? new PrismaClient({ datasources: { db: { url: issuerUrl } } });
  if (!cached) globalThis.splootStripeIssuerClient = { authorityUrl: issuerUrl, client };
  return new PrismaStripeCancellationLedger(client);
}

export { DELIVERY_LEASE_LIMIT_SECONDS };
