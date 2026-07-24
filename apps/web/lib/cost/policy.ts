import economicsPolicy from '../../../../economics/policy.json';

/**
 * Every plan tier the kernel knows how to price. Only 'free' is reachable
 * today (see ./plan.ts) -- sploot-billing-entitlements introduces the rest.
 */
export type PlanTier = 'free' | 'collector' | 'archive';

/** Usage past this fraction of a budget is admitted but flagged for observability. */
export const COST_ADMISSION_WARN_THRESHOLD = 0.8;

export interface PlanInferenceBudget {
  dailyAttempts: number;
  monthlyAttempts: number;
}

function policyPositiveInt(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`economics/policy.json ${name} must be a positive integer, got ${String(value)}`);
  }
  return value;
}

function policyPositiveBytes(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`economics/policy.json ${name} must be a positive number of bytes, got ${String(value)}`);
  }
  return value;
}

// Runtime projections of economics/policy.json, validated once at import
// time (same fail-fast convention as embedding-rate-limit.ts's
// policyAttemptCap): a malformed plan number in the versioned policy file
// must break the build, not silently admit unbounded spend.
const PLAN_INFERENCE_BUDGETS: Record<PlanTier, PlanInferenceBudget> = {
  free: {
    dailyAttempts: policyPositiveInt(
      economicsPolicy.planBudgets.free.dailyInferenceAttempts,
      'planBudgets.free.dailyInferenceAttempts'
    ),
    monthlyAttempts: policyPositiveInt(
      economicsPolicy.planBudgets.free.monthlyInferenceAttempts,
      'planBudgets.free.monthlyInferenceAttempts'
    ),
  },
  collector: {
    dailyAttempts: policyPositiveInt(
      economicsPolicy.planBudgets.collector.dailyInferenceAttempts,
      'planBudgets.collector.dailyInferenceAttempts'
    ),
    monthlyAttempts: policyPositiveInt(
      economicsPolicy.planBudgets.collector.monthlyInferenceAttempts,
      'planBudgets.collector.monthlyInferenceAttempts'
    ),
  },
  archive: {
    dailyAttempts: policyPositiveInt(
      economicsPolicy.planBudgets.archive.dailyInferenceAttempts,
      'planBudgets.archive.dailyInferenceAttempts'
    ),
    monthlyAttempts: policyPositiveInt(
      economicsPolicy.planBudgets.archive.monthlyInferenceAttempts,
      'planBudgets.archive.monthlyInferenceAttempts'
    ),
  },
};

const PLAN_FILE_SIZE_CAP_BYTES: Record<PlanTier, number> = {
  free: policyPositiveBytes(economicsPolicy.planFileSizeCapBytes.free, 'planFileSizeCapBytes.free'),
  collector: policyPositiveBytes(economicsPolicy.planFileSizeCapBytes.collector, 'planFileSizeCapBytes.collector'),
  archive: policyPositiveBytes(economicsPolicy.planFileSizeCapBytes.archive, 'planFileSizeCapBytes.archive'),
};

export function getPlanInferenceBudget(plan: PlanTier): PlanInferenceBudget {
  return PLAN_INFERENCE_BUDGETS[plan];
}

export function getPlanFileSizeCapBytes(plan: PlanTier): number {
  return PLAN_FILE_SIZE_CAP_BYTES[plan];
}
