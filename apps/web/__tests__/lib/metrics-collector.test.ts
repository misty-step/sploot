import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getGlobalMetricsCollector } from '@/lib/metrics-collector';

describe('MetricsCollector', () => {
  let collector: ReturnType<typeof getGlobalMetricsCollector>;

  beforeEach(() => {
    collector = getGlobalMetricsCollector();
    collector.clear();
  });

  afterEach(() => {
    collector.stopMemoryMonitoring();
  });

  describe('Upload Metrics', () => {
    it('should track upload lifecycle', () => {
      const uploadId = 'test-upload-1';

      // Start upload
      collector.recordUploadStart(uploadId);
      let metrics = collector.getUploadMetrics(uploadId);
      expect(metrics).toBeDefined();
      expect(metrics?.bytesUploaded).toBe(0);

      // Record progress
      collector.recordUploadProgress(uploadId, 1024);
      collector.recordUploadProgress(uploadId, 2048);
      metrics = collector.getUploadMetrics(uploadId);
      expect(metrics?.bytesUploaded).toBe(3072);
      expect(metrics?.chunks).toBe(2);

      // Complete upload
      collector.recordUploadComplete(uploadId);
      metrics = collector.getUploadMetrics(uploadId);
      expect(metrics?.completed).toBe(true);
      expect(metrics?.throughput).toBeGreaterThan(0);
    });

    it('should track upload failures', () => {
      const uploadId = 'test-upload-2';

      collector.recordUploadStart(uploadId);
      collector.recordUploadFailure(uploadId, 'Network error');

      const metrics = collector.getUploadMetrics(uploadId);
      expect(metrics?.failed).toBe(true);
      expect(metrics?.retries).toBe(1);

      const errors = collector.getRecentErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toBe('Network error');
    });
  });

  describe('API Metrics', () => {
    it('should track API calls with percentiles', () => {
      const endpoint = '/api/upload';

      // Record multiple API calls with different durations
      collector.recordApiCall(endpoint, 20, 200);
      collector.recordApiCall(endpoint, 50, 200);
      collector.recordApiCall(endpoint, 100, 200);
      collector.recordApiCall(endpoint, 150, 200);
      collector.recordApiCall(endpoint, 200, 500);

      const report = collector.getReport();
      const apiMetrics = report.api[endpoint];

      expect(apiMetrics).toBeDefined();
      expect(apiMetrics.requests).toBe(5);
      expect(apiMetrics.avgDuration).toBe(104);
      expect(apiMetrics.errorRate).toBe(0.2);
      expect(apiMetrics.p50).toBeGreaterThan(0);
      expect(apiMetrics.p95).toBeGreaterThan(0);
      expect(apiMetrics.p99).toBeGreaterThan(0);
    });
  });

  describe('Memory Metrics', () => {
    it('should track memory usage if available', () => {
      // Mock performance.memory for testing
      const originalMemory = (global.performance as any).memory;
      (global.performance as any).memory = {
        usedJSHeapSize: 100 * 1024 * 1024,
        totalJSHeapSize: 200 * 1024 * 1024,
        jsHeapSizeLimit: 400 * 1024 * 1024,
      };

      collector.recordMemoryUsage();

      const report = collector.getReport();
      expect(report.memory.current).toBe(100 * 1024 * 1024);

      // Restore original
      if (originalMemory) {
        (global.performance as any).memory = originalMemory;
      } else {
        delete (global.performance as any).memory;
      }
    });
  });

  describe('Comprehensive Report', () => {
    it('should generate complete metrics report', () => {
      // Add various metrics
      collector.recordUploadStart('upload-1');
      collector.recordUploadProgress('upload-1', 1024 * 1024);
      collector.recordUploadComplete('upload-1');

      collector.recordUploadStart('upload-2');
      collector.recordUploadFailure('upload-2', 'Timeout');

      collector.recordApiCall('/api/upload', 100, 200);
      collector.recordApiCall('/api/assets', 50, 200);

      collector.recordError('network', 'Connection refused');
      collector.recordError('validation', 'Invalid file type');

      const report = collector.getReport();

      expect(report.uploads.total).toBe(2);
      expect(report.uploads.completed).toBe(1);
      expect(report.uploads.failed).toBe(1);
      expect(report.uploads.totalBytes).toBe(1024 * 1024);

      expect(Object.keys(report.api).length).toBe(2);

      expect(report.errors.total).toBe(3); // 2 manual + 1 from failure
      expect(report.errors.byType.network).toBe(1);
      expect(report.errors.byType.validation).toBe(1);
    });
  });

  describe('Utility Functions', () => {
    it('should format bytes correctly', () => {
      const { formatBytes } = getGlobalMetricsCollector().constructor as any;
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    });

    it('should format duration correctly', () => {
      const { formatDuration } = getGlobalMetricsCollector().constructor as any;
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(65000)).toBe('1.1m');
    });
  });
});