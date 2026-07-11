import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeGate } from '@/lib/runtime-gates';
import { createEmbeddingService, EmbeddingError } from '@/lib/embeddings';

describe('runtime gates', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults upload and embedding gates to enabled', () => {
    expect(getRuntimeGate('uploads')).toMatchObject({
      enabled: true,
      code: 'uploads_disabled',
    });
    expect(getRuntimeGate('embeddings')).toMatchObject({
      enabled: true,
      code: 'embeddings_disabled',
    });
  });

  it('treats false-like env values as disabled', () => {
    vi.stubEnv('SPLOOT_UPLOADS_ENABLED', 'false');
    vi.stubEnv('SPLOOT_EMBEDDINGS_ENABLED', 'off');

    expect(getRuntimeGate('uploads').enabled).toBe(false);
    expect(getRuntimeGate('embeddings').enabled).toBe(false);
  });

  it('blocks embedding service creation when the embeddings gate is disabled', () => {
    vi.stubEnv('SPLOOT_EMBEDDINGS_ENABLED', 'false');
    vi.stubEnv('REPLICATE_API_TOKEN', 'test-token');

    expect(() => createEmbeddingService('user-test')).toThrow(EmbeddingError);
    expect(() => createEmbeddingService('user-test')).toThrow('Embedding generation is temporarily paused');
  });
});
