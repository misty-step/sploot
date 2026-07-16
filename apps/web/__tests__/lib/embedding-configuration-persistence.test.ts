import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeRaw = vi.hoisted(() => vi.fn());
const reportCanaryError = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));

vi.mock('@/lib/db', () => ({
  prisma: { $executeRaw: executeRaw },
}));
vi.mock('@/lib/canary-reporter', () => ({ reportCanaryError }));
vi.mock('@/lib/observability-logger', () => ({
  logger: { logInfo: vi.fn(), logError: vi.fn(), logTiming: vi.fn(), getTraceId: vi.fn() },
}));

import {
  EmbeddingConfigurationError,
  reportEmbeddingConfigurationErrorOnce,
} from '@/lib/embedding-errors';
import { recordEmbeddingConfigurationFailure } from '@/lib/embedding-resilience';

describe('configuration failure persistence ownership', () => {
  beforeEach(() => {
    executeRaw.mockReset();
    executeRaw.mockRejectedValue(new Error('claim persistence unavailable'));
    reportCanaryError.mockClear();
    reportCanaryError.mockResolvedValue(true);
  });

  it('keeps the typed terminal outcome when claim clearing fails and emits one signal', async () => {
    const error = new EmbeddingConfigurationError('provider configuration is missing');

    await expect(recordEmbeddingConfigurationFailure('asset-1', error, 'claim-1')).resolves.toBe(false);
    await expect(recordEmbeddingConfigurationFailure('asset-1', error, 'claim-1')).resolves.toBe(false);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(reportCanaryError).toHaveBeenCalledTimes(1);
    await expect(reportEmbeddingConfigurationErrorOnce(error, 'route-after-persistence-failure')).resolves.toBe(false);
    expect(reportCanaryError).toHaveBeenCalledTimes(1);
    expect(error.statusCode).toBe(503);
    expect(error.retryable).toBe(false);
    expect(error.retryAfterSec).toBeUndefined();
  });
});
