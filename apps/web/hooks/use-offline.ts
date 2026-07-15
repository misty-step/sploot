'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(false);
  const probeControllerRef = useRef<AbortController | null>(null);
  const probePromiseRef = useRef<Promise<boolean> | null>(null);
  const mountedRef = useRef(true);

  const checkConnection = useCallback((): Promise<boolean> => {
    // Check navigator.onLine first
    if (!navigator.onLine) {
      setIsOffline(true);
      return Promise.resolve(false);
    }

    // Try to fetch a small resource to verify actual connectivity
    if (probePromiseRef.current) return probePromiseRef.current;
    const controller = new AbortController();
    probeControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    const probe = (async () => {
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-cache',
          signal: controller.signal,
        });

        if (response.ok) {
          if (mountedRef.current) setIsOffline(false);
          return true;
        }
      } catch {
        // Network error or timeout
        if (mountedRef.current) setIsOffline(true);
        return false;
      } finally {
        clearTimeout(timeoutId);
        if (probeControllerRef.current === controller) probeControllerRef.current = null;
      }

      return false;
    })();

    probePromiseRef.current = probe;
    void probe.then(() => {
      if (probePromiseRef.current === probe) probePromiseRef.current = null;
    });
    return probe;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Initial check
    queueMicrotask(() => {
      void checkConnection();
    });

    // Set up event listeners
    const handleOnline = () => {
      checkConnection();
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check every 30 seconds
    const intervalId = setInterval(() => {
      checkConnection();
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
      mountedRef.current = false;
      probeControllerRef.current?.abort();
      probeControllerRef.current = null;
      probePromiseRef.current = null;
    };
  }, [checkConnection]);

  return {
    isOffline,
    checkConnection,
  };
}
