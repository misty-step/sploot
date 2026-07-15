'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(false);
  const probeControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const checkConnection = useCallback(async () => {
    // Check navigator.onLine first
    if (!navigator.onLine) {
      setIsOffline(true);
      return false;
    }

    // Try to fetch a small resource to verify actual connectivity
    if (probeControllerRef.current) return true;
    const controller = new AbortController();
    probeControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
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
    } catch (error) {
      // Network error or timeout
      if (mountedRef.current) setIsOffline(true);
      return false;
    } finally {
      clearTimeout(timeoutId);
      if (probeControllerRef.current === controller) probeControllerRef.current = null;
    }

    return false;
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
      probeControllerRef.current = null;
    };
  }, [checkConnection]);

  return {
    isOffline,
    checkConnection,
  };
}
