/**
 * Capability-agnostic vocabulary for the cost admission kernel
 * (apps/web/lib/cost/). Every incremental vendor/compute cost in apps/web
 * declares one of these before it may run.
 *
 * - 'upload': a user-initiated file write about to hit Vercel Blob. Gated by
 *   a plan-tier per-file size cap, checked pre-write.
 * - 'embedding_index': a Replicate embedding attempt on behalf of ingesting
 *   an asset (upload pipeline, cron re-index, manual retry).
 * - 'embedding_query': a Replicate embedding attempt for a novel search
 *   query. Distinguished from 'embedding_index' so per-account budgets and
 *   observability can tell "indexing my library" apart from "searching it".
 * - 'blob_write': a system-triggered (cron) Blob write not attributable to
 *   one requesting user, e.g. thumbnail regeneration.
 */
export type CostCapability =
  | 'upload'
  | 'embedding_index'
  | 'embedding_query'
  | 'blob_write';

/**
 * Stable, machine-readable denial reasons. Every reason maps to exactly one
 * CostAdmissionSeverity (see costAdmissionSeverity in ./errors).
 */
export type CostAdmissionReason =
  | 'file_too_large'
  | 'user_daily_budget'
  | 'user_monthly_budget'
  | 'limiter_unavailable'
  | 'emergency_stop';

/**
 * The four policy states the kernel must distinguish per the admission
 * contract: 'warn' is not a denial (see CostLease.warn); 'hard_limit' is an
 * ordinary budget/cap denial; 'outage' is a fail-closed response to a
 * counter/storage failure; 'emergency_stop' is the operator kill switch.
 */
export type CostAdmissionSeverity = 'hard_limit' | 'outage' | 'emergency_stop';

/**
 * Returned by a successful admitCost(). The caller must settle it exactly
 * once: commit() when the admitted work actually happened (or reached the
 * point where its cost is unavoidable), refund() when the work never ran
 * (e.g. a downstream gate denied after this admission already committed
 * counters). Both are idempotent no-ops after the first call.
 */
export interface CostLease {
  readonly capability: CostCapability;
  readonly userId: string;
  /** True when this admission pushed usage past the soft warn threshold. */
  readonly warn: boolean;
  commit(): Promise<void>;
  refund(): Promise<void>;
}
