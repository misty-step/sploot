'use client';

import { useState, useEffect, useCallback } from 'react';
import { warn } from '@/lib/logger';

export interface CacheStatus {
  [cacheName: string]: {
    count: number;
    urls: string[];
  };
}

export interface CacheStats {
  totalSize: number;
  totalEntries: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

export function useCacheManagement() {
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Initialize service worker reference
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        setSwRegistration(registration);
      });
    }
  }, []);

  // Get cache status from service worker
  const getCacheStatus = useCallback(async () => {
    if (!swRegistration) {
      setError('Service worker not available');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const messageChannel = new MessageChannel();

      return new Promise<void>((resolve, reject) => {
        messageChannel.port1.onmessage = (event) => {
          if (event.data.status) {
            setCacheStatus(event.data.status);
            resolve();
          } else {
            reject(new Error('Failed to get cache status'));
          }
        };

        swRegistration.active?.postMessage(
          { type: 'cache-status' },
          [messageChannel.port2]
        );

        // Timeout after 5 seconds
        setTimeout(() => {
          reject(new Error('Cache status request timed out'));
        }, 5000);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get cache status');
    } finally {
      setIsLoading(false);
    }
  }, [swRegistration]);

  // Clean up caches
  const cleanCache = useCallback(async () => {
    if (!swRegistration) {
      setError('Service worker not available');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const messageChannel = new MessageChannel();

      return new Promise<void>((resolve, reject) => {
        messageChannel.port1.onmessage = (event) => {
          if (event.data.success) {
            // Refresh cache status after cleanup
            getCacheStatus();
            resolve();
          } else {
            reject(new Error('Failed to clean cache'));
          }
        };

        swRegistration.active?.postMessage(
          { type: 'clean-cache' },
          [messageChannel.port2]
        );

        // Timeout after 10 seconds
        setTimeout(() => {
          reject(new Error('Cache cleanup request timed out'));
        }, 10000);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clean cache');
    } finally {
      setIsLoading(false);
    }
  }, [swRegistration, getCacheStatus]);

  // Clear all caches
  const clearAllCaches = useCallback(async () => {
    if (!('caches' in window)) {
      setError('Cache API not supported');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      setCacheStatus({});

      // Re-register service worker to restore critical caches
      if (swRegistration) {
        await swRegistration.update();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear caches');
    } finally {
      setIsLoading(false);
    }
  }, [swRegistration]);

  // Calculate cache statistics
  const getCacheStats = useCallback((): CacheStats => {
    let totalEntries = 0;
    let totalSize = 0; // Approximate based on entry count

    Object.values(cacheStatus).forEach((cache) => {
      totalEntries += cache.count;
      // Rough estimate: 50KB average per cached item
      totalSize += cache.count * 50 * 1024;
    });

    return {
      totalSize,
      totalEntries,
      oldestEntry: null, // Would need to track in service worker
      newestEntry: null, // Would need to track in service worker
    };
  }, [cacheStatus]);

  // Prefetch URLs into cache
  const prefetchUrls = useCallback(async (urls: string[]) => {
    if (!('caches' in window)) {
      setError('Cache API not supported');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cache = await caches.open('sploot-prefetch-v1');
      const promises = urls.map((url) =>
        fetch(url)
          .then((response) => {
            if (response.ok) {
              return cache.put(url, response);
            }
          })
          .catch((err) => {
            warn(`Failed to prefetch ${url}:`, err);
          })
      );

      await Promise.all(promises);

      // Refresh cache status
      await getCacheStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prefetch URLs');
    } finally {
      setIsLoading(false);
    }
  }, [getCacheStatus]);

  // Check if URL is cached
  const isUrlCached = useCallback(async (url: string): Promise<boolean> => {
    if (!('caches' in window)) {
      return false;
    }

    try {
      const response = await caches.match(url);
      return !!response;
    } catch {
      return false;
    }
  }, []);

  // Remove specific URL from cache
  const removeFromCache = useCallback(async (url: string) => {
    if (!('caches' in window)) {
      setError('Cache API not supported');
      return;
    }

    try {
      const cacheNames = await caches.keys();
      const promises = cacheNames.map(async (cacheName) => {
        const cache = await caches.open(cacheName);
        return cache.delete(url);
      });

      await Promise.all(promises);

      // Refresh cache status
      await getCacheStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove from cache');
    }
  }, [getCacheStatus]);

  // Auto-refresh cache status on mount
  useEffect(() => {
    if (swRegistration) {
      getCacheStatus();
    }
  }, [swRegistration, getCacheStatus]);

  return {
    cacheStatus,
    cacheStats: getCacheStats(),
    isLoading,
    error,
    getCacheStatus,
    cleanCache,
    clearAllCaches,
    prefetchUrls,
    isUrlCached,
    removeFromCache,
    isSupported: 'caches' in window && 'serviceWorker' in navigator,
  };
}