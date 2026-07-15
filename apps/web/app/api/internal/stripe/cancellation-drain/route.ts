import { timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createProductionStripeAlertAdapters } from '@/lib/billing/stripe-alert-delivery';
import { PrismaStripeCancellationLedger } from '@/lib/billing/stripe-cancellation-ledger';
import { SubscriptionCancellationMonitor } from '@/lib/billing/stripe-cancellation-monitor';
import { withObservability } from '@/lib/with-observability';

export const runtime = 'nodejs';

function hasBearer(request: NextRequest): boolean {
  const expected = process.env.STRIPE_CANCELLATION_DRAIN_TOKEN;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!expected || !supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function postDrain(request: NextRequest): Promise<Response> {
  if (!hasBearer(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const consumerUrl = process.env.STRIPE_LEDGER_CONSUMER_DATABASE_URL;
  if (!consumerUrl) return NextResponse.json({ error: 'drain authority unavailable' }, { status: 503 });
  const database = new PrismaClient({ datasources: { db: { url: consumerUrl } } });
  try {
    // The ledger reuses this route's consumer-role client directly so exactly
    // one PrismaClient exists per drain and is disconnected in `finally` —
    // the factory would construct (and leak) a second client per request.
    const monitor = new SubscriptionCancellationMonitor({
      ledger: new PrismaStripeCancellationLedger(database),
      maxCancellations: 0,
      windowSeconds: 1,
      ...createProductionStripeAlertAdapters(),
    });
    const outcomes = await monitor.drain();
    const unresolved = await monitor.hasUnresolvedDeliveries();
    const failed = outcomes.filter((outcome) => outcome.status === 'failed').length;
    return NextResponse.json({ drained: outcomes.length, failed, unresolved }, { status: failed > 0 || unresolved ? 503 : 200 });
  } finally {
    await database.$disconnect();
  }
}

export const POST = withObservability(postDrain, { operation: 'internal.stripe.cancellation-drain' });
