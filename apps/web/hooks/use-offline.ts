'use client';

import { useEffect, useState, useCallback } from 'react';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(false);

  const checkConnection = useCallback(async () => {
    // Check navigator.onLine first
    if (!navigator.onLine) {
      setIsOffline(true);
      return false;
    }

    // Try to fetch a small resource to verify actual connectivity
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setIsOffline(false);
        return true;
      }
    } catch (error) {
      // Network error or timeout
      setIsOffline(true);
      return false;
    }

    return false;
  }, []);

  useEffect(() => {
    // Initial check
    checkConnection();

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
    };
  }, [checkConnection]);

  return {
    isOffline,
    checkConnection,
  };
}