import { NextRequest, NextResponse } from 'next/server';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { PAID_STORAGE_PLANS, STORAGE_PLANS, formatPlanLimit } from '@/lib/billing/plans';
import { getBillingPlanSnapshot } from '@/lib/billing/subscription-sync';
import { withObservability } from '@/lib/with-observability';

async function getHandler(_req: NextRequest, _context: unknown, { principal }: { principal: { userId: string } }) {
  const current = await getBillingPlanSnapshot(principal.userId);

  return NextResponse.json({
    current,
    plans: [STORAGE_PLANS.free, ...PAID_STORAGE_PLANS].map((plan) => ({
      id: plan.id,
      name: plan.name,
      priceUsd: plan.priceUsd,
      limitBytes: plan.limitBytes,
      limitLabel: formatPlanLimit(plan),
      description: plan.description,
    })),
  });
}

export const GET = withObservability(withAuthenticatedApi(getHandler), { operation: 'billing:get' });
