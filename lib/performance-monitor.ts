/**
 * Performance Monitor - Track operation durations with percentile calculations
 *
 * Maintains circular buffer of last 100 samples per operation.
 * Integrates with Analytics Service for visualization.
 */

import { logger } from '@/lib/observability-logger';
import { trackTiming } from './analytics';

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

// Operation name constants (mirrors existing PERF_OPERATIONS)
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

export type PerfOperation = typeof PERF_OPERATIONS[keyof typeof PERF_OPERATIONS];

const MAX_SAMPLES = 100;

export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private startTimes: Map<string, number> = new Map();

  startTiming(operation: string): void {
    this.startTimes.set(operation, Date.now());
  }

  endTiming(operation: string): number | undefined {
    const startTime = this.startTimes.get(operation);
    if (startTime === undefined) {
      console.warn(`[perf] endTiming() called for '${operation}' without matching startTiming()`);
      return undefined;
    }

    const duration = Date.now() - startTime;
    this.track(operation, duration);
    this.startTimes.delete(operation);

    // Send to Analytics Service
    try {
      trackTiming(operation, duration, true);
    } catch (error) {
      console.error('[perf] Failed to send timing to analytics:', error);
    }

    return duration;
  }

  async measureAsync<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    this.startTiming(operation);
    try {
      const result = await fn();
      this.endTiming(operation);
      return result;
    } catch (error) {
      this.trackFailure(operation);
      throw error;
    }
  }

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
    const duration = this.endTiming(operation);
    if (duration !== undefined) {
      try {
        trackTiming(operation, duration, false);
      } catch (error) {
        console.error('[perf] Failed to track failure timing:', error);
      }
    }
  }
}

let globalMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}
