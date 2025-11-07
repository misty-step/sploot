import { logger } from '@/lib/observability-logger';

/**
 * WebSocket Manager for Real-time Updates
 *
 * Provides a single WebSocket connection for the entire application with:
 * - Automatic reconnection with exponential backoff
 * - Message queuing for offline states
 * - Subscription-based message distribution
 * - Automatic fallback to polling when WebSocket is unavailable
 *
 * This eliminates the O(n) polling problem by using a single persistent connection.
 */

export type MessageHandler = (data: any) => void;
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'update' | 'ping' | 'pong';
  topic?: string;
  assetIds?: string[];
  data?: any;
  timestamp?: number;
}

export interface EmbeddingUpdate {
  assetId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error?: string;
  modelName?: string;
  timestamp: number;
}

/**
 * WebSocket Manager Singleton
 * Manages a single WebSocket connection for the entire application
 */
export class WebSocketManager {
  private static instance: WebSocketManager;
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, Set<MessageHandler>>();
  private messageQueue: WebSocketMessage[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private stateListeners = new Set<(state: ConnectionState) => void>();
  private pollingFallback: (() => void) | null = null;

  // Configuration
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff
  private readonly MESSAGE_QUEUE_MAX_SIZE = 100;
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly PONG_TIMEOUT = 5000; // 5 seconds to respond
  private readonly WS_ENDPOINT = '/api/ws/upload-status';

  private constructor() {
    // Private constructor for singleton pattern
    if (typeof window !== 'undefined') {
      // Only initialize in browser environment
      this.setupVisibilityHandlers();
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      logger.logInfo('websocket-manager.already-connected', {
        state: this.connectionState,
      });
      return;
    }

    this.setConnectionState('connecting');

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}${this.WS_ENDPOINT}`;

      logger.logInfo('websocket-manager.connecting', { url: wsUrl });
      this.ws = new WebSocket(wsUrl);

      this.setupEventHandlers();
    } catch (error) {
      console.error('[WebSocket] Failed to create WebSocket:', error);
      this.handleConnectionFailure();
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.clearTimers();

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnection
      this.ws.close();
      this.ws = null;
    }

    this.setConnectionState('disconnected');
    this.reconnectAttempts = 0;
  }

  /**
   * Subscribe to a topic
   */
  subscribe(topic: string, handler: MessageHandler): () => void {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }

    this.subscriptions.get(topic)!.add(handler);

    // Send subscription message if connected
    if (this.isConnected()) {
      this.send({
        type: 'subscribe',
        topic,
        timestamp: Date.now()
      });
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribe(topic, handler);
    };
  }

  /**
   * Subscribe to specific asset IDs
   */
  subscribeToAssets(assetIds: string[], handler: MessageHandler): () => void {
    const topic = `assets:${assetIds.join(',')}`;

    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }

    this.subscriptions.get(topic)!.add(handler);

    // Send subscription message if connected
    if (this.isConnected()) {
      this.send({
        type: 'subscribe',
        assetIds,
        timestamp: Date.now()
      });
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribe(topic, handler);
    };
  }

  /**
   * Unsubscribe from a topic
   */
  private unsubscribe(topic: string, handler: MessageHandler): void {
    const handlers = this.subscriptions.get(topic);
    if (handlers) {
      handlers.delete(handler);

      if (handlers.size === 0) {
        this.subscriptions.delete(topic);

        // Send unsubscribe message if connected
        if (this.isConnected()) {
          this.send({
            type: 'unsubscribe',
            topic,
            timestamp: Date.now()
          });
        }
      }
    }
  }

  /**
   * Send a message (queued if not connected)
   */
  send(message: WebSocketMessage): void {
    if (this.isConnected() && this.ws) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[WebSocket] Failed to send message:', error);
        this.queueMessage(message);
      }
    } else {
      this.queueMessage(message);
    }
  }

  /**
   * Listen to connection state changes
   */
  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Set polling fallback function
   */
  setPollingFallback(fallback: () => void): void {
    this.pollingFallback = fallback;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === 'connected' &&
           this.ws !== null &&
           this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      logger.logInfo('websocket-manager.connected');
      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
      this.flushMessageQueue();
      this.resubscribeAll();
      this.startPingInterval();
    };

    this.ws.onclose = (event) => {
      logger.logInfo('websocket-manager.disconnected', {
        code: event.code,
        reason: event.reason,
      });
      this.clearTimers();

      if (this.connectionState !== 'disconnected') {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
      this.handleConnectionFailure();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error);
      }
    };
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: any): void {
    // Handle ping/pong for connection health
    if (message.type === 'ping') {
      this.send({ type: 'pong', timestamp: Date.now() });
      return;
    }

    // Handle embedding updates
    if (message.type === 'embedding-update') {
      const update = message.data as EmbeddingUpdate;

      // Distribute to asset-specific subscribers
      const assetTopic = `asset:${update.assetId}`;
      const handlers = this.subscriptions.get(assetTopic);
      if (handlers) {
        handlers.forEach(handler => handler(update));
      }

      // Distribute to global subscribers
      const globalHandlers = this.subscriptions.get('embedding-updates');
      if (globalHandlers) {
        globalHandlers.forEach(handler => handler(update));
      }
    }

    // Handle general updates
    if (message.topic) {
      const handlers = this.subscriptions.get(message.topic);
      if (handlers) {
        handlers.forEach(handler => handler(message.data));
      }
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('[WebSocket] Max reconnection attempts reached');
      this.setConnectionState('failed');
      this.enablePollingFallback();
      return;
    }

    const delay = this.RECONNECT_DELAYS[this.reconnectAttempts] || 16000;
    logger.logInfo('websocket-manager.reconnect-scheduled', {
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
   * Handle connection failure
   */
  private handleConnectionFailure(): void {
    this.clearTimers();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.scheduleReconnect();
  }

  /**
   * Enable polling fallback when WebSocket fails
   */
  private enablePollingFallback(): void {
    logger.logInfo('websocket-manager.polling-fallback');

    if (this.pollingFallback) {
      this.pollingFallback();
    }
  }

  /**
   * Queue message for sending when reconnected
   */
  private queueMessage(message: WebSocketMessage): void {
    if (this.messageQueue.length >= this.MESSAGE_QUEUE_MAX_SIZE) {
      this.messageQueue.shift(); // Remove oldest message
    }

    this.messageQueue.push(message);
  }

  /**
   * Flush queued messages after reconnection
   */
  private flushMessageQueue(): void {
    if (!this.isConnected()) return;

    logger.logInfo('websocket-manager.flush-queue', {
      messageCount: this.messageQueue.length,
    });

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  /**
   * Resubscribe to all topics after reconnection
   */
  private resubscribeAll(): void {
    logger.logInfo('websocket-manager.resubscribe', {
      topics: this.subscriptions.size,
    });

    for (const [topic] of this.subscriptions) {
      if (topic.startsWith('assets:')) {
        // Extract asset IDs from topic
        const assetIds = topic.replace('assets:', '').split(',');
        this.send({
          type: 'subscribe',
          assetIds,
          timestamp: Date.now()
        });
      } else {
        this.send({
          type: 'subscribe',
          topic,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Start ping interval for connection health
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, this.PING_INTERVAL);
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Set connection state and notify listeners
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState === state) return;

    this.connectionState = state;
    this.stateListeners.forEach(listener => listener(state));
  }

  /**
   * Setup visibility change handlers to pause/resume connection
   */
  private setupVisibilityHandlers(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Page is hidden, clear ping interval to save resources
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
      } else {
        // Page is visible again, restart ping if connected
        if (this.isConnected() && !this.pingInterval) {
          this.startPingInterval();
        }
      }
    });

    // Handle online/offline events
    window.addEventListener('online', () => {
      logger.logInfo('websocket-manager.network-online');
      if (this.connectionState === 'failed' || this.connectionState === 'disconnected') {
        this.reconnectAttempts = 0;
        this.connect();
      }
    });

    window.addEventListener('offline', () => {
      logger.logInfo('websocket-manager.network-offline');
      this.disconnect();
    });
  }
}

// Export singleton instance getter
export const getWebSocketManager = () => WebSocketManager.getInstance();
