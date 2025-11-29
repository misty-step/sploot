'use client';

import React, { createContext, useContext, useEffect, useRef, ReactNode } from 'react';
import {
  getEmbeddingStatusManager,
  type EmbeddingStatus,
  type StatusCallback,
  type UnsubscribeFn
} from '@/hooks/use-embedding-status-manager';

/**
 * Context value providing access to centralized embedding status management
 */
interface EmbeddingStatusContextValue {
  /**
   * Subscribe to status updates for a specific asset
   * Returns an unsubscribe function that must be called on cleanup
   */
  subscribe: (assetId: string, callback: StatusCallback) => UnsubscribeFn;

  /**
   * Get current status for an asset (synchronous)
   */
  getStatus: (assetId: string) => EmbeddingStatus | undefined;

  /**
   * Manually trigger a retry for an asset with failed embedding
   */
  triggerRetry: (assetId: string) => Promise<void>;

  /**
   * Get manager statistics for debugging
   */
  getStats?: () => {
    subscriberCount: number;
    statusCacheSize: number;
    pendingBatchSize: number;
    retryQueueSize: number;
  };
}

/**
 * React Context for embedding status distribution
 * Provides subscription-based status updates to prevent polling storm
 */
const EmbeddingStatusContext = createContext<EmbeddingStatusContextValue | undefined>(undefined);

/**
 * Provider component that wraps the app and provides embedding status management
 */
export function EmbeddingStatusProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef(getEmbeddingStatusManager());

  // Context value with stable references
  const contextValue: EmbeddingStatusContextValue = {
    subscribe: (assetId: string, callback: StatusCallback) => {
      return managerRef.current.subscribe(assetId, callback);
    },
    getStatus: (assetId: string) => {
      return managerRef.current.getStatus(assetId);
    },
    triggerRetry: async (assetId: string) => {
      return managerRef.current.triggerRetry(assetId);
    },
    getStats: () => {
      return managerRef.current.getStats();
    },
  };

  // Cleanup on unmount (though provider typically lives for app lifetime)
  useEffect(() => {
    return () => {
      // Clear all subscriptions and timers if provider unmounts
      managerRef.current.clearAll();
    };
  }, []);

  return (
    <EmbeddingStatusContext.Provider value={contextValue}>
      {children}
    </EmbeddingStatusContext.Provider>
  );
}

/**
 * Hook to access embedding status context
 * Must be used within EmbeddingStatusProvider
 */
export function useEmbeddingStatusContext() {
  const context = useContext(EmbeddingStatusContext);

  if (!context) {
    throw new Error('useEmbeddingStatusContext must be used within EmbeddingStatusProvider');
  }

  return context;
}

/**
 * Custom hook for component-level embedding status subscription
 * Automatically handles subscription lifecycle
 */
export function useEmbeddingStatusSubscription(
  assetId: string | undefined,
  options?: {
    enabled?: boolean;
    onStatusChange?: (status: EmbeddingStatus) => void;
    onSuccess?: () => void;
    onError?: (error: string) => void;
  }
) {
  const { subscribe, getStatus, triggerRetry } = useEmbeddingStatusContext();
  const [status, setStatus] = React.useState<EmbeddingStatus | undefined>(() => {
    return assetId ? getStatus(assetId) : undefined;
  });

  const { enabled = true, onStatusChange, onSuccess, onError } = options || {};

  useEffect(() => {
    if (!assetId || !enabled) {
      return;
    }

    // Subscribe to status updates
    const unsubscribe = subscribe(assetId, (newStatus) => {
      setStatus(newStatus);

      // Call callbacks
      onStatusChange?.(newStatus);

      if (newStatus.status === 'ready' && newStatus.hasEmbedding) {
        onSuccess?.();
      } else if (newStatus.status === 'failed' && newStatus.error) {
        onError?.(newStatus.error);
      }
    });

    // Get initial status
    const initialStatus = getStatus(assetId);
    if (initialStatus) {
      setStatus(initialStatus);
    }

    // Cleanup subscription on unmount or when assetId changes
    return unsubscribe;
  }, [assetId, enabled, subscribe, getStatus, onStatusChange, onSuccess, onError]);

  return {
    status,
    isReady: status?.hasEmbedding && status?.status === 'ready',
    isProcessing: status?.status === 'processing',
    isFailed: status?.status === 'failed',
    error: status?.error,
    retry: assetId ? () => triggerRetry(assetId) : undefined,
  };
}

/**
 * Debug component to display manager statistics (development only)
 */
export function EmbeddingStatusDebug() {
  const { getStats } = useEmbeddingStatusContext();
  const [stats, setStats] = React.useState(getStats?.());

  useEffect(() => {
    if (!getStats || process.env.NODE_ENV !== 'development') {
      return;
    }

    const interval = setInterval(() => {
      setStats(getStats());
    }, 1000);

    return () => clearInterval(interval);
  }, [getStats]);

  if (process.env.NODE_ENV !== 'development' || !stats) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 bg-black/80 text-xs text-green-400 p-2 font-mono">
      <div>Embedding Manager Stats:</div>
      <div>Subscribers: {stats.subscriberCount}</div>
      <div>Cache Size: {stats.statusCacheSize}</div>
      <div>Pending: {stats.pendingBatchSize}</div>
      <div>Retrying: {stats.retryQueueSize}</div>
    </div>
  );
}