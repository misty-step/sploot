/**
 * Performance Monitor - Track operation durations with percentile calculations
 *
 * Maintains circular buffer of last 100 samples per operation.
 * Integrates with Analytics Service for visualization.
 */

import { nanoid } from 'nanoid';
import { logger } from '@/lib/observability-logger';
import { trackTiming } from './analytics';

/**
 * Aggregated timing statistics for a monitored operation.
 *
 * @public
 */
export interface PerformanceSummary {
  operation: string;
  samples: number;
  average: number;
  median: number;
  min: number;
  max: number;
  p95: number;
  p99: number;
}

/**
 * Canonical operation identifiers used when tracking performance.
 *
 * @public
 */
export const PERF_OPERATIONS = {
  // Upload operations
  UPLOAD_SINGLE: 'upload:single',
  UPLOAD_BATCH: 'upload:batch',
  UPLOAD_TO_BLOB: 'upload:blob_storage',
  UPLOAD_TO_DB: 'upload:database_write',
  UPLOAD_TOTAL: 'upload:total',

  // Embedding operations
  EMBEDDING_GENERATE: 'embedding:generate',
  EMBEDDING_QUEUE_WAIT: 'embedding:queue_wait',
  EMBEDDING_REPLICATE_API: 'embedding:replicate_api',
  EMBEDDING_DB_WRITE: 'embedding:db_write',
  EMBEDDING_TOTAL: 'embedding:total',

  // Search operations
  SEARCH_TEXT_EMBEDDING: 'search:text_embedding',
  SEARCH_VECTOR_QUERY: 'search:vector_query',
  SEARCH_TOTAL: 'search:total',

  // Client operations
  CLIENT_FILE_SELECT: 'client:file_select',
  CLIENT_UPLOAD_START: 'client:upload_start',
  CLIENT_TO_SEARCHABLE: 'client:to_searchable',
  CLIENT_PAGE_LOAD: 'client:page_load',
  CLIENT_IMAGE_GRID_RENDER: 'client:image_grid_render',

  // Database operations
  DB_QUERY: 'db:query',
  DB_WRITE: 'db:write',
  DB_TRANSACTION: 'db:transaction',
} as const;

/**
 * Union of valid performance operation strings.
 *
 * @public
 */
export type PerfOperation = typeof PERF_OPERATIONS[keyof typeof PERF_OPERATIONS];

const MAX_SAMPLES = 100;

/**
 * Records timing metrics, calculates percentiles, and relays timing events to analytics.
 *
 * @public
 */
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private startTimes: Map<string, number> = new Map();

  /**
   * Mark the beginning of an operation timing window.
   *
   * @param operation - Operation identifier to start tracking.
   */
  startTiming(operation: string): void {
    this.startTimes.set(operation, Date.now());
  }

  /**
   * Finish timing for an operation started via {@link startTiming}.
   *
   * @param operation - Operation identifier to end.
   * @returns Duration in milliseconds or `undefined` if no start was recorded.
   */
  endTiming(operation: string): number | undefined {
    const duration = this.takeDuration(operation, 'endTiming');
    if (duration === undefined) {
      return undefined;
    }

    this.track(operation, duration);

    // Send to Analytics Service
    try {
      trackTiming(operation, duration, true);
    } catch (error) {
      console.error('[perf] Failed to send timing to analytics:', error);
    }

    return duration;
  }

  /**
   * Measure an async function, automatically tracking timing and failures.
   *
   * Uses a unique timing key per invocation to avoid conflicts when the same
   * operation is measured concurrently across multiple requests.
   *
   * @param operation - Operation identifier to record.
   * @param fn - Async work to execute.
   * @returns Result of the async function.
   */
  async measureAsync<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    // Generate unique timing key to support concurrent measurements of the same operation
    const timingKey = `${operation}:${nanoid(6)}`;
    this.startTiming(timingKey);

    try {
      const result = await fn();
      const duration = this.takeDuration(timingKey, 'endTiming');

      if (duration !== undefined) {
        this.track(operation, duration);

        try {
          trackTiming(operation, duration, true);
        } catch (error) {
          console.error('[perf] Failed to send timing to analytics:', error);
        }
      }

      return result;
    } catch (error) {
      const duration = this.takeDuration(timingKey, 'trackFailure');

      if (duration !== undefined) {
        this.track(operation, duration);

        try {
          trackTiming(operation, duration, false);
        } catch (err) {
          console.error('[perf] Failed to track failure timing:', err);
        }
      }

      throw error;
    }
  }

  /**
   * Retrieve summary statistics for an operation.
   *
   * @param operation - Operation identifier to summarize.
   * @returns Performance summary or `null` if no samples captured.
   */
  getSummary(operation: string): PerformanceSummary | null {
    const samples = this.metrics.get(operation);
    if (!samples || samples.length === 0) {
      return null;
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const len = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mid = Math.floor(len / 2);

    return {
      operation,
      samples: len,
      average: sum / len,
      median: len % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
      min: sorted[0],
      max: sorted[len - 1],
      p95: sorted[Math.max(0, Math.ceil(len * 0.95) - 1)],
      p99: sorted[Math.max(0, Math.ceil(len * 0.99) - 1)],
    };
  }

  /**
   * Clear all recorded timings and start markers.
   */
  reset(): void {
    this.metrics.clear();
    this.startTimes.clear();
  }

  private track(operation: string, duration: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const samples = this.metrics.get(operation)!;
    samples.push(duration);

    if (samples.length > MAX_SAMPLES) {
      samples.shift();
    }

    if (typeof window !== 'undefined' && localStorage.getItem('debug_performance') === 'true') {
      logger.logInfo('performance-monitor.debug', {
        operation,
        durationMs: duration,
      });
    }
  }

  private trackFailure(operation: string): void {
    const duration = this.takeDuration(operation, 'trackFailure');
    if (duration === undefined) {
      return;
    }

    this.track(operation, duration);

    try {
      trackTiming(operation, duration, false);
    } catch (error) {
      console.error('[perf] Failed to track failure timing:', error);
    }
  }

  private takeDuration(
    operation: string,
    context: 'endTiming' | 'trackFailure'
  ): number | undefined {
    const startTime = this.startTimes.get(operation);
    if (startTime === undefined) {
      const source = context === 'endTiming' ? 'endTiming()' : 'trackFailure()';
      console.warn(`[perf] ${source} called for '${operation}' without matching startTiming()`);
      return undefined;
    }

    this.startTimes.delete(operation);
    return Date.now() - startTime;
  }
}

let globalMonitor: PerformanceMonitor | null = null;

/**
 * Return the shared singleton {@link PerformanceMonitor} instance.
 *
 * @returns Global performance monitor.
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}
