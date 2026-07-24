import type { PlanTier } from './policy';

/**
 * Provisional plan-tier resolution. The User model has no plan/subscription
 * field yet -- sploot-billing-entitlements owns introducing one. Every
 * account is treated as "free" until that lands. Centralizing the lookup
 * here means entitlements changes exactly this one function, never every
 * admitCost() call site.
 */
export async function getUserPlanTier(_userId: string): Promise<PlanTier> {
  return 'free';
}
