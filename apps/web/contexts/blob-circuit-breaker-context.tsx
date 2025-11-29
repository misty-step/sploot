'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { CircuitBreaker, type CircuitState } from '@/lib/circuit-breaker';

interface BlobCircuitBreakerContextValue {
  recordBlobError: (statusCode: number) => void;
  recordBlobSuccess: () => void;
  state: CircuitState;
  isOpen: boolean;
  timeUntilClose: number;
  consecutiveFailures: number;
  reset: () => void;
}

const BlobCircuitBreakerContext = createContext<BlobCircuitBreakerContextValue | null>(null);

// Singleton circuit breaker for blob requests
let blobCircuitBreaker: CircuitBreaker | null = null;

function getBlobCircuitBreaker(): CircuitBreaker {
  if (!blobCircuitBreaker) {
    blobCircuitBreaker = new CircuitBreaker({
      threshold: 3, // Open after 3 consecutive failures
      timeout: 10000, // 10 seconds cooldown
      resetTimeout: 30000, // Reset after 30 seconds of success
      onStateChange: (newState, oldState) => {
        console.log(`[BlobCircuitBreaker] ${oldState} → ${newState}`);
      },
    });
  }
  return blobCircuitBreaker;
}

export function BlobCircuitBreakerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CircuitState>('closed');
  const [isOpen, setIsOpen] = useState(false);
  const [timeUntilClose, setTimeUntilClose] = useState(0);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

  // Update state periodically
  useEffect(() => {
    const breaker = getBlobCircuitBreaker();

    const updateState = () => {
      const stats = breaker.getStats();
      setState(stats.state);
      setIsOpen(breaker.isOpen());
      setTimeUntilClose(breaker.getTimeUntilClose());
      setConsecutiveFailures(stats.consecutiveFailures);
    };

    updateState();
    const interval = setInterval(updateState, 1000);

    return () => clearInterval(interval);
  }, []);

  const recordBlobError = (statusCode: number) => {
    // Only track 404 errors (blob not found)
    if (statusCode === 404) {
      const breaker = getBlobCircuitBreaker();
      breaker.execute(
        async () => {
          throw new Error(`Blob not found (${statusCode})`);
        },
        { bypassCheck: true } // Always record, don't block
      ).catch(() => {
        // Error is expected, just recording the failure
      });
    }
  };

  const recordBlobSuccess = () => {
    const breaker = getBlobCircuitBreaker();
    breaker.execute(async () => Promise.resolve(), { bypassCheck: true }).catch(() => {});
  };

  const reset = () => {
    getBlobCircuitBreaker().reset();
  };

  return (
    <BlobCircuitBreakerContext.Provider
      value={{
        recordBlobError,
        recordBlobSuccess,
        state,
        isOpen,
        timeUntilClose,
        consecutiveFailures,
        reset,
      }}
    >
      {children}
    </BlobCircuitBreakerContext.Provider>
  );
}

export function useBlobCircuitBreaker() {
  const context = useContext(BlobCircuitBreakerContext);
  if (!context) {
    throw new Error('useBlobCircuitBreaker must be used within BlobCircuitBreakerProvider');
  }
  return context;
}