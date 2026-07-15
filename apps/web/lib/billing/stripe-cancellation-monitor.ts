import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import {
  createProductionStripeCancellationLedger,
  type CancellationLedgerPolicy,
  type CancellationDeliveryClaim,
  type DurableStripeCancellationLedger,
  type StripeCancellationLedger,
} from './stripe-cancellation-ledger';
import { CANCELLATION_RATE_REASON } from './stripe-delivery-contract';
import type { StripeSubscriptionDeletedEvent, StripeVerifiedEvent } from './stripe-event';
import { STRIPE_FAILURE_CODE } from './stripe-failure-codes';
import { logger } from '@/lib/observability-logger';

export type { StripeSubscriptionDeletedEvent, StripeVerifiedEvent } from './stripe-event';

export type StripeCancellationAlert = {
  reason: string;
  count: number;
  maxCancellations: number;
  windowSeconds: number;
  eventIds: readonly string[];
  alertKey: string;
};

/** Adapters receive the exact persisted HTTP body bytes for a claimed
 * delivery. They must transmit those bytes verbatim: the accompanying
 * payloadDigest covers exactly that string, so retries are byte-identical. */
export interface StripeCircuitAdapter {
  open(payloadBytes: string, deliveryKey: string, payloadDigest: string, payloadVersion: string): Promise<void>;
}

export interface StripePageAdapter {
  page(payloadBytes: string, deliveryKey: string, payloadDigest: string, payloadVersion: string): Promise<void>;
}

export interface StripeWebhookVerifier {
  verify(rawBody: Uint8Array, signature: string): Promise<StripeVerifiedEvent | null>;
}

export type AdapterOutcome = {
  adapter: 'circuit' | 'page';
  status: 'succeeded' | 'failed';
  retryable: boolean;
  error?: string;
};

type CancellationMonitorOptions = CancellationLedgerPolicy & {
  ledger: StripeCancellationLedger;
  clock?: () => number;
  circuit: StripeCircuitAdapter;
  page: StripePageAdapter;
};

export type CancellationObservation = {
  count: number;
  operationalStatus: 'not-breached' | 'tripped' | 'delivery-failed';
  retryable: boolean;
  outcomes: readonly AdapterOutcome[];
  alert?: StripeCancellationAlert;
};

export type SignedWebhookResult = {
  handled: boolean;
  ignored?: boolean;
  observation?: CancellationObservation;
  alert?: StripeCancellationAlert;
};

/**
 * The monitor has no public plain-event ingestion method. Its only event path
 * is the static signed-webhook boundary below, which verifies a signature
 * before invoking the private observation method.
 */
export class SubscriptionCancellationMonitor {
  private readonly ledger: StripeCancellationLedger;
  private readonly policy: CancellationLedgerPolicy;
  private readonly clock: () => number;
  private readonly circuit: StripeCircuitAdapter;
  private readonly page: StripePageAdapter;

  constructor(options: CancellationMonitorOptions) {
    if (!Number.isInteger(options.maxCancellations) || options.maxCancellations < 0) throw new Error('maxCancellations must be a non-negative finite integer');
    if (!Number.isInteger(options.windowSeconds) || options.windowSeconds <= 0) throw new Error('windowSeconds must be a positive finite integer');
    this.ledger = options.ledger;
    this.policy = { maxCancellations: options.maxCancellations, windowSeconds: options.windowSeconds };
    this.clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
    this.circuit = options.circuit;
    this.page = options.page;
  }

  static async consumeSignedWebhook(
    rawBody: Uint8Array,
    signature: string | null,
    verifier: StripeWebhookVerifier,
    monitor: SubscriptionCancellationMonitor,
  ): Promise<SignedWebhookResult> {
    if (!signature || !signature.trim()) throw new Error('Stripe webhook signature is required');
    const event = await verifier.verify(rawBody, signature);
    if (!event) return { handled: false };
    if (event.type !== 'customer.subscription.deleted') {
      await monitor.ledger.recordEvent(event);
      return { handled: true, ignored: true };
    }
    const observation = await monitor.#observe(event as StripeSubscriptionDeletedEvent);
    return { handled: true, observation, ...(observation.alert ? { alert: observation.alert } : {}) };
  }

  async #observe(event: StripeSubscriptionDeletedEvent): Promise<CancellationObservation> {
    const state = await this.ledger.recordCancellation(event, this.policy, this.clock());
    if (!state.breach || !state.alertKey) return { count: state.count, operationalStatus: 'not-breached', retryable: false, outcomes: [] };

    const alert: StripeCancellationAlert = {
      reason: CANCELLATION_RATE_REASON,
      count: state.count,
      maxCancellations: this.policy.maxCancellations,
      windowSeconds: this.policy.windowSeconds,
      eventIds: state.eventIds,
      alertKey: state.alertKey,
    };
    const outcomes: AdapterOutcome[] = [];
    const claims = await this.ledger.claimDeliveries(state.alertKey, this.clock(), DELIVERY_LEASE_SECONDS, randomUUID());
    for (const claim of claims) outcomes.push(await this.deliver(claim));
    const failed = outcomes.some((outcome) => outcome.status === 'failed');
    const circuitDelivered = state.delivery.circuitOpened || outcomes.some((outcome) => outcome.adapter === 'circuit' && outcome.status === 'succeeded');
    const pageDelivered = state.delivery.pageSent || outcomes.some((outcome) => outcome.adapter === 'page' && outcome.status === 'succeeded');
    const health = await this.ledger.deliveryHealth(state.alertKey);
    return {
      count: state.count,
      operationalStatus: failed || !circuitDelivered || !pageDelivered || health.unresolved > 0 ? 'delivery-failed' : 'tripped',
      retryable: failed || !circuitDelivered || !pageDelivered || health.unresolved > 0,
      outcomes,
      alert,
    };
  }

  private async deliver(claim: CancellationDeliveryClaim): Promise<AdapterOutcome> {
    try {
      if (claim.adapter === 'circuit') await this.circuit.open(claim.payloadBytes, claim.deliveryKey, claim.payloadDigest, claim.payloadVersion);
      else await this.page.page(claim.payloadBytes, claim.deliveryKey, claim.payloadDigest, claim.payloadVersion);
      const accepted = await this.ledger.completeDelivery(claim, { succeeded: true }, this.clock());
      if (accepted) return { adapter: claim.adapter, status: 'succeeded', retryable: false };
      const failureCode = STRIPE_FAILURE_CODE.DELIVERY_CLAIM_FENCED;
      logger.logError('stripe-cancellation.delivery-fenced', new Error(failureCode), { adapter: claim.adapter, failureCode });
      return { adapter: claim.adapter, status: 'failed', retryable: true, error: failureCode };
    } catch {
      const failureCode = STRIPE_FAILURE_CODE.DELIVERY_FAILED;
      try {
        await this.ledger.completeDelivery(claim, { succeeded: false, error: failureCode }, this.clock());
      } catch {
        // Never replace the bounded delivery code with a provider or database
        // exception while reporting this failure.
      }
      logger.logError('stripe-cancellation.delivery-failed', new Error(failureCode), { adapter: claim.adapter, failureCode });
      return { adapter: claim.adapter, status: 'failed', retryable: true, error: failureCode };
    }
  }

  /** Independent scheduled drain path. It can recover pending or expired
   * claims even when no new webhook arrives. */
  async drain(): Promise<readonly AdapterOutcome[]> {
    const claims = await this.ledger.drainDeliveries(this.clock(), DELIVERY_LEASE_SECONDS, randomUUID());
    const outcomes: AdapterOutcome[] = [];
    for (const claim of claims) outcomes.push(await this.deliver(claim));
    return outcomes;
  }

  async hasUnresolvedDeliveries(alertKey?: string | null): Promise<boolean> {
    return (await this.ledger.deliveryHealth(alertKey ?? null)).unresolved > 0;
  }
}

export const DELIVERY_LEASE_SECONDS = 60;

export function createProductionSubscriptionCancellationMonitor(options: Omit<CancellationMonitorOptions, 'ledger'> & { database?: PrismaClient; ledgerAuthorityUrl?: string }): SubscriptionCancellationMonitor {
  return new SubscriptionCancellationMonitor({ ...options, ledger: createProductionStripeCancellationLedger(options.database, options.ledgerAuthorityUrl) });
}

export { CANCELLATION_RATE_REASON };
