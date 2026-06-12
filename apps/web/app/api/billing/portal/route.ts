import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { BillingConfigurationError, getStripe } from '@/lib/billing/stripe';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/vercel-logger';

async function postHandler(req: NextRequest, _context: unknown, { principal }: { principal: { userId: string } }) {
  try {
    if (!prisma) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { stripeCustomerId: true },
    });
    if (!user?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing customer exists yet', code: 'billing_customer_missing' },
        { status: 400 }
      );
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${new URL(req.url).origin}/app/settings?billing=portal`,
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

    logError('billing:portal-failed', error);
    return NextResponse.json({ error: 'Failed to open billing portal' }, { status: 500 });
  }
}

export const POST = withObservability(withAuthenticatedApi(postHandler), { operation: 'billing:portal' });
