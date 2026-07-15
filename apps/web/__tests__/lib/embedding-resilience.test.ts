import { describe, expect, it } from 'vitest';

import {
  EmbeddingAdmissionError,
  getEmbeddingAdmissionReason,
  isCircuitOpeningAdmissionReason,
  isEmbeddingAdmissionFailure,
  isGlobalEmbeddingAdmissionReason,
} from '@/lib/embedding-resilience';

describe('embedding resilience admission classification', () => {
  it('does not classify an arbitrary reason-bearing object as admission failure', () => {
    expect(isEmbeddingAdmissionFailure({ reason: 'not_an_admission_reason' })).toBe(false);
    expect(isEmbeddingAdmissionFailure(new Error('ordinary failure'))).toBe(false);
  });

  it('recognizes the explicit admission error and provider 429 forms', () => {
    const admissionError = new EmbeddingAdmissionError('user_rate', 60);

    expect(isEmbeddingAdmissionFailure(admissionError)).toBe(true);
    expect(isEmbeddingAdmissionFailure({ statusCode: 429 })).toBe(false);
    expect(isEmbeddingAdmissionFailure({ reason: 'daily_budget' })).toBe(false);
    expect(isEmbeddingAdmissionFailure({ reason: 'not_an_admission_reason', status: 200 })).toBe(false);
  });

  it('keeps user admission local and global admission batch-stopping', () => {
    expect(isGlobalEmbeddingAdmissionReason('user_rate')).toBe(false);
    expect(isGlobalEmbeddingAdmissionReason('user_concurrency')).toBe(false);
    expect(isGlobalEmbeddingAdmissionReason('global_rate')).toBe(true);
    expect(isGlobalEmbeddingAdmissionReason('global_concurrency')).toBe(true);
    expect(isGlobalEmbeddingAdmissionReason('daily_budget')).toBe(true);
    expect(isGlobalEmbeddingAdmissionReason('limiter_unavailable')).toBe(true);
    expect(getEmbeddingAdmissionReason(new EmbeddingAdmissionError('user_rate'))).toBe('user_rate');
    expect(getEmbeddingAdmissionReason({ reason: 'user_rate' })).toBeUndefined();
  });

  it('opens the shared circuit only for window/budget/limiter exhaustion, never for in-flight saturation', () => {
    // global_concurrency means the fixed number of in-flight leases are all
    // busy doing real work; those leases self-release within seconds (TTL at
    // worst). Quota reasons stay true for their whole window regardless of
    // in-flight completions, so only they justify a durable open interval.
    expect(isCircuitOpeningAdmissionReason('global_rate')).toBe(true);
    expect(isCircuitOpeningAdmissionReason('daily_budget')).toBe(true);
    expect(isCircuitOpeningAdmissionReason('limiter_unavailable')).toBe(true);
    expect(isCircuitOpeningAdmissionReason('global_concurrency')).toBe(false);
    expect(isCircuitOpeningAdmissionReason('user_rate')).toBe(false);
    expect(isCircuitOpeningAdmissionReason('user_concurrency')).toBe(false);
    expect(isCircuitOpeningAdmissionReason('not_a_reason')).toBe(false);
  });
});
