import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PERFORMANCE_TELEMETRY_SAMPLING,
  __resetPerformanceSamplingForTests,
  setupCLSTracking,
  trackBrokenImageRatio,
  trackFCP,
  trackLCP,
} from '@/lib/performance-metrics';

describe('performance metric telemetry producer', () => {
  const fetchMock = vi.fn();
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetPerformanceSamplingForTests();
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

describe('observer-driven performance sampling', () => {
  const fetchMock = vi.fn();
  let observerCallbacks: Array<(list: { getEntries: () => unknown[] }) => void>;
  let observeCalls: number;

  class FakePerformanceObserver {
    constructor(callback: (list: { getEntries: () => unknown[] }) => void) {
      observerCallbacks.push(callback);
    }
    observe() {
      observeCalls += 1;
    }
    disconnect() {}
  }

  const deliver = (entries: unknown[]) => {
    for (const callback of [...observerCallbacks]) {
      callback({ getEntries: () => entries });
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    __resetPerformanceSamplingForTests();
    observerCallbacks = [];
    observeCalls = 0;
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('PerformanceObserver', FakePerformanceObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sentMetrics = () =>
    fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).payload.metric);

  it('declares an explicit one-emit-per-page-load sampling default', () => {
    expect(PERFORMANCE_TELEMETRY_SAMPLING.maxEmitsPerMetricPerPageLoad).toBe(1);
  });

  it('emits a single CLS metric for many layout shifts across duplicate setups', () => {
    setupCLSTracking();
    setupCLSTracking();

    expect(observeCalls).toBe(1);

    for (let batch = 0; batch < 3; batch += 1) {
      deliver(
        Array.from({ length: 10 }, () => ({ hadRecentInput: false, value: 0.01 }))
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('pagehide'));

    expect(sentMetrics()).toEqual(['image_grid_cls']);
  });

  it('emits one LCP metric with the final candidate value', () => {
    trackLCP();

    deliver([{ renderTime: 800 }]);
    deliver([{ renderTime: 1400 }]);
    deliver([{ renderTime: 2100 }]);
    expect(fetchMock).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('pagehide'));

    expect(sentMetrics()).toEqual(['largest_contentful_paint']);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.payload.value).toBe(2100);
  });

  it('installs one FCP observer across repeated calls and emits once', () => {
    trackFCP();
    trackFCP();

    expect(observeCalls).toBe(1);

    deliver([{ name: 'first-contentful-paint', startTime: 900 }]);

    expect(sentMetrics()).toEqual(['first_contentful_paint']);
  });
});
