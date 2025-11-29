import { logger } from '@/lib/observability-logger';

/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascade failures by detecting errors and temporarily blocking requests.
 * When failures exceed threshold, circuit "opens" and blocks all requests.
 * After cooldown, circuit enters "half-open" state for testing recovery.
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  threshold?: number;        // Number of failures to trigger open state
  timeout?: number;          // Cooldown period in ms
  resetTimeout?: number;     // Time without errors to reset failure count
  monitorInterval?: number;  // Interval to check for state transitions
  onStateChange?: (newState: CircuitState, oldState: CircuitState) => void;
}

interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;

  // Statistics
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;

  // Configuration
  private readonly threshold: number;
  private readonly timeout: number;
  private readonly resetTimeout: number;
  private readonly monitorInterval: number;
  private readonly onStateChange?: (newState: CircuitState, oldState: CircuitState) => void;

  // Monitoring
  private monitorTimer?: NodeJS.Timeout;

  // Error classification
  private readonly RESOURCE_ERRORS = [
    'ERR_INSUFFICIENT_RESOURCES',
    'ERR_NETWORK_CHANGED',
    'ERR_INTERNET_DISCONNECTED',
    'ERR_CONNECTION_REFUSED',
    'ERR_CONNECTION_RESET',
    'ERR_CONNECTION_ABORTED',
  ];

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.threshold ?? 5;
    this.timeout = options.timeout ?? 30000; // 30 seconds
    this.resetTimeout = options.resetTimeout ?? 60000; // 1 minute
    this.monitorInterval = options.monitorInterval ?? 1000; // 1 second
    this.onStateChange = options.onStateChange;

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    fn: () => Promise<T>,
    options?: {
      fallback?: () => T | Promise<T>;
      bypassCheck?: boolean;
    }
  ): Promise<T> {
    this.totalRequests++;

    // Check if we should bypass (for critical operations)
    if (options?.bypassCheck) {
      return fn();
    }

    // Check circuit state
    const canProceed = this.canProceed();
    if (!canProceed) {
      // Circuit is open - use fallback or throw
      if (options?.fallback) {
        logger.logInfo('circuit-breaker.open-using-fallback', {
          failures: this.failures,
          threshold: this.threshold,
        });
        return options.fallback();
      }

      throw new Error(
        `Circuit breaker is OPEN - too many failures (${this.failures}/${this.threshold}). ` +
        `Retry after ${Math.round((this.timeout - (Date.now() - this.lastFailureTime)) / 1000)}s`
      );
    }

    try {
      // Execute the function
      const result = await fn();

      // Record success
      this.recordSuccess();

      return result;

    } catch (error) {
      // Record failure
      this.recordFailure(error);

      throw error;
    }
  }

  /**
   * Check if request can proceed based on circuit state
   */
  private canProceed(): boolean {
    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if timeout has passed
        if (Date.now() - this.lastFailureTime >= this.timeout) {
          this.transitionTo('half-open');
          return true;
        }
        return false;

      case 'half-open':
        // Allow one request to test recovery
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful request
   */
  private recordSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;

    switch (this.state) {
      case 'half-open':
        // Success in half-open state means service recovered
        logger.logInfo('circuit-breaker.recovery', {
          consecutiveSuccesses: this.consecutiveSuccesses,
        });
        this.failures = 0;
        this.transitionTo('closed');
        break;

      case 'closed':
        // Reset failure count if enough time passed without errors
        if (this.failures > 0 && Date.now() - this.lastFailureTime > this.resetTimeout) {
          logger.logInfo('circuit-breaker.reset-after-stable', {
            lastFailureTime: this.lastFailureTime,
          });
          this.failures = 0;
        }
        break;
    }
  }

  /**
   * Record a failed request
   */
  private recordFailure(error: unknown): void {
    this.lastFailureTime = Date.now();
    this.totalFailures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;

    // Classify error
    const errorType = this.classifyError(error);

    // Increment failure count
    this.failures++;

    switch (this.state) {
      case 'closed':
        // Check if we should open the circuit
        if (this.failures >= this.threshold) {
          console.error(
            `[CircuitBreaker] Failure threshold reached (${this.failures}/${this.threshold})`,
            `Error type: ${errorType}`
          );
          this.transitionTo('open');
        }
        break;

      case 'half-open':
        // Failure in half-open means service is still down
        logger.logInfo('circuit-breaker.test-failed');
        this.transitionTo('open');
        break;
    }
  }

  /**
   * Classify error type for better handling
   */
  private classifyError(error: unknown): string {
    if (!error) return 'unknown';

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for resource exhaustion
    if (this.RESOURCE_ERRORS.some(err => errorMessage.includes(err))) {
      // Immediate circuit open for resource errors
      if (this.state === 'closed') {
        console.error('[CircuitBreaker] Resource exhaustion detected - immediately opening circuit');
        this.failures = this.threshold; // Set to threshold to trigger open
      }
      return 'resource_exhaustion';
    }

    // Check for network errors
    if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
      return 'network';
    }

    // Check for timeout
    if (errorMessage.includes('timeout')) {
      return 'timeout';
    }

    // Check for server errors
    if (errorMessage.includes('500') || errorMessage.includes('502') ||
        errorMessage.includes('503') || errorMessage.includes('504')) {
      return 'server';
    }

    return 'unknown';
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;

    if (oldState === newState) return;

    this.state = newState;

    logger.logInfo('circuit-breaker.state-transition', {
      oldState,
      newState,
      failures: this.failures,
      threshold: this.threshold,
    });

    // Notify listener
    this.onStateChange?.(newState, oldState);

    // Handle state-specific actions
    switch (newState) {
      case 'open':
        // Log warning for open circuit
        console.warn(
          `[CircuitBreaker] Circuit OPEN - blocking requests for ${this.timeout}ms`,
          `Total failures: ${this.totalFailures}, Recent failures: ${this.failures}`
        );
        break;

      case 'half-open':
        logger.logInfo('circuit-breaker.half-open');
        break;

      case 'closed':
        logger.logInfo('circuit-breaker.closed');
        break;
    }
  }

  /**
   * Start monitoring for automatic state transitions
   */
  private startMonitoring(): void {
    if (this.monitorTimer) return;

    this.monitorTimer = setInterval(() => {
      // Check for automatic transitions
      if (this.state === 'open') {
        const timeSinceFailure = Date.now() - this.lastFailureTime;
        if (timeSinceFailure >= this.timeout) {
          this.transitionTo('half-open');
        }
      }

      // Reset failure count after stable period
      if (this.state === 'closed' && this.failures > 0) {
        const timeSinceFailure = Date.now() - this.lastFailureTime;
        if (timeSinceFailure >= this.resetTimeout) {
          this.failures = 0;
          logger.logInfo('circuit-breaker.monitoring-reset', {
            resetTimeout: this.resetTimeout,
          });
        }
      }
    }, this.monitorInterval);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    logger.logInfo('circuit-breaker.manual-reset');
  }

  /**
   * Manually open the circuit (for testing or emergency)
   */
  trip(): void {
    this.transitionTo('open');
    this.lastFailureTime = Date.now();
  }

  /**
   * Get current statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successCount: this.totalSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
    };
  }

  /**
   * Check if circuit is currently blocking requests
   */
  isOpen(): boolean {
    return this.state === 'open' && (Date.now() - this.lastFailureTime < this.timeout);
  }

  /**
   * Get time until circuit closes (in ms)
   */
  getTimeUntilClose(): number {
    if (this.state !== 'open') return 0;
    return Math.max(0, this.timeout - (Date.now() - this.lastFailureTime));
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopMonitoring();
  }
}

// Global circuit breaker instance for API calls
let globalCircuitBreaker: CircuitBreaker | null = null;

/**
 * Get or create global circuit breaker
 */
export function getGlobalCircuitBreaker(): CircuitBreaker {
  if (!globalCircuitBreaker) {
    globalCircuitBreaker = new CircuitBreaker({
      threshold: 5,
      timeout: 30000, // 30 seconds
      resetTimeout: 60000, // 1 minute
      onStateChange: (newState, oldState) => {
        logger.logInfo('global-circuit-breaker.state-change', {
          oldState,
          newState,
        });

        // Could emit events or update UI here
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('circuit-breaker-state-change', {
            detail: { newState, oldState }
          }));
        }
      }
    });
  }
  return globalCircuitBreaker;
}

// User sync circuit breaker instance
let userSyncCircuitBreaker: CircuitBreaker | null = null;

/**
 * Get or create user sync circuit breaker
 * Ousterhout: Fail Fast - don't retry operations likely to fail
 */
export function getUserSyncCircuitBreaker(): CircuitBreaker {
  if (!userSyncCircuitBreaker) {
    userSyncCircuitBreaker = new CircuitBreaker({
      threshold: 3, // Open after 3 failures (more sensitive than global)
      timeout: 60000, // Wait 1 minute before retry
      resetTimeout: 120000, // Reset after 2 minutes of stability
      onStateChange: (newState, oldState) => {
        logger.logInfo('user-sync-circuit-breaker.state-change', {
          oldState,
          newState,
        });
      },
    });
  }
  return userSyncCircuitBreaker;
}

/**
 * React hook for circuit breaker stats
 */
export function useCircuitBreakerStats() {
  const React = require('react');
  const [stats, setStats] = React.useState(null as CircuitBreakerStats | null);
  const [timeUntilClose, setTimeUntilClose] = React.useState(0);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const breaker = getGlobalCircuitBreaker();
    setStats(breaker.getStats());
    setTimeUntilClose(breaker.getTimeUntilClose());

    // Update stats periodically
    const interval = setInterval(() => {
      setStats(breaker.getStats());
      setTimeUntilClose(breaker.getTimeUntilClose());
    }, 1000);

    // Listen for state changes
    const handleStateChange = () => {
      setStats(breaker.getStats());
      setTimeUntilClose(breaker.getTimeUntilClose());
    };

    window.addEventListener('circuit-breaker-state-change', handleStateChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('circuit-breaker-state-change', handleStateChange);
    };
  }, []);

  if (typeof window === 'undefined' || !stats) {
    return {
      state: 'closed' as CircuitState,
      isOpen: false,
      timeUntilClose: 0,
      stats: null,
    };
  }

  const breaker = getGlobalCircuitBreaker();
  return {
    state: stats.state,
    isOpen: breaker.isOpen(),
    timeUntilClose,
    stats,
  };
}
