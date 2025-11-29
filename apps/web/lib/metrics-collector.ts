import { logger } from '@/lib/observability-logger';

/**
 * Performance Metrics Collection
 *
 * Tracks every aspect of upload performance including throughput,
 * API latencies, memory usage, and error rates for comprehensive
 * monitoring and debugging at scale.
 */
export interface UploadMetrics {
  startTime: number;
  bytesUploaded: number;
  chunks: number;
  retries: number;
  throughput?: number; // bytes/sec
  completed?: boolean;
  failed?: boolean;
}

export interface ApiMetrics {
  count: number;
  totalDuration: number;
  errors: number;
  histogram: Map<number, number>;
}

export interface MemoryMetrics {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface ErrorMetrics {
  message: string;
  type: string;
  count: number;
  lastOccurred: number;
}

export interface MetricsReport {
  uploads: {
    total: number;
    completed: number;
    failed: number;
    avgThroughput: number;
    totalBytes: number;
    inProgress: number;
  };
  api: Record<string, {
    requests: number;
    avgDuration: number;
    errorRate: number;
    p50: number;
    p95: number;
    p99: number;
  }>;
  memory: {
    current: number;
    peak: number;
    average: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
}

class MetricsCollector {
  private static instance: MetricsCollector;

  private metrics = {
    uploads: new Map<string, UploadMetrics>(),
    api: new Map<string, ApiMetrics>(),
    memory: new Map<number, MemoryMetrics>(),
    errors: new Map<string, ErrorMetrics>()
  };

  private readonly HISTOGRAM_BUCKETS = [
    10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000
  ];

  private memoryInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Start memory monitoring
    this.startMemoryMonitoring();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Record the start of an upload
   */
  recordUploadStart(id: string): void {
    this.metrics.uploads.set(id, {
      startTime: performance.now(),
      bytesUploaded: 0,
      chunks: 0,
      retries: 0
    });
  }

  /**
   * Record upload progress
   */
  recordUploadProgress(id: string, bytes: number): void {
    const metric = this.metrics.uploads.get(id);
    if (metric) {
      metric.bytesUploaded += bytes;
      metric.chunks++;

      // Calculate throughput
      const elapsed = performance.now() - metric.startTime;
      metric.throughput = metric.bytesUploaded / (elapsed / 1000); // bytes/sec
    }
  }

  /**
   * Record upload completion
   */
  recordUploadComplete(id: string): void {
    const metric = this.metrics.uploads.get(id);
    if (metric) {
      metric.completed = true;
      const elapsed = performance.now() - metric.startTime;
      metric.throughput = metric.bytesUploaded / (elapsed / 1000);

      logger.logInfo('metrics.upload-complete', {
        uploadId: id,
        durationSeconds: Number((elapsed / 1000).toFixed(2)),
        sizeMb: Number((metric.bytesUploaded / 1024 / 1024).toFixed(2)),
        throughputMbPerSec: Number((metric.throughput / 1024 / 1024).toFixed(2)),
        chunks: metric.chunks,
        retries: metric.retries,
      });
    }
  }

  /**
   * Record upload failure
   */
  recordUploadFailure(id: string, error: string): void {
    const metric = this.metrics.uploads.get(id);
    if (metric) {
      metric.failed = true;
      metric.retries++;
    }
    this.recordError('upload_failure', error);
  }

  /**
   * Record an API call
   */
  recordApiCall(endpoint: string, duration: number, status: number): void {
    if (!this.metrics.api.has(endpoint)) {
      this.metrics.api.set(endpoint, {
        count: 0,
        totalDuration: 0,
        errors: 0,
        histogram: new Map()
      });
    }

    const metric = this.metrics.api.get(endpoint)!;
    metric.count++;
    metric.totalDuration += duration;

    if (status >= 400) {
      metric.errors++;
    }

    // Update histogram
    const bucket = this.HISTOGRAM_BUCKETS.find(b => duration <= b) || Infinity;
    metric.histogram.set(bucket, (metric.histogram.get(bucket) || 0) + 1);
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage(): void {
    if (typeof window !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      const now = Date.now();

      this.metrics.memory.set(now, {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      });

      // Keep only last 5 minutes of data
      const cutoff = now - 5 * 60 * 1000;
      for (const [timestamp] of this.metrics.memory) {
        if (timestamp < cutoff) {
          this.metrics.memory.delete(timestamp);
        } else {
          break; // Map maintains insertion order, so we can break early
        }
      }
    }
  }

  /**
   * Record an error
   */
  recordError(type: string, message: string): void {
    const key = `${type}:${message}`;
    const existing = this.metrics.errors.get(key);

    if (existing) {
      existing.count++;
      existing.lastOccurred = Date.now();
    } else {
      this.metrics.errors.set(key, {
        type,
        message,
        count: 1,
        lastOccurred: Date.now()
      });
    }
  }

  /**
   * Get comprehensive metrics report
   */
  getReport(): MetricsReport {
    const report: MetricsReport = {
      uploads: {
        total: this.metrics.uploads.size,
        completed: 0,
        failed: 0,
        avgThroughput: 0,
        totalBytes: 0,
        inProgress: 0
      },
      api: {},
      memory: {
        current: 0,
        peak: 0,
        average: 0
      },
      errors: {
        total: 0,
        byType: {}
      }
    };

    // Calculate upload metrics
    let totalThroughput = 0;
    let throughputCount = 0;

    for (const [_id, metric] of this.metrics.uploads) {
      report.uploads.totalBytes += metric.bytesUploaded;

      if (metric.completed) {
        report.uploads.completed++;
      } else if (metric.failed) {
        report.uploads.failed++;
      } else {
        report.uploads.inProgress++;
      }

      if (metric.throughput) {
        totalThroughput += metric.throughput;
        throughputCount++;
      }
    }

    if (throughputCount > 0) {
      report.uploads.avgThroughput = totalThroughput / throughputCount;
    }

    // Calculate API metrics
    for (const [endpoint, metric] of this.metrics.api) {
      report.api[endpoint] = {
        requests: metric.count,
        avgDuration: metric.count > 0 ? metric.totalDuration / metric.count : 0,
        errorRate: metric.count > 0 ? metric.errors / metric.count : 0,
        p50: this.calculatePercentile(metric.histogram, 0.5),
        p95: this.calculatePercentile(metric.histogram, 0.95),
        p99: this.calculatePercentile(metric.histogram, 0.99)
      };
    }

    // Calculate memory metrics
    const memoryValues = Array.from(this.metrics.memory.values());
    if (memoryValues.length > 0) {
      report.memory.current = memoryValues[memoryValues.length - 1].usedJSHeapSize;
      report.memory.peak = Math.max(...memoryValues.map(m => m.usedJSHeapSize));
      report.memory.average = memoryValues.reduce((sum, m) => sum + m.usedJSHeapSize, 0) / memoryValues.length;
    }

    // Calculate error metrics
    for (const error of this.metrics.errors.values()) {
      report.errors.total += error.count;
      report.errors.byType[error.type] = (report.errors.byType[error.type] || 0) + error.count;
    }

    return report;
  }

  /**
   * Calculate percentile from histogram
   */
  private calculatePercentile(histogram: Map<number, number>, percentile: number): number {
    const total = Array.from(histogram.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    const target = Math.ceil(total * percentile);
    let count = 0;

    // Sort buckets to ensure correct order
    const sortedBuckets = Array.from(histogram.entries()).sort((a, b) => a[0] - b[0]);

    for (const [bucket, frequency] of sortedBuckets) {
      count += frequency;
      if (count >= target) {
        return bucket === Infinity ? sortedBuckets[sortedBuckets.length - 2]?.[0] || 0 : bucket;
      }
    }

    return 0;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.uploads.clear();
    this.metrics.api.clear();
    this.metrics.memory.clear();
    this.metrics.errors.clear();
  }

  /**
   * Start automatic memory monitoring
   */
  private startMemoryMonitoring(): void {
    if (typeof window === 'undefined') return;

    // Record memory every second
    this.memoryInterval = setInterval(() => {
      this.recordMemoryUsage();
    }, 1000);

    // Initial recording
    this.recordMemoryUsage();
  }

  /**
   * Stop memory monitoring
   */
  stopMemoryMonitoring(): void {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics(): string {
    return JSON.stringify(this.getReport(), null, 2);
  }

  /**
   * Get upload metrics for a specific ID
   */
  getUploadMetrics(id: string): UploadMetrics | undefined {
    return this.metrics.uploads.get(id);
  }

  /**
   * Get API metrics for a specific endpoint
   */
  getApiMetrics(endpoint: string): ApiMetrics | undefined {
    return this.metrics.api.get(endpoint);
  }

  /**
   * Get recent errors (last 100)
   */
  getRecentErrors(limit: number = 100): ErrorMetrics[] {
    return Array.from(this.metrics.errors.values())
      .sort((a, b) => b.lastOccurred - a.lastOccurred)
      .slice(0, limit);
  }

  /**
   * Calculate bytes formatted string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Calculate duration formatted string
   */
  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
}

// Export singleton getter
export function getGlobalMetricsCollector(): MetricsCollector {
  return MetricsCollector.getInstance();
}

// React hook for metrics
export function useMetrics() {
  const React = require('react');
  const collector = getGlobalMetricsCollector();
  const [report, setReport] = React.useState(
    typeof window !== 'undefined' ? collector.getReport() : null as MetricsReport | null
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const interval = setInterval(() => {
      setReport(collector.getReport());
    }, 1000);

    return () => clearInterval(interval);
  }, [collector]);

  if (typeof window === 'undefined') {
    return {
      report: null as MetricsReport | null,
      collector: null as MetricsCollector | null,
    };
  }

  return {
    report,
    collector,
  };
}

// Wrapper for API calls with automatic metrics
export async function fetchWithMetrics(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const collector = getGlobalMetricsCollector();
  const startTime = performance.now();

  try {
    const response = await fetch(url, init);
    const duration = performance.now() - startTime;

    // Extract endpoint from URL
    const endpoint = new URL(url, window.location.origin).pathname;
    collector.recordApiCall(endpoint, duration, response.status);

    return response;
  } catch (error) {
    const duration = performance.now() - startTime;
    const endpoint = new URL(url, window.location.origin).pathname;

    collector.recordApiCall(endpoint, duration, 0);
    collector.recordError('fetch', error instanceof Error ? error.message : 'Unknown error');

    throw error;
  }
}

// Export types
export type { MetricsCollector };
