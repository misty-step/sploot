import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureOperationalError = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/lib/sentry', () => ({ captureOperationalError }));

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
    captureOperationalError.mockClear();
    captureOperationalError.mockReturnValue(true);
  });

  it.each(entrypoints)('%s owns exactly one terminal signal after reporting', async (_name, context) => {
    const error = new EmbeddingConfigurationError('provider configuration is missing');

    const unowned = new Headers(embeddingRetryHeaders(error));
    expect(unowned.get('Retry-After')).toBeNull();
    expect(unowned.get('X-Sploot-Observability-Owner')).toBeNull();
    expect(new Headers(embeddingConfigurationHeaders(error)).get('X-Sploot-Observability-Owner'))
      .toBeNull();

    await expect(reportEmbeddingConfigurationErrorOnce(error, context)).resolves.toBe(true);
    await expect(reportEmbeddingConfigurationErrorOnce(error, context)).resolves.toBe(false);

    const headers = new Headers(embeddingConfigurationHeaders(error));
    expect(error.statusCode).toBe(503);
    expect(error.retryable).toBe(false);
    expect(error.retryAfterSec).toBeUndefined();
    expect(headers.get('Retry-After')).toBeNull();
    expect(headers.get('X-Sploot-Embedding-Outcome')).toBe('embedding_configuration');
    expect(headers.get('X-Sploot-Observability-Owner')).toBe('route');
    expect(captureOperationalError).toHaveBeenCalledTimes(1);
    expect(captureOperationalError).toHaveBeenCalledWith(expect.objectContaining({
      context,
      metadata: expect.objectContaining({ retryable: false, providerAttempt: false }),
    }));
  });

  it('does not let a wrapper create a second report or lose ownership', async () => {
    const cause = new EmbeddingConfigurationError('provider configuration is missing');
    const wrapper = new Error('embedding scheduling failed', { cause });
    Object.assign(wrapper, {
      statusCode: 503,
      retryable: false,
      reason: 'embedding_configuration',
    });

    await expect(reportEmbeddingConfigurationErrorOnce(cause, 'scheduler')).resolves.toBe(true);
    await expect(reportEmbeddingConfigurationErrorOnce(wrapper, 'route')).resolves.toBe(false);
    expect(new Headers(embeddingConfigurationHeaders(wrapper as never)).get('X-Sploot-Observability-Owner'))
      .toBe('route');
    expect(captureOperationalError).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Sentry is unconfigured', false],
    ['Sentry rejects the event', false],
  ])('%s never earns route ownership without confirmed emission', async (_label, emitted) => {
    captureOperationalError.mockReturnValue(emitted);
    const error = new EmbeddingConfigurationError('provider configuration is missing');

    await expect(reportEmbeddingConfigurationErrorOnce(error, 'falsifier')).resolves.toBe(false);
    expect(new Headers(embeddingConfigurationHeaders(error)).get('X-Sploot-Observability-Owner')).toBeNull();
    expect(new Headers(embeddingConfigurationHeaders(error)).get('X-Sploot-Embedding-Outcome'))
      .toBe('embedding_configuration');
  });
});
