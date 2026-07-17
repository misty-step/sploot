import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  postBlobLoadFailure,
  postPerformanceMetric,
  postUsageMetric,
  resolveTelemetrySink,
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

    expect(fetchMock).toHaveBeenCalledWith('/api/telemetry', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      signal: expect.any(AbortSignal),
      body: expect.any(String),
    }));
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

  it('bounds a non-success response without surfacing a product error', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));

    await expect(postUsageMetric({ action: 'blob_load_failure', count: 1 })).resolves.toBe(false);
  });

  it('does not call a disabled sink or throw when the sink is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('sink offline'));

    await expect(postUsageMetric({ action: 'blob_load_failure', count: 1 }, {
      endpoint: '/api/telemetry', enabled: false, timeoutMs: 10,
    })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(postUsageMetric({ action: 'blob_load_failure', count: 1 }, {
      endpoint: '/api/telemetry', enabled: true, timeoutMs: 10,
    })).resolves.toBe(false);
  });

  it('keeps sink configuration same-origin and explicitly disableable', () => {
    expect(resolveTelemetrySink({
      NEXT_PUBLIC_TELEMETRY_ENDPOINT: 'https://collector.example.test/events',
      NEXT_PUBLIC_TELEMETRY_ENABLED: 'true',
    })).toMatchObject({ endpoint: '/api/telemetry', enabled: true });

    expect(resolveTelemetrySink({
      NEXT_PUBLIC_TELEMETRY_ENDPOINT: '/internal/telemetry',
      NEXT_PUBLIC_TELEMETRY_ENABLED: 'false',
    })).toMatchObject({ endpoint: '/internal/telemetry', enabled: false });

    expect(resolveTelemetrySink({
      // WHATWG URL parsing turns a slash-backslash prefix into a remote
      // authority; it must not bypass the same-origin policy.
      NEXT_PUBLIC_TELEMETRY_ENDPOINT: '/\\collector.example/events',
      NEXT_PUBLIC_TELEMETRY_ENABLED: 'true',
    })).toMatchObject({ endpoint: '/api/telemetry', enabled: true });
  });
});
