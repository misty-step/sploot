import { logger } from '@/lib/observability-logger';

/**
 * Server-Sent Events (SSE) Client
 *
 * Provides portable server-to-client real-time updates using SSE.
 */

export type SSEMessageHandler = (data: any) => void;
export type SSEConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

export interface SSEMessage {
  type: 'connected' | 'embedding-update' | 'error';
  assetId?: string;
  status?: 'pending' | 'processing' | 'ready' | 'failed';
  error?: string;
  modelName?: string;
  hasEmbedding?: boolean;
  timestamp: number;
}

/**
 * SSE Client for real-time embedding updates
 */
export class SSEClient {
  private eventSource: EventSource | null = null;
  private subscriptions = new Map<string, Set<SSEMessageHandler>>();
  private connectionState: SSEConnectionState = 'disconnected';
  private stateListeners = new Set<(state: SSEConnectionState) => void>();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscribedAssetIds = new Set<string>();

  // Configuration
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
  private readonly SSE_ENDPOINT = '/api/sse/embedding-updates';

  /**
   * Connect to SSE endpoint
   */
  connect(assetIds?: string[]): void {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      logger.logInfo('sse-client.already-connected', {
        state: this.connectionState,
      });
      return;
    }

    this.setConnectionState('connecting');

    // Build URL with asset IDs if provided
    const params = new URLSearchParams();
    const allAssetIds = assetIds ?
      [...new Set([...this.subscribedAssetIds, ...assetIds])] :
      Array.from(this.subscribedAssetIds);

    if (allAssetIds.length > 0) {
      params.set('assetIds', allAssetIds.join(','));
    }

    const url = params.toString() ?
      `${this.SSE_ENDPOINT}?${params.toString()}` :
      this.SSE_ENDPOINT;

    try {
      logger.logInfo('sse-client.connecting', { url });
      this.eventSource = new EventSource(url);

      this.setupEventHandlers();
    } catch (error) {
      console.error('[SSE] Failed to create EventSource:', error);
      this.handleConnectionFailure();
    }
  }

  /**
   * Disconnect from SSE
   */
  disconnect(): void {
    this.clearReconnectTimer();

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.setConnectionState('disconnected');
    this.reconnectAttempts = 0;
  }

  /**
   * Subscribe to updates for specific asset IDs
   */
  subscribeToAssets(assetIds: string[], handler: SSEMessageHandler): () => void {
    // Add asset IDs to subscribed set
    assetIds.forEach(id => this.subscribedAssetIds.add(id));

    // Subscribe to each asset topic
    assetIds.forEach(assetId => {
      const topic = `asset:${assetId}`;
      if (!this.subscriptions.has(topic)) {
        this.subscriptions.set(topic, new Set());
      }
      this.subscriptions.get(topic)!.add(handler);
    });

    // Reconnect with new asset IDs if already connected
    if (this.connectionState === 'connected') {
      this.reconnect();
    } else if (this.connectionState === 'disconnected') {
      this.connect(assetIds);
    }

    // Return unsubscribe function
    return () => {
      assetIds.forEach(assetId => {
        const topic = `asset:${assetId}`;
        const handlers = this.subscriptions.get(topic);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            this.subscriptions.delete(topic);
            this.subscribedAssetIds.delete(assetId);
          }
        }
      });
    };
  }

  /**
   * Subscribe to all embedding updates
   */
  subscribeToAll(handler: SSEMessageHandler): () => void {
    const topic = 'embedding-updates';
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic)!.add(handler);

    // Connect if not already connected
    if (this.connectionState === 'disconnected') {
      this.connect();
    }

    // Return unsubscribe function
    return () => {
      const handlers = this.subscriptions.get(topic);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.subscriptions.delete(topic);
        }
      }
    };
  }

  /**
   * Listen to connection state changes
   */
  onStateChange(listener: (state: SSEConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === 'connected' &&
           this.eventSource !== null &&
           this.eventSource.readyState === EventSource.OPEN;
  }

  /**
   * Get current connection state
   */
  getState(): SSEConnectionState {
    return this.connectionState;
  }

  /**
   * Setup SSE event handlers
   */
  private setupEventHandlers(): void {
    if (!this.eventSource) return;

    this.eventSource.onopen = () => {
      logger.logInfo('sse-client.connected');
      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
    };

    this.eventSource.onerror = (event) => {
      console.error('[SSE] Error:', event);

      if (this.eventSource?.readyState === EventSource.CLOSED) {
        this.handleConnectionFailure();
      }
    };

    // Handle custom events
    this.eventSource.addEventListener('connected', (event) => {
      const data = JSON.parse(event.data) as SSEMessage;
      logger.logInfo('sse-client.connection-confirmed', { data });
    });

    this.eventSource.addEventListener('embedding-update', (event) => {
      try {
        const data = JSON.parse(event.data) as SSEMessage;
        this.handleEmbeddingUpdate(data);
      } catch (error) {
        console.error('[SSE] Failed to parse embedding update:', error);
      }
    });

    // Handle standard message event (fallback)
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'embedding-update') {
          this.handleEmbeddingUpdate(data);
        }
      } catch (error) {
        console.error('[SSE] Failed to parse message:', error);
      }
    };
  }

  /**
   * Handle embedding update messages
   */
  private handleEmbeddingUpdate(update: SSEMessage): void {
    if (!update.assetId) return;

    // Distribute to asset-specific subscribers
    const assetTopic = `asset:${update.assetId}`;
    const assetHandlers = this.subscriptions.get(assetTopic);
    if (assetHandlers) {
      assetHandlers.forEach(handler => handler(update));
    }

    // Distribute to global subscribers
    const globalHandlers = this.subscriptions.get('embedding-updates');
    if (globalHandlers) {
      globalHandlers.forEach(handler => handler(update));
    }
  }

  /**
   * Handle connection failure
   */
  private handleConnectionFailure(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('[SSE] Max reconnection attempts reached');
      this.setConnectionState('failed');
      return;
    }

    const delay = this.RECONNECT_DELAYS[this.reconnectAttempts] || 16000;
    logger.logInfo('sse-client.reconnect-scheduled', {
      delayMs: delay,
      attempt: this.reconnectAttempts + 1,
      maxAttempts: this.MAX_RECONNECT_ATTEMPTS,
    });

    this.setConnectionState('reconnecting');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * Reconnect with current subscriptions
   */
  private reconnect(): void {
    this.disconnect();
    this.connect();
  }

  /**
   * Clear reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Set connection state and notify listeners
   */
  private setConnectionState(state: SSEConnectionState): void {
    if (this.connectionState === state) return;

    this.connectionState = state;
    this.stateListeners.forEach(listener => listener(state));
  }
}

// Create singleton instance
let sseClientInstance: SSEClient | null = null;

/**
 * Get SSE client singleton instance
 */
export function getSSEClient(): SSEClient {
  if (!sseClientInstance && typeof window !== 'undefined') {
    sseClientInstance = new SSEClient();
  }
  return sseClientInstance!;
}
