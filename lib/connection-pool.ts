import { logger } from '@/lib/observability-logger';

/**
 * Connection Pool Manager
 *
 * Manages HTTP connection limits to prevent browser resource exhaustion.
 * Chrome/Edge limit: 6 concurrent connections per domain
 * We use 4, leaving 2 for user-initiated actions
 */

import { getGlobalCircuitBreaker } from './circuit-breaker';

interface QueuedRequest {
  id: string;
  execute: () => Promise<Response>;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

interface PoolStats {
  activeConnections: number;
  queuedRequests: number;
  totalProcessed: number;
  totalErrors: number;
  averageWaitTime: number;
}

class ConnectionPool {
  private static instance: ConnectionPool;

  // Configuration
  private readonly MAX_CONCURRENT = 4; // Chrome limit is 6, leave 2 for user actions
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds

  // State management
  private inFlight = new Map<string, Promise<Response>>();
  private queue: QueuedRequest[] = [];
  private requestCounter = 0;

  // Metrics
  private totalProcessed = 0;
  private totalErrors = 0;
  private waitTimes: number[] = [];

  private constructor() {
    // Private constructor for singleton
    if (typeof window !== 'undefined') {
      // Monitor page visibility to pause/resume
      document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));

      // Monitor online/offline status
      window.addEventListener('online', this.handleOnline.bind(this));
      window.addEventListener('offline', this.handleOffline.bind(this));
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ConnectionPool {
    if (!ConnectionPool.instance) {
      ConnectionPool.instance = new ConnectionPool();
    }
    return ConnectionPool.instance;
  }

  /**
   * Execute a request with connection pooling
   */
  async execute<T = Response>(
    fn: () => Promise<T>,
    options?: {
      priority?: 'high' | 'normal' | 'low';
      timeout?: number;
      signal?: AbortSignal;
      bypassCircuitBreaker?: boolean;
    }
  ): Promise<T> {
    const requestId = `req-${++this.requestCounter}`;
    const startTime = Date.now();
    const circuitBreaker = getGlobalCircuitBreaker();

    // Check if we're at capacity
    if (this.inFlight.size >= this.MAX_CONCURRENT) {
      // Queue the request
      return new Promise<T>((resolve, reject) => {
        const queuedRequest: QueuedRequest = {
          id: requestId,
          execute: fn as () => Promise<Response>,
          resolve: resolve as (response: Response) => void,
          reject,
        };

        // Add to queue based on priority
        if (options?.priority === 'high') {
          this.queue.unshift(queuedRequest);
        } else if (options?.priority === 'low') {
          this.queue.push(queuedRequest);
        } else {
          // Normal priority - add to middle of queue
          const midPoint = Math.floor(this.queue.length / 2);
          this.queue.splice(midPoint, 0, queuedRequest);
        }

        // Handle abort signal if provided
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const index = this.queue.findIndex(r => r.id === requestId);
            if (index !== -1) {
              this.queue.splice(index, 1);
              reject(new Error('Request aborted'));
            }
          });
        }
      });
    }

    // Execute immediately if under limit
    try {
      // Track wait time
      const waitTime = Date.now() - startTime;
      this.waitTimes.push(waitTime);
      if (this.waitTimes.length > 100) {
        this.waitTimes.shift(); // Keep only last 100 measurements
      }

      // Create timeout wrapper
      const timeoutMs = options?.timeout || this.REQUEST_TIMEOUT;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs);
      });

      // Execute with circuit breaker protection
      const executeWithBreaker = options?.bypassCircuitBreaker
        ? fn()
        : circuitBreaker.execute(fn);

      // Execute with timeout
      const responsePromise = executeWithBreaker;
      this.inFlight.set(requestId, responsePromise as Promise<Response>);

      const result = await Promise.race([responsePromise, timeoutPromise]) as T;

      this.totalProcessed++;
      return result;

    } catch (error) {
      this.totalErrors++;

      // Check for resource exhaustion errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('ERR_INSUFFICIENT_RESOURCES') ||
          errorMessage.includes('ERR_NETWORK_CHANGED')) {
        console.error('[ConnectionPool] Resource exhaustion detected - circuit breaker will open');
        // Circuit breaker will handle this automatically
      }

      throw error;

    } finally {
      // Remove from in-flight
      this.inFlight.delete(requestId);

      // Process next queued request
      this.processQueue();
    }
  }

  /**
   * Process queued requests when capacity is available
   */
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.inFlight.size < this.MAX_CONCURRENT) {
      const queued = this.queue.shift();
      if (!queued) break;

      // Execute the queued request
      try {
        const response = await this.executeImmediate(queued.execute);
        queued.resolve(response);
      } catch (error) {
        queued.reject(error as Error);
      }
    }
  }

  /**
   * Execute a request immediately (internal use)
   */
  private async executeImmediate(fn: () => Promise<Response>): Promise<Response> {
    const requestId = `req-immediate-${++this.requestCounter}`;

    try {
      const responsePromise = fn();
      this.inFlight.set(requestId, responsePromise);

      const response = await responsePromise;
      this.totalProcessed++;
      return response;

    } catch (error) {
      this.totalErrors++;
      throw error;

    } finally {
      this.inFlight.delete(requestId);
    }
  }

  /**
   * Wait for all in-flight requests to complete
   */
  async waitForAll(): Promise<void> {
    if (this.inFlight.size === 0) return;

    await Promise.allSettled(Array.from(this.inFlight.values()));
  }

  /**
   * Clear the queue (but not in-flight requests)
   */
  clearQueue(): number {
    const cleared = this.queue.length;

    // Reject all queued requests
    for (const queued of this.queue) {
      queued.reject(new Error('Queue cleared'));
    }

    this.queue = [];
    return cleared;
  }

  /**
   * Get current pool statistics
   */
  getStats(): PoolStats {
    const avgWaitTime = this.waitTimes.length > 0
      ? this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length
      : 0;

    return {
      activeConnections: this.inFlight.size,
      queuedRequests: this.queue.length,
      totalProcessed: this.totalProcessed,
      totalErrors: this.totalErrors,
      averageWaitTime: Math.round(avgWaitTime),
    };
  }

  /**
   * Check if pool is at capacity
   */
  isAtCapacity(): boolean {
    return this.inFlight.size >= this.MAX_CONCURRENT;
  }

  /**
   * Get number of available connection slots
   */
  getAvailableSlots(): number {
    return Math.max(0, this.MAX_CONCURRENT - this.inFlight.size);
  }

  /**
   * Handle page visibility changes
   */
  private handleVisibilityChange(): void {
    if (document.hidden) {
      // Page is hidden, might want to pause non-critical requests
      logger.logInfo('connection-pool.page-hidden', {
        pendingRequests: this.queue.length,
      });
    } else {
      // Page is visible again, process queue
      logger.logInfo('connection-pool.page-visible', {
        pendingRequests: this.queue.length,
      });
      this.processQueue();
    }
  }

  /**
   * Handle online status
   */
  private handleOnline(): void {
    logger.logInfo('connection-pool.online');
    this.processQueue();
  }

  /**
   * Handle offline status
   */
  private handleOffline(): void {
    logger.logInfo('connection-pool.offline');
    // Could implement logic to pause/fail requests when offline
  }

  /**
   * Reset all metrics (for testing)
   */
  resetMetrics(): void {
    this.totalProcessed = 0;
    this.totalErrors = 0;
    this.waitTimes = [];
  }
}

/**
 * Global fetch wrapper that uses connection pooling
 */
export async function pooledFetch(
  input: RequestInfo | URL,
  init?: RequestInit & {
    priority?: 'high' | 'normal' | 'low';
  }
): Promise<Response> {
  const pool = ConnectionPool.getInstance();

  return pool.execute(
    () => fetch(input, init),
    {
      priority: init?.priority,
      signal: init?.signal || undefined,
    }
  );
}

/**
 * Get the global connection pool instance
 */
export function getConnectionPool(): ConnectionPool {
  return ConnectionPool.getInstance();
}

/**
 * Hook for React components to monitor pool stats
 */
export function useConnectionPoolStats() {
  const React = require('react');
  const [stats, setStats] = React.useState({
    activeConnections: 0,
    queuedRequests: 0,
    totalProcessed: 0,
    totalErrors: 0,
    averageWaitTime: 0,
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const pool = getConnectionPool();
    setStats(pool.getStats());

    const interval = setInterval(() => {
      setStats(pool.getStats());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return stats;
}

// Prevent direct instantiation
export type { PoolStats };
