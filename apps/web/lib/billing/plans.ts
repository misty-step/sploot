export const GIB = 1024 * 1024 * 1024;

export type StoragePlanId = 'free' | 'plus' | 'max';

export interface StoragePlan {
  id: StoragePlanId;
  name: string;
  priceUsd: number;
  limitBytes: number;
  stripePriceEnv?: string;
  description: string;
}

export const STORAGE_PLANS: Record<StoragePlanId, StoragePlan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    limitBytes: 1 * GIB,
    description: '1 GB for getting started',
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    priceUsd: 5,
    limitBytes: 20 * GIB,
    stripePriceEnv: 'STRIPE_PRICE_ID_PLUS',
    description: '20 GB for a serious meme pile',
  },
  max: {
    id: 'max',
    name: 'Max',
    priceUsd: 12,
    limitBytes: 100 * GIB,
    stripePriceEnv: 'STRIPE_PRICE_ID_MAX',
    description: '100 GB for heavy hoarders',
  },
};

export const PAID_STORAGE_PLANS: StoragePlan[] = [STORAGE_PLANS.plus, STORAGE_PLANS.max];

export function isStoragePlanId(value: string | null | undefined): value is StoragePlanId {
  return value === 'free' || value === 'plus' || value === 'max';
}

export function planForId(value: string | null | undefined): StoragePlan {
  return isStoragePlanId(value) ? STORAGE_PLANS[value] : STORAGE_PLANS.free;
}

export function getPlanLimitBytes(value: string | null | undefined): number {
  return planForId(value).limitBytes;
}

export function stripePriceIdForPlan(planId: StoragePlanId): string | null {
  const plan = STORAGE_PLANS[planId];
  if (!plan.stripePriceEnv) return null;
  return process.env[plan.stripePriceEnv] ?? null;
}

export function planForStripePriceId(priceId: string | null | undefined): StoragePlanId {
  if (!priceId) return 'free';

  for (const plan of PAID_STORAGE_PLANS) {
    if (plan.stripePriceEnv && process.env[plan.stripePriceEnv] === priceId) {
      return plan.id;
    }
  }

  return 'free';
}

export function formatPlanLimit(plan: StoragePlan): string {
  return `${plan.limitBytes / GIB} GB`;
}
