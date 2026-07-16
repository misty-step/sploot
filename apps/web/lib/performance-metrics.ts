import { logger } from '@/lib/observability-logger';
import { postPerformanceMetric } from '@/lib/telemetry-client';
import type {
  PerformanceMetricName,
  PerformanceMetricUnit,
  PerformanceTelemetryTags,
} from '@/lib/telemetry-contract';

/**
 * Performance Metrics Tracking
 *
 * Centralized utility for tracking and reporting performance metrics
 * to the telemetry API and browser console.
 */
interface PerformanceMetric {
  name: PerformanceMetricName;
  value: number;
  unit: PerformanceMetricUnit;
  tags?: PerformanceTelemetryTags;
}

interface CoreWebVitalsMetric extends PerformanceMetric {
  rating: 'good' | 'needs-improvement' | 'poor';
}

/**
 * Explicit app-side sampling policy for observer-driven metrics.
 *
 * PerformanceObserver streams entries continuously (multiple LCP candidates
 * per load, a layout-shift entry per shift). Without a bound, each entry
 * becomes a telemetry POST. Observer-driven metrics therefore emit at most
 * once per metric name per page load; the server's per-user rate limit and
 * body cap bound whatever remains.
 */
export const PERFORMANCE_TELEMETRY_SAMPLING = Object.freeze({
  maxEmitsPerMetricPerPageLoad: 1,
});

const emittedObserverMetrics = new Set<PerformanceMetricName>();
const installedObservers = new Set<PerformanceMetricName>();
const observerTeardowns: Array<() => void> = [];

function emitObserverMetricOnce(metric: PerformanceMetric): void {
  if (emittedObserverMetrics.has(metric.name)) return;
  emittedObserverMetrics.add(metric.name);
  trackMetric(metric);
}

export function __resetPerformanceSamplingForTests(): void {
  for (const teardown of observerTeardowns.splice(0)) teardown();
  emittedObserverMetrics.clear();
  installedObservers.clear();
}


/**
 * Track a performance metric
 * Logs to console in development and sends to telemetry in production
 */
export function trackMetric(metric: PerformanceMetric): void {
  const formattedValue =
    metric.unit === 'ms'
      ? `${metric.value.toFixed(2)}ms`
      : metric.unit === 'ratio'
      ? `${(metric.value * 100).toFixed(2)}%`
      : `${metric.value}${metric.unit === 'count' ? '' : ` ${metric.unit}`}`;

  // Always log in development
  if (process.env.NODE_ENV === 'development') {
    logger.logInfo('performance-metrics.metric', {
      name: metric.name,
      value: metric.value,
      unit: metric.unit,
      tags: metric.tags,
      formattedValue,
    });
  }

  // Send to telemetry endpoint (fire and forget)
  if (typeof window !== 'undefined') {
    sendToTelemetry(metric).catch((err) => {
      // Silently fail - metrics shouldn't break the app
      if (process.env.NODE_ENV === 'development') {
        console.warn('[metrics] Failed to send metric:', err);
      }
    });
  }
}

/**
 * Send metric to telemetry API
 */
async function sendToTelemetry(metric: PerformanceMetric): Promise<void> {
  await postPerformanceMetric({
    metric: metric.name,
    value: metric.value,
    unit: metric.unit,
    tags: metric.tags,
  });
}

/**
 * Track empty state render time
 * Measures time from component mount to first paint
 * Target: P95 < 100ms
 */
export function trackEmptyStateRender(startTime: number): void {
  const renderTime = performance.now() - startTime;

  trackMetric({
    name: 'time_to_empty_state',
    value: renderTime,
    unit: 'ms',
    tags: {
      target: 100, // P95 target
      met: renderTime < 100,
    },
  });
}

/**
 * Track broken image ratio
 * Monitors health of blob storage and asset references
 * Target: < 1%
 */
export function trackBrokenImageRatio(broken: number, total: number): void {
  const ratio = total > 0 ? broken / total : 0;
  const percentBroken = ratio * 100;

  trackMetric({
    name: 'broken_images_ratio',
    value: ratio,
    unit: 'ratio',
    tags: {
      broken_count: broken,
      total_count: total,
      percent: percentBroken.toFixed(2),
      target: 1, // Target < 1%
      met: percentBroken < 1,
    },
  });

  // Alert if threshold exceeded
  if (percentBroken > 1) {
    console.error(
      `[metrics] 🚨 Broken image ratio exceeded threshold: ${percentBroken.toFixed(2)}% (${broken}/${total})`
    );
  }
}

/**
 * Track Core Web Vitals for image grid
 * Measures Cumulative Layout Shift (CLS)
 * Target: CLS < 0.1
 */
export function trackImageGridCLS(clsValue: number): void {
  // CLS rating thresholds from web.dev
  const rating: CoreWebVitalsMetric['rating'] =
    clsValue <= 0.1 ? 'good' : clsValue <= 0.25 ? 'needs-improvement' : 'poor';

  trackMetric({
    name: 'image_grid_cls',
    value: clsValue,
    unit: 'score',
    tags: {
      rating,
      target: 0.1,
      met: clsValue < 0.1,
    },
  });

  // Log warning if CLS is poor
  if (rating === 'poor') {
    console.warn(
      `[metrics] Image grid CLS is poor: ${clsValue.toFixed(4)} (target: <0.1)`
    );
  }
}

function trackImageGridCLSOnce(clsValue: number): void {
  if (emittedObserverMetrics.has('image_grid_cls')) return;
  emittedObserverMetrics.add('image_grid_cls');
  trackImageGridCLS(clsValue);
}

/**
 * Track First Contentful Paint (FCP)
 * Measures time to first content render
 */
export function trackFCP(): void {
  if (typeof window === 'undefined' || !window.performance) return;
  if (installedObservers.has('first_contentful_paint')) return;

  // Use PerformanceObserver for accurate FCP measurement
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            emitObserverMetricOnce({
              name: 'first_contentful_paint',
              value: entry.startTime,
              unit: 'ms',
              tags: {
                rating: entry.startTime < 1800 ? 'good' : entry.startTime < 3000 ? 'needs-improvement' : 'poor',
              },
            });
            observer.disconnect();
          }
        }
      });

      observer.observe({ type: 'paint', buffered: true });
      installedObservers.add('first_contentful_paint');
      observerTeardowns.push(() => observer.disconnect());
    } catch (error) {
      // PerformanceObserver not supported
    }
  }
}

/**
 * Track Largest Contentful Paint (LCP)
 * Measures time to largest content render
 */
export function trackLCP(): void {
  if (typeof window === 'undefined' || !window.performance) return;
  if (installedObservers.has('largest_contentful_paint')) return;

  if ('PerformanceObserver' in window) {
    try {
      // LCP candidates stream until the page is backgrounded; emitting each
      // one floods the sink. Track the latest candidate and report the final
      // value exactly once when the page is hidden.
      let latestValue = 0;

      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as any;
        if (lastEntry) {
          latestValue = lastEntry.renderTime || lastEntry.loadTime || latestValue;
        }
      });

      const emitFinal = () => {
        observer.disconnect();
        if (latestValue <= 0) return;
        emitObserverMetricOnce({
          name: 'largest_contentful_paint',
          value: latestValue,
          unit: 'ms',
          tags: {
            rating: latestValue < 2500 ? 'good' : latestValue < 4000 ? 'needs-improvement' : 'poor',
          },
        });
      };

      const onVisibilityHidden = () => {
        if (document.visibilityState === 'hidden') emitFinal();
      };
      window.addEventListener('pagehide', emitFinal);
      document.addEventListener('visibilitychange', onVisibilityHidden);
      observerTeardowns.push(() => {
        window.removeEventListener('pagehide', emitFinal);
        document.removeEventListener('visibilitychange', onVisibilityHidden);
        observer.disconnect();
      });

      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      installedObservers.add('largest_contentful_paint');
    } catch (error) {
      // PerformanceObserver not supported
    }
  }
}

/**
 * Setup automatic CLS tracking for image grid
 * Uses PerformanceObserver to detect layout shifts
 */
export function setupCLSTracking(targetElement?: Element): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return;
  }

  // Grid remounts re-invoke this setup; a module-level singleton keeps one
  // observer and one pagehide listener per page load instead of stacking them.
  if (installedObservers.has('image_grid_cls')) {
    return;
  }

  let clsValue = 0;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only count layout shifts without recent user input
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });
    installedObservers.add('image_grid_cls');

    // Accumulate silently and report the final CLS exactly once when the
    // page is hidden; per-shift emission floods the telemetry sink.
    const onPageHide = () => {
      observer.disconnect();
      if (clsValue > 0) {
        trackImageGridCLSOnce(clsValue);
      }
    };
    window.addEventListener('pagehide', onPageHide);
    observerTeardowns.push(() => {
      window.removeEventListener('pagehide', onPageHide);
      observer.disconnect();
    });
  } catch (error) {
    // PerformanceObserver not supported
  }
}
