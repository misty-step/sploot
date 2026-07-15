import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createProductionStripeAlertAdapters } from '@/lib/billing/stripe-alert-delivery';
import { createProductionSubscriptionCancellationMonitor } from '@/lib/billing/stripe-cancellation-monitor';
import { STRIPE_FAILURE_CODE } from '@/lib/billing/stripe-failure-codes';
import {
  consumeStripeWebhook,
  createStripeSignatureVerifierFromEnv,
  STRIPE_WEBHOOK_MAX_BODY_BYTES,
  StripeWebhookVerificationError,
} from '@/lib/billing/stripe-webhook';
import { logger } from '@/lib/observability-logger';
import { withObservability } from '@/lib/with-observability';

export const runtime = 'nodejs';

function requiredBoundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${name} must be a finite integer between ${minimum} and ${maximum}`);
  return value;
}

async function readBoundedWebhookBody(request: NextRequest): Promise<Uint8Array> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) throw new StripeWebhookVerificationError('Stripe webhook content length is invalid');
    if (length > STRIPE_WEBHOOK_MAX_BODY_BYTES) throw new StripeWebhookVerificationError('Stripe webhook body exceeds the bounded provenance storage limit');
  }

  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > STRIPE_WEBHOOK_MAX_BODY_BYTES) {
        await reader.cancel('Stripe webhook body limit exceeded');
        throw new StripeWebhookVerificationError('Stripe webhook body exceeds the bounded provenance storage limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function postStripeWebhook(request: NextRequest): Promise<Response> {
  let phase: 'configuration' | 'processing' = 'configuration';
  try {
    const signature = request.headers.get('stripe-signature');
    if (!signature) throw new StripeWebhookVerificationError('Stripe webhook signature is required');
    const verifier = createStripeSignatureVerifierFromEnv();
    const adapters = createProductionStripeAlertAdapters();
    const monitor = createProductionSubscriptionCancellationMonitor({
      ...adapters,
      maxCancellations: requiredBoundedInteger('STRIPE_CANCELLATION_MAX', 3, 0, 100_000),
      windowSeconds: requiredBoundedInteger('STRIPE_CANCELLATION_WINDOW_SECONDS', 300, 1, 86_400),
    });
    phase = 'processing';
    const result = await consumeStripeWebhook(await readBoundedWebhookBody(request), signature, verifier, monitor);
    if (result.observation?.retryable) return NextResponse.json({ ok: false, error: 'temporarily_unavailable' }, { status: 503 });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof StripeWebhookVerificationError || (error instanceof Error && /webhook signature is required/i.test(error.message))) {
      logger.logError('stripe:webhook-verification-failed', new Error(STRIPE_FAILURE_CODE.WEBHOOK_VERIFICATION_FAILED), { failureCode: STRIPE_FAILURE_CODE.WEBHOOK_VERIFICATION_FAILED });
      return NextResponse.json({ ok: false, error: 'invalid_webhook' }, { status: 400 });
    }
    const failureCode = phase === 'configuration' ? STRIPE_FAILURE_CODE.WEBHOOK_CONFIGURATION_FAILED : STRIPE_FAILURE_CODE.WEBHOOK_PROCESSING_FAILED;
    logger.logError('stripe:webhook-failed', new Error(failureCode), { failureCode });
    return NextResponse.json({ ok: false, error: 'temporarily_unavailable' }, { status: 503 });
  }
}

export const POST = withObservability(postStripeWebhook, { operation: 'webhooks.stripe' });
