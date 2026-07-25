import type { CostAdmissionReason, CostAdmissionSeverity } from './types';

const REASON_SEVERITY: Record<CostAdmissionReason, CostAdmissionSeverity> = {
  file_too_large: 'hard_limit',
  user_daily_budget: 'hard_limit',
  user_monthly_budget: 'hard_limit',
  limiter_unavailable: 'outage',
  emergency_stop: 'emergency_stop',
};

export function costAdmissionSeverity(reason: CostAdmissionReason): CostAdmissionSeverity {
  return REASON_SEVERITY[reason];
}

const DEFAULT_RETRY_AFTER_SECONDS: Record<CostAdmissionSeverity, number> = {
  hard_limit: 30,
  outage: 30,
  emergency_stop: 60,
};

function costAdmissionMessage(reason: CostAdmissionReason): string {
  switch (reason) {
    case 'file_too_large':
      return 'File exceeds the per-file size cap for your plan';
    case 'user_daily_budget':
      return 'Daily inference budget exceeded for this account';
    case 'user_monthly_budget':
      return 'Monthly inference budget exceeded for this account';
    case 'limiter_unavailable':
      return 'Cost admission is temporarily unavailable';
    case 'emergency_stop':
      return 'Cost admission is paused by operator emergency stop';
  }
}

function statusCodeFor(reason: CostAdmissionReason, severity: CostAdmissionSeverity): number {
  if (reason === 'file_too_large') return 413;
  if (severity === 'hard_limit') return 429;
  return 503;
}

/**
 * The one error type every capability's admission denial surfaces as. Kept
 * independent of the embedding-domain error taxonomy (embedding-errors.ts)
 * on purpose: 'upload' and 'blob_write' denials are not embedding concerns,
 * and this module must not create a dependency from generic cost
 * infrastructure back onto one of its own capability consumers. Route
 * handlers add one `instanceof CostAdmissionError` branch alongside their
 * existing embedding-error handling.
 */
export class CostAdmissionError extends Error {
  readonly reason: CostAdmissionReason;
  readonly severity: CostAdmissionSeverity;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly retryAfterSec: number;

  constructor(reason: CostAdmissionReason, retryAfterSec?: number) {
    const severity = costAdmissionSeverity(reason);
    super(costAdmissionMessage(reason));
    this.name = 'CostAdmissionError';
    this.reason = reason;
    this.severity = severity;
    this.statusCode = statusCodeFor(reason, severity);
    this.retryable = severity !== 'hard_limit' || reason !== 'file_too_large';
    this.retryAfterSec = retryAfterSec ?? DEFAULT_RETRY_AFTER_SECONDS[severity];
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
