/**
 * React hooks for Server-Sent Events (SSE) integration
 *
 * Provides real-time embedding updates using SSE for Vercel compatibility
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getSSEClient, SSEConnectionState, SSEMessage, SSEMessageHandler } from '@/lib/sse-client';

/**
 * Hook to monitor SSE connection state
 */
export function useSSEConnection() {
  const [connectionState, setConnectionState] = useState<SSEConnectionState>('disconnected');
  const client = getSSEClient();

  useEffect(() => {
    // Set initial state
    setConnectionState(client.getState());

    // Subscribe to state changes
    const unsubscribe = client.onStateChange(setConnectionState);

    return unsubscribe;
  }, []);

  const connect = useCallback(() => {
    client.connect();
  }, []);

  const disconnect = useCallback(() => {
    client.disconnect();
  }, []);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    connect,
    disconnect
  };
}

/**
 * Hook to subscribe to embedding updates for specific assets
 */
export function useSSEEmbeddingUpdates(
  assetIds: string[],
  options?: {
    enabled?: boolean;
    onUpdate?: (update: SSEMessage) => void;
  }
) {
  const [updates, setUpdates] = useState<Map<string, SSEMessage>>(new Map());
  const client = getSSEClient();
  const onUpdateRef = useRef(options?.onUpdate);

  // Keep callback ref up to date
  useEffect(() => {
    onUpdateRef.current = options?.onUpdate;
  }, [options?.onUpdate]);

  useEffect(() => {
    const enabled = options?.enabled ?? true;
    if (!enabled || assetIds.length === 0) {
      return;
    }

    const handler: SSEMessageHandler = (update) => {
      // Update state
      setUpdates(prev => {
        const next = new Map(prev);
        if (update.assetId) {
          next.set(update.assetId, update);
        }
        return next;
      });

      // Call callback if provided
      if (onUpdateRef.current) {
        onUpdateRef.current(update);
      }
    };

    // Subscribe to asset updates
    const unsubscribe = client.subscribeToAssets(assetIds, handler);

    return unsubscribe;
  }, [JSON.stringify(assetIds), options?.enabled]);

  const getUpdate = useCallback((assetId: string): SSEMessage | undefined => {
    return updates.get(assetId);
  }, [updates]);

  const clearUpdate = useCallback((assetId: string) => {
    setUpdates(prev => {
      const next = new Map(prev);
      next.delete(assetId);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setUpdates(new Map());
  }, []);

  return {
    updates,
    getUpdate,
    clearUpdate,
    clearAll
  };
}

/**
 * Hook to subscribe to all embedding updates
 */
export function useSSEAllUpdates(
  options?: {
    enabled?: boolean;
    onUpdate?: (update: SSEMessage) => void;
  }
) {
  const [updates, setUpdates] = useState<SSEMessage[]>([]);
  const client = getSSEClient();
  const onUpdateRef = useRef(options?.onUpdate);

  // Keep callback ref up to date
  useEffect(() => {
    onUpdateRef.current = options?.onUpdate;
  }, [options?.onUpdate]);

  useEffect(() => {
    const enabled = options?.enabled ?? true;
    if (!enabled) {
      return;
    }

    const handler: SSEMessageHandler = (update) => {
      // Add to updates array
      setUpdates(prev => [...prev.slice(-99), update]); // Keep last 100 updates

      // Call callback if provided
      if (onUpdateRef.current) {
        onUpdateRef.current(update);
      }
    };

    // Subscribe to all updates
    const unsubscribe = client.subscribeToAll(handler);

    return unsubscribe;
  }, [options?.enabled]);

  const clearUpdates = useCallback(() => {
    setUpdates([]);
  }, []);

  return {
    updates,
    clearUpdates
  };
}

/**
 * Hook to use SSE for embedding status with automatic fallback
 * This integrates with the existing embedding status context
 */
export function useSSEEmbeddingStatus(
  assetId: string | undefined,
  options?: {
    enabled?: boolean;
    pollingInterval?: number;
    onStatusChange?: (status: SSEMessage) => void;
  }
) {
  const { connectionState, isConnected } = useSSEConnection();
  const [status, setStatus] = useState<SSEMessage | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to SSE updates
  useSSEEmbeddingUpdates(
    assetId ? [assetId] : [],
    {
      enabled: options?.enabled && isConnected && !!assetId,
      onUpdate: (update) => {
        setStatus(update);
        if (options?.onStatusChange) {
          options.onStatusChange(update);
        }
      }
    }
  );

  // Fallback to polling when SSE is not available
  useEffect(() => {
    const shouldPoll = options?.enabled &&
                      !isConnected &&
                      connectionState === 'failed' &&
                      !!assetId;

    if (shouldPoll) {
      setIsPolling(true);

      // Poll for status
      const pollStatus = async () => {
        try {
          const response = await fetch(`/api/assets/${assetId}/embedding-status`);
          if (response.ok) {
            const data = await response.json();
            const update: SSEMessage = {
              type: 'embedding-update',
              assetId,
              status: data.status,
              error: data.error,
              modelName: data.modelName,
              hasEmbedding: data.hasEmbedding,
              timestamp: Date.now()
            };
            setStatus(update);
            if (options?.onStatusChange) {
              options.onStatusChange(update);
            }
          }
        } catch (error) {
          console.error('[SSE] Polling error:', error);
        }
      };

      // Initial poll
      pollStatus();

      // Set up interval
      pollingTimerRef.current = setInterval(pollStatus, options?.pollingInterval || 5000);
    } else {
      setIsPolling(false);
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    }

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [assetId, isConnected, connectionState, options?.enabled, options?.pollingInterval]);

  return {
    status,
    isConnected,
    isPolling,
    connectionState
  };
}