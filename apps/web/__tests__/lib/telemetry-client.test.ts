import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  postBlobLoadFailure,
  postPerformanceMetric,
  postUsageMetric,
} from '@/lib/telemetry-client';

describe('typed first-party telemetry client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the canonical performance envelope', async () => {
    await postPerformanceMetric({
      metric: 'broken_images_ratio',
      value: 0.02,
      unit: 'ratio',
      tags: { broken_count: 2, total_count: 100 },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: expect.any(String),
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      type: 'performance',
      payload: {
        metric: 'broken_images_ratio',
        value: 0.02,
        unit: 'ratio',
        tags: { broken_count: 2, total_count: 100 },
        timestamp: expect.any(Number),
      },
    });
  });

  it('posts blob-load failures without asset IDs or blob URLs', async () => {
    await postBlobLoadFailure(true);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      type: 'usage',
      payload: {
        action: 'blob_load_failure',
        count: 1,
        metadata: { fallbackAttempted: true },
        timestamp: expect.any(Number),
      },
    });
    expect(JSON.stringify(body)).not.toContain('assetId');
    expect(JSON.stringify(body)).not.toContain('blobUrl');
  });

  it('rejects a non-success response instead of silently accepting it', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));

    await expect(
      postUsageMetric({ action: 'blob_load_failure', count: 1 })
    ).rejects.toThrow('Telemetry request rejected (400)');
  });
});
