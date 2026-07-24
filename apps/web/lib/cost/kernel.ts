import { logger } from '@/lib/observability-logger';
import { acquireInferenceBudget, refundInferenceBudget } from './counters';
import { CostAdmissionError } from './errors';
import { getUserPlanTier } from './plan';
import { COST_ADMISSION_WARN_THRESHOLD, getPlanFileSizeCapBytes, getPlanInferenceBudget } from './policy';
import type { CostCapability, CostLease } from './types';

const HALT_TRUE_VALUES: Record<string, true> = { '1': true, true: true, on: true, enabled: true, yes: true };

/** Operator kill switch: SPLOOT_COST_ADMISSION_HALT=true denies every capability. */
export function isCostAdmissionHalted(): boolean {
  const raw = process.env.SPLOOT_COST_ADMISSION_HALT;
  return raw !== undefined && HALT_TRUE_VALUES[raw.trim().toLowerCase()] === true;
}

export interface AdmitCostRequest {
  capability: CostCapability;
  userId: string;
  /** Required for capability 'upload': the exact byte size about to be written. Never client-supplied. */
  bytes?: number;
}

function grantedLease(capability: CostCapability, userId: string, warn = false): CostLease {
  return {
    capability,
    userId,
    warn,
    commit: async () => {},
    refund: async () => {},
  };
}

/**
 * The single admission door every incremental vendor/compute cost in
 * apps/web must pass through. Returns a CostLease the caller settles
 * exactly once (commit when the admitted work happened or its cost became
 * unavoidable, refund when it never ran) or throws CostAdmissionError.
 */
export async function admitCost(request: AdmitCostRequest): Promise<CostLease> {
  const { capability, userId } = request;

  if (isCostAdmissionHalted()) {
    throw new CostAdmissionError('emergency_stop');
  }

  if (capability === 'upload') {
    if (typeof request.bytes !== 'number' || !Number.isFinite(request.bytes) || request.bytes < 0) {
      throw new Error('admitCost: capability "upload" requires a non-negative bytes estimate');
    }
    const plan = await getUserPlanTier(userId);
    if (request.bytes > getPlanFileSizeCapBytes(plan)) {
      throw new CostAdmissionError('file_too_large');
    }
    // The per-file cap above is this kernel's only owned gate for uploads;
    // total-account storage capacity is enforced separately (and already
    // tested) by lib/quota/storage-quota-policy.ts's reserve/commit/refund
    // cycle, which ingest-image.ts still calls next.
    return grantedLease(capability, userId);
  }

  if (capability === 'blob_write') {
    // System-triggered Blob spend (e.g. cron thumbnail regeneration) is not
    // attributable to one requesting user. Only the emergency-stop gate
    // above applies today; see docs/adr residual notes for a global churn
    // budget as future work.
    return grantedLease(capability, userId);
  }

  const plan = await getUserPlanTier(userId);
  const budget = getPlanInferenceBudget(plan);
  const admission = await acquireInferenceBudget(
    capability,
    userId,
    budget.dailyAttempts,
    budget.monthlyAttempts,
    COST_ADMISSION_WARN_THRESHOLD
  );

  if (!admission.allowed) {
    throw new CostAdmissionError(admission.reason ?? 'limiter_unavailable', admission.retryAfterSec);
  }

  if (admission.warn) {
    logger.logInfo('cost-admission.warn-threshold', {
      capability,
      userId,
      dailyCount: admission.dailyCount,
      dailyLimit: admission.dailyLimit,
      monthlyCount: admission.monthlyCount,
      monthlyLimit: admission.monthlyLimit,
    });
  }

  let settled = false;
  return {
    capability,
    userId,
    warn: admission.warn,
    commit: async () => {
      settled = true;
    },
    refund: async () => {
      if (settled) return;
      settled = true;
      await refundInferenceBudget(admission.keys);
    },
  };
}
