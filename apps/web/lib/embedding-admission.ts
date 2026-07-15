import type { EmbeddingRateLimitReason } from './embedding-rate-limit';
import type { EmbeddingDailyBudgetReason } from './embedding-rate-limit';
import {
  EmbeddingError,
  EMBEDDING_DEFAULT_RETRY_AFTER_SECONDS,
  normalizeEmbeddingRetryAfter,
} from './embedding-errors';
import { ENROLLMENT_UNAVAILABLE_CODE } from './enrollment/enrollment-policy';

export type EmbeddingAdmissionReason =
  | EmbeddingRateLimitReason
  | EmbeddingDailyBudgetReason;

/**
 * The only error type that represents admission policy.  Keeping this as a
 * shared nominal class prevents arbitrary objects with a `reason`, `name`, or
 * HTTP status from being treated as durable admission state.
 */
export class EmbeddingAdmissionError extends EmbeddingError {
  readonly reason: EmbeddingAdmissionReason;
  /**
   * Master's enrollment contract (PR #290): a limiter that cannot reach its
   * Postgres backing surfaces the shared `enrollment_unavailable` code so the
   * withObservability fallback maps it to the typed 503 contract instead of a
   * generic 500. Routes with explicit EmbeddingAdmissionError handling still
   * take precedence and add Retry-After.
   */
  readonly code: typeof ENROLLMENT_UNAVAILABLE_CODE | undefined;

  constructor(
    reason: EmbeddingAdmissionReason,
    retryAfterSec = EMBEDDING_DEFAULT_RETRY_AFTER_SECONDS,
  ) {
    super(
      reason === 'limiter_unavailable'
        ? 'Embedding admission is temporarily unavailable'
        : 'Embedding generation is rate limited',
      reason === 'limiter_unavailable' ? 503 : 429,
      true,
      normalizeEmbeddingRetryAfter(retryAfterSec),
    );
    this.name = 'EmbeddingAdmissionError';
    this.reason = reason;
    this.code = reason === 'limiter_unavailable' ? ENROLLMENT_UNAVAILABLE_CODE : undefined;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
