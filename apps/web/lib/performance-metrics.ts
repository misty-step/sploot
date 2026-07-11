import { logger } from '@/lib/observability-logger';
import { postPerformanceMetric } from '@/lib/telemetry-client';
import type {
  PerformanceMetricName,
  PerformanceMetricUnit,
  TelemetryMetadata,
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
  tags?: TelemetryMetadata;
}

interface CoreWebVitalsMetric extends PerformanceMetric {
  rating: 'good' | 'needs-improvement' | 'poor';
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

/**
 * Track First Contentful Paint (FCP)
 * Measures time to first content render
 */
export function trackFCP(): void {
  if (typeof window === 'undefined' || !window.performance) return;

  // Use PerformanceObserver for accurate FCP measurement
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            trackMetric({
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

  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as any;

        trackMetric({
          name: 'largest_contentful_paint',
          value: lastEntry.renderTime || lastEntry.loadTime,
          unit: 'ms',
          tags: {
            rating: lastEntry.renderTime < 2500 ? 'good' : lastEntry.renderTime < 4000 ? 'needs-improvement' : 'poor',
          },
        });
      });

      observer.observe({ type: 'largest-contentful-paint', buffered: true });
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

  let clsValue = 0;
  let clsEntries: PerformanceEntry[] = [];

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only count layout shifts without recent user input
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
          clsEntries.push(entry);
        }
      }

      // Track CLS every 5 seconds (throttled)
      if (clsEntries.length > 0 && clsEntries.length % 10 === 0) {
        trackImageGridCLS(clsValue);
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });

    // Track final CLS on page unload
    window.addEventListener('pagehide', () => {
      if (clsValue > 0) {
        trackImageGridCLS(clsValue);
      }
      observer.disconnect();
    });
  } catch (error) {
    // PerformanceObserver not supported
  }
}
