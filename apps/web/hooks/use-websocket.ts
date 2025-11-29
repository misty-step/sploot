/**
 * React hooks for WebSocket integration
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { logger } from '@/lib/observability-logger';
import {
  getWebSocketManager,
  ConnectionState,
  MessageHandler,
  EmbeddingUpdate
} from '@/lib/websocket-manager';

/**
 * Hook to monitor WebSocket connection state
 */
export function useWebSocketConnection() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const manager = getWebSocketManager();

  useEffect(() => {
    // Set initial state
    setConnectionState(manager.getState());

    // Subscribe to state changes
    const unsubscribe = manager.onStateChange(setConnectionState);

    // Auto-connect if not already connected
    if (manager.getState() === 'disconnected') {
      manager.connect();
    }

    return unsubscribe;
  }, []);

  const reconnect = useCallback(() => {
    manager.connect();
  }, []);

  const disconnect = useCallback(() => {
    manager.disconnect();
  }, []);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    reconnect,
    disconnect
  };
}

/**
 * Hook to subscribe to WebSocket topics
 */
export function useWebSocketSubscription<T = any>(
  topic: string,
  handler: (data: T) => void,
  options?: {
    enabled?: boolean;
  }
) {
  const manager = getWebSocketManager();
  const handlerRef = useRef(handler);

  // Keep handler ref up to date
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (options?.enabled === false) {
      return;
    }

    // Create stable handler that uses ref
    const stableHandler: MessageHandler = (data) => {
      handlerRef.current(data);
    };

    // Subscribe to topic
    const unsubscribe = manager.subscribe(topic, stableHandler);

    return unsubscribe;
  }, [topic, options?.enabled]);
}

/**
 * Hook to subscribe to embedding updates for specific assets
 */
export function useEmbeddingUpdates(
  assetIds: string[],
  options?: {
    enabled?: boolean;
    onUpdate?: (update: EmbeddingUpdate) => void;
  }
) {
  const [updates, setUpdates] = useState<Map<string, EmbeddingUpdate>>(new Map());
  const manager = getWebSocketManager();

  useEffect(() => {
    if (options?.enabled === false || assetIds.length === 0) {
      return;
    }

    const handler = (update: EmbeddingUpdate) => {
      setUpdates(prev => {
        const next = new Map(prev);
        next.set(update.assetId, update);
        return next;
      });

      if (options?.onUpdate) {
        options.onUpdate(update);
      }
    };

    // Subscribe to asset updates
    const unsubscribe = manager.subscribeToAssets(assetIds, handler);

    return unsubscribe;
  }, [JSON.stringify(assetIds), options?.enabled]);

  const getUpdate = useCallback((assetId: string): EmbeddingUpdate | undefined => {
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
 * Hook to manage WebSocket with automatic fallback to polling
 */
export function useWebSocketWithFallback(
  pollingFunction: () => void,
  pollingInterval = 5000
) {
  const { connectionState, isConnected } = useWebSocketConnection();
  const [isPolling, setIsPolling] = useState(false);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const manager = getWebSocketManager();

  useEffect(() => {
    // Set up polling fallback
    manager.setPollingFallback(() => {
      setIsPolling(true);
    });
  }, []);

  useEffect(() => {
    // Start or stop polling based on connection state and polling flag
    if (isPolling && connectionState === 'failed') {
      logger.logInfo('websocket.polling-fallback-start', {
        pollingIntervalMs: pollingInterval,
      });

      // Clear any existing timer
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }

      // Start polling
      pollingFunction(); // Initial poll
      pollingTimerRef.current = setInterval(pollingFunction, pollingInterval);
    } else if (isConnected && pollingTimerRef.current) {
      logger.logInfo('websocket.polling-fallback-stop');
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
      setIsPolling(false);
    }

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, [isPolling, connectionState, isConnected, pollingFunction, pollingInterval]);

  return {
    isWebSocketConnected: isConnected,
    isPolling,
    connectionState
  };
}
