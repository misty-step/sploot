import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { trackBrokenImageRatio } from '@/lib/performance-metrics';

describe('performance metric telemetry producer', () => {
  const fetchMock = vi.fn();
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleError.mockRestore();
  });

  it('maps the live ratio producer into the typed route envelope', () => {
    trackBrokenImageRatio(2, 100);

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      type: 'performance',
      payload: {
        metric: 'broken_images_ratio',
        value: 0.02,
        unit: 'ratio',
        tags: {
          broken_count: 2,
          total_count: 100,
          percent: '2.00',
          target: 1,
          met: false,
        },
        timestamp: expect.any(Number),
      },
    });
  });
});
