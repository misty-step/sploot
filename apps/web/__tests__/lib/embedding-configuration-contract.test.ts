import { beforeEach, describe, expect, it, vi } from 'vitest';

const reportCanaryError = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@/lib/canary-reporter', () => ({ reportCanaryError }));

import {
  EmbeddingConfigurationError,
  embeddingConfigurationHeaders,
  embeddingRetryHeaders,
  reportEmbeddingConfigurationErrorOnce,
} from '@/lib/embedding-errors';

const entrypoints = [
  ['manual asset', 'assets:embedding-configuration'],
  ['image', 'embeddings:image:configuration'],
  ['upload', 'upload:embedding-configuration'],
  ['URL upload', 'upload:url:embedding-configuration'],
  ['text', 'embeddings:text:configuration'],
  ['search', 'search:configuration'],
  ['advanced search', 'advanced-search:configuration'],
  ['semantic piles', 'piles:embedding-configuration'],
  ['cron', 'cron:process-embeddings:configuration'],
] as const;

describe('deterministic embedding configuration public contract', () => {
  beforeEach(() => {
    reportCanaryError.mockClear();
  });

  it.each(entrypoints)('%s owns exactly one terminal signal after reporting', (_name, context) => {
    const error = new EmbeddingConfigurationError('provider configuration is missing');

    const unowned = new Headers(embeddingRetryHeaders(error));
    expect(unowned.get('Retry-After')).toBeNull();
    expect(unowned.get('X-Sploot-Canary-Owner')).toBeNull();
    expect(new Headers(embeddingConfigurationHeaders(error)).get('X-Sploot-Canary-Owner'))
      .toBeNull();

    expect(reportEmbeddingConfigurationErrorOnce(error, context)).toBe(true);
    expect(reportEmbeddingConfigurationErrorOnce(error, context)).toBe(false);

    const headers = new Headers(embeddingConfigurationHeaders(error));
    expect(error.statusCode).toBe(503);
    expect(error.retryable).toBe(false);
    expect(error.retryAfterSec).toBeUndefined();
    expect(headers.get('Retry-After')).toBeNull();
    expect(headers.get('X-Sploot-Embedding-Outcome')).toBe('embedding_configuration');
    expect(headers.get('X-Sploot-Canary-Owner')).toBe('route');
    expect(reportCanaryError).toHaveBeenCalledTimes(1);
    expect(reportCanaryError).toHaveBeenCalledWith(expect.objectContaining({
      context,
      metadata: expect.objectContaining({ retryable: false, providerAttempt: false }),
    }));
  });

  it('does not let a wrapper create a second report or lose ownership', () => {
    const cause = new EmbeddingConfigurationError('provider configuration is missing');
    const wrapper = new Error('embedding scheduling failed', { cause });
    Object.assign(wrapper, {
      statusCode: 503,
      retryable: false,
      reason: 'embedding_configuration',
    });

    expect(reportEmbeddingConfigurationErrorOnce(cause, 'scheduler')).toBe(true);
    expect(reportEmbeddingConfigurationErrorOnce(wrapper, 'route')).toBe(false);
    expect(new Headers(embeddingConfigurationHeaders(wrapper as never)).get('X-Sploot-Canary-Owner'))
      .toBe('route');
    expect(reportCanaryError).toHaveBeenCalledTimes(1);
  });
});
