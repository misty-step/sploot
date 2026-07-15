import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogInfo } = vi.hoisted(() => ({ mockLogInfo: vi.fn() }));

vi.mock('@/lib/observability-logger', () => ({
  logger: { logInfo: mockLogInfo },
}));

import { track, trackFlow, trackServer, trackTiming } from '@/lib/analytics';

describe('provider-neutral analytics facade', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'doNotTrack', {
      value: null,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends sanitized client events to the first-party telemetry route', () => {
    track({
      name: 'upload_completed',
      properties: {
        duration: 120,
        size: 2048,
        // @ts-expect-error exercise the runtime property allowlist
        userEmail: 'secret@example.com',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/telemetry', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      signal: expect.any(AbortSignal),
      body: expect.any(String),
    }));
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request).toMatchObject({
      type: 'analytics',
      payload: {
        name: 'upload_completed',
        properties: {
          duration: 120,
          size: 2048,
        },
      },
    });
    expect(request.payload.timestamp).toEqual(expect.any(Number));
  });

  it('drops raw search text and direct identity before transport', () => {
    const rawQuery = 'medical diagnosis reaction meme';

    track({
      name: 'search_no_results',
      properties: {
        queryLength: rawQuery.length,
        hasFilters: true,
        query: rawQuery,
        userId: 'user_private_123',
      },
    } as Parameters<typeof track>[0]);

    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.payload.properties).toEqual({
      queryLength: rawQuery.length,
      hasFilters: true,
    });
    expect(JSON.stringify(request)).not.toContain(rawQuery);
    expect(JSON.stringify(request)).not.toContain('user_private_123');
  });

  it('respects Do Not Track', () => {
    Object.defineProperty(navigator, 'doNotTrack', {
      value: '1',
      writable: true,
      configurable: true,
    });

    track({
      name: 'asset_favorited',
      properties: {},
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs server events through the structured logger', async () => {
    await trackServer({
      name: 'search_results_shown',
      properties: { count: 4, latency: 18, hasFilters: false },
    });

    expect(mockLogInfo).toHaveBeenCalledWith('analytics:event', {
      name: 'search_results_shown',
      properties: { count: 4, latency: 18, hasFilters: false },
    });
  });

  it('routes flow and timing events through the same first-party endpoint', () => {
    trackFlow('upload_wizard', 'selected', { count: 2 });
    trackTiming('upload:single', 45, true, { size: 100 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const payloads = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(payloads[0].payload).toMatchObject({
      name: 'flow:upload_wizard:selected',
      properties: { count: 2 },
    });
    expect(payloads[1].payload).toMatchObject({
      name: 'timing:upload:single',
      properties: { duration: 45, success: true, size: 100 },
    });
  });

  it('never lets telemetry transport failure break the caller or console cleanliness', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network gone'));

    expect(() => {
      track({
        name: 'upload_failed',
        properties: { reason: 'network', size: 5 },
      });
    }).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
