import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getPerformanceMonitor, PERF_OPERATIONS } from '@/lib/performance-monitor';
import { trackTiming } from '@/lib/analytics';

// Mock Analytics
vi.mock('@/lib/analytics', () => ({
  trackTiming: vi.fn(),
}));

describe('Performance Monitor', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the singleton
    const monitor = getPerformanceMonitor();
    monitor.reset();

    // Spy on console methods
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Clear localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('debug_performance');
    }
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('startTiming() + endTiming()', () => {
    it('should measure duration correctly', () => {
      const monitor = getPerformanceMonitor();
      const startTime = Date.now();

      monitor.startTiming('test_operation');

      // Simulate some work
      const endTime = Date.now();
      const duration = monitor.endTiming('test_operation');

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(endTime - startTime + 10); // Allow 10ms tolerance
    });

    it('should track multiple operations independently', () => {
      const monitor = getPerformanceMonitor();

      monitor.startTiming('operation1');
      monitor.startTiming('operation2');

      const duration1 = monitor.endTiming('operation1');
      const duration2 = monitor.endTiming('operation2');

      expect(duration1).toBeDefined();
      expect(duration2).toBeDefined();
    });

    it('should call trackTiming() on endTiming()', () => {
      const monitor = getPerformanceMonitor();

      monitor.startTiming('test_operation');
      const duration = monitor.endTiming('test_operation');

      expect(vi.mocked(trackTiming)).toHaveBeenCalledWith('test_operation', duration, true);
    });
  });

  describe('endTiming() without startTiming()', () => {
    it('should log warning and return undefined', () => {
      const monitor = getPerformanceMonitor();

      const duration = monitor.endTiming('never_started');

      expect(duration).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[perf] endTiming() called for 'never_started' without matching startTiming()"
      );
    });

    it('should not call trackTiming() when no start time exists', () => {
      const monitor = getPerformanceMonitor();

      monitor.endTiming('never_started');

      expect(vi.mocked(trackTiming)).not.toHaveBeenCalled();
    });
  });

  describe('measureAsync()', () => {
    it('should time async operations correctly', async () => {
      const monitor = getPerformanceMonitor();

      const result = await monitor.measureAsync('async_op', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'test_result';
      });

      expect(result).toBe('test_result');
      expect(vi.mocked(trackTiming)).toHaveBeenCalled();

      const summary = monitor.getSummary('async_op');
      expect(summary).not.toBeNull();
      expect(summary!.samples).toBe(1);
      expect(summary!.average).toBeGreaterThan(0);
    });

    it('should track failed operations', async () => {
      const monitor = getPerformanceMonitor();

      await expect(
        monitor.measureAsync('failing_op', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(vi.mocked(trackTiming)).toHaveBeenCalledTimes(1);
      const [operation, duration, success] = vi.mocked(trackTiming).mock.calls[0];
      expect(operation).toBe('failing_op');
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(success).toBe(false);

      const summary = monitor.getSummary('failing_op');
      expect(summary).not.toBeNull();
      expect(summary!.samples).toBe(1);
    });

    it('should rethrow errors from async operations', async () => {
      const monitor = getPerformanceMonitor();

      await expect(
        monitor.measureAsync('error_op', async () => {
          throw new Error('Original error');
        })
      ).rejects.toThrow('Original error');
    });
  });

  describe('Circular buffer', () => {
    it('should limit to 100 samples per operation', () => {
      const monitor = getPerformanceMonitor();

      // Add 150 samples
      for (let i = 0; i < 150; i++) {
        monitor.startTiming('buffer_test');
        monitor.endTiming('buffer_test');
      }

      const summary = monitor.getSummary('buffer_test');
      expect(summary).not.toBeNull();
      expect(summary!.samples).toBe(100);
    });

    it('should keep most recent samples', () => {
      const monitor = getPerformanceMonitor();

      // Add samples with known timing
      for (let i = 0; i < 110; i++) {
        monitor.startTiming('recent_test');
        // Immediately end to get minimal duration
        monitor.endTiming('recent_test');
      }

      const summary = monitor.getSummary('recent_test');
      expect(summary!.samples).toBe(100);
      // Oldest 10 samples should be discarded
    });
  });

  describe('Percentile calculations', () => {
    it('should calculate P50 (median) correctly for odd number of samples', () => {
      const monitor = getPerformanceMonitor();

      // Manually inject samples: [10, 20, 30, 40, 50]
      for (const duration of [10, 20, 30, 40, 50]) {
        monitor.startTiming('p50_odd');
        // Mock the duration by manipulating time
        const startTime = Date.now() - duration;
        (monitor as any).startTimes.set('p50_odd', startTime);
        monitor.endTiming('p50_odd');
      }

      const summary = monitor.getSummary('p50_odd');
      expect(summary).not.toBeNull();
      expect(summary!.median).toBe(30); // Middle value
    });

    it('should calculate P50 (median) correctly for even number of samples', () => {
      const monitor = getPerformanceMonitor();

      // Manually inject samples: [10, 20, 30, 40]
      for (const duration of [10, 20, 30, 40]) {
        monitor.startTiming('p50_even');
        const startTime = Date.now() - duration;
        (monitor as any).startTimes.set('p50_even', startTime);
        monitor.endTiming('p50_even');
      }

      const summary = monitor.getSummary('p50_even');
      expect(summary).not.toBeNull();
      expect(summary!.median).toBe(25); // Average of 20 and 30
    });

    it('should calculate P95 correctly', () => {
      const monitor = getPerformanceMonitor();

      // Add 100 samples from 1-100
      for (let i = 1; i <= 100; i++) {
        monitor.startTiming('p95_test');
        const startTime = Date.now() - i;
        (monitor as any).startTimes.set('p95_test', startTime);
        monitor.endTiming('p95_test');
      }

      const summary = monitor.getSummary('p95_test');
      expect(summary).not.toBeNull();
      // P95 of 1-100 should be 95
      expect(summary!.p95).toBe(95);
    });

    it('should calculate P99 correctly', () => {
      const monitor = getPerformanceMonitor();

      // Add 100 samples from 1-100
      for (let i = 1; i <= 100; i++) {
        monitor.startTiming('p99_test');
        const startTime = Date.now() - i;
        (monitor as any).startTimes.set('p99_test', startTime);
        monitor.endTiming('p99_test');
      }

      const summary = monitor.getSummary('p99_test');
      expect(summary).not.toBeNull();
      // P99 of 1-100 should be 99
      expect(summary!.p99).toBe(99);
    });
  });

  describe('getSummary()', () => {
    it('should return null for operations with no samples', () => {
      const monitor = getPerformanceMonitor();

      const summary = monitor.getSummary('nonexistent');

      expect(summary).toBeNull();
    });

    it('should return all statistics', () => {
      const monitor = getPerformanceMonitor();

      // Add some samples
      for (let i = 1; i <= 10; i++) {
        monitor.startTiming('stats_test');
        const startTime = Date.now() - i;
        (monitor as any).startTimes.set('stats_test', startTime);
        monitor.endTiming('stats_test');
      }

      const summary = monitor.getSummary('stats_test');

      expect(summary).not.toBeNull();
      expect(summary!.operation).toBe('stats_test');
      expect(summary!.samples).toBe(10);
      expect(summary!.average).toBeGreaterThan(0);
      expect(summary!.median).toBeGreaterThan(0);
      expect(summary!.min).toBeGreaterThan(0);
      expect(summary!.max).toBeGreaterThan(0);
      expect(summary!.p95).toBeGreaterThan(0);
      expect(summary!.p99).toBeGreaterThan(0);
    });

    it('should calculate min and max correctly', () => {
      const monitor = getPerformanceMonitor();

      // Add samples: [5, 15, 10, 20, 3]
      for (const duration of [5, 15, 10, 20, 3]) {
        monitor.startTiming('minmax_test');
        const startTime = Date.now() - duration;
        (monitor as any).startTimes.set('minmax_test', startTime);
        monitor.endTiming('minmax_test');
      }

      const summary = monitor.getSummary('minmax_test');
      expect(summary).not.toBeNull();
      expect(summary!.min).toBe(3);
      expect(summary!.max).toBe(20);
    });
  });

  describe('Analytics integration', () => {
    it('should call trackTiming on successful operations', () => {
      const monitor = getPerformanceMonitor();

      monitor.startTiming('analytics_test');
      const duration = monitor.endTiming('analytics_test');

      expect(vi.mocked(trackTiming)).toHaveBeenCalledWith('analytics_test', duration, true);
    });

    it('should handle analytics failures gracefully', () => {
      const monitor = getPerformanceMonitor();

      // Make trackTiming throw
      vi.mocked(trackTiming).mockImplementationOnce(() => {
        throw new Error('Analytics unavailable');
      });

      monitor.startTiming('graceful_test');

      // Should not throw
      expect(() => {
        monitor.endTiming('graceful_test');
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[perf] Failed to send timing to analytics:',
        expect.any(Error)
      );
    });

    it('should track failed async operations with success=false', async () => {
      const monitor = getPerformanceMonitor();

      await expect(
        monitor.measureAsync('failed_async', async () => {
          throw new Error('Async failure');
        })
      ).rejects.toThrow();

      expect(vi.mocked(trackTiming)).toHaveBeenCalledWith(
        'failed_async',
        expect.any(Number),
        false
      );
    });
  });

  describe('Debug mode', () => {
    it('should log when debug_performance flag is enabled', () => {
      if (typeof window === 'undefined') {
        return; // Skip in server environment
      }

      const monitor = getPerformanceMonitor();
      localStorage.setItem('debug_performance', 'true');

      monitor.startTiming('debug_test');
      monitor.endTiming('debug_test');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[perf] debug_test:')
      );
    });

    it('should not log when debug flag is disabled', () => {
      if (typeof window === 'undefined') {
        return; // Skip in server environment
      }

      const monitor = getPerformanceMonitor();
      localStorage.removeItem('debug_performance');

      monitor.startTiming('no_debug_test');
      monitor.endTiming('no_debug_test');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('reset()', () => {
    it('should clear all metrics', () => {
      const monitor = getPerformanceMonitor();

      monitor.startTiming('reset_test');
      monitor.endTiming('reset_test');

      expect(monitor.getSummary('reset_test')).not.toBeNull();

      monitor.reset();

      expect(monitor.getSummary('reset_test')).toBeNull();
    });

    it('should clear pending start times', () => {
      const monitor = getPerformanceMonitor();

      monitor.startTiming('pending_test');
      monitor.reset();

      const duration = monitor.endTiming('pending_test');

      expect(duration).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('PERF_OPERATIONS constants', () => {
    it('should export operation name constants', () => {
      expect(PERF_OPERATIONS.UPLOAD_SINGLE).toBe('upload:single');
      expect(PERF_OPERATIONS.SEARCH_TOTAL).toBe('search:total');
      expect(PERF_OPERATIONS.DB_QUERY).toBe('db:query');
    });
  });

  describe('Singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      const monitor1 = getPerformanceMonitor();
      const monitor2 = getPerformanceMonitor();

      expect(monitor1).toBe(monitor2);
    });

    it('should share state across singleton instances', () => {
      const monitor1 = getPerformanceMonitor();
      const monitor2 = getPerformanceMonitor();

      monitor1.startTiming('singleton_test');
      const duration = monitor2.endTiming('singleton_test');

      expect(duration).toBeDefined();
    });
  });
});
