/**
 * React hook for distributed queue integration
 *
 * Provides easy access to the distributed queue system with priority handling,
 * retry logic, and deadletter management for upload operations.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/lib/observability-logger';
import {
  DistributedQueue,
  QueueItem,
  QueuePriority,
  QueueMetrics,
  DeadLetterItem,
  ErrorType
} from '@/lib/distributed-queue';

export interface UseDistributedQueueOptions<T> {
  /**
   * Executor function to process queue items
   */
  executor: (item: QueueItem<T>) => Promise<void>;

  /**
   * Custom error classifier
   */
  errorClassifier?: (error: any) => ErrorType;

  /**
   * Auto-start processing on mount
   */
  autoStart?: boolean;

  /**
   * Concurrency level for processing
   */
  concurrency?: number;

  /**
   * Polling interval for continuous processing (ms)
   */
  pollingInterval?: number;
}

export interface UseDistributedQueueReturn<T> {
  /**
   * Enqueue a new item
   */
  enqueue: (data: T, priority?: QueuePriority, metadata?: Record<string, any>) => string;

  /**
   * Start processing queue
   */
  start: () => void;

  /**
   * Stop processing queue
   */
  stop: () => void;

  /**
   * Process a single item
   */
  processNext: () => Promise<boolean>;

  /**
   * Get current metrics
   */
  metrics: QueueMetrics;

  /**
   * Queue sizes
   */
  queueSizes: Record<QueuePriority | 'dead' | 'processing', number>;

  /**
   * Dead letter items
   */
  deadLetterItems: DeadLetterItem<T>[];

  /**
   * Retry a dead letter item
   */
  retryDeadLetter: (id: string) => boolean;

  /**
   * Clear dead letter queue
   */
  clearDeadLetter: () => number;

  /**
   * Processing state
   */
  isProcessing: boolean;

  /**
   * Queue empty state
   */
  isEmpty: boolean;
}

/**
 * Hook for managing distributed queue operations
 */
export function useDistributedQueue<T>(
  options: UseDistributedQueueOptions<T>
): UseDistributedQueueReturn<T> {
  const {
    executor,
    errorClassifier,
    autoStart = false,
    concurrency = 3,
    pollingInterval = 1000
  } = options;

  // Create queue instance
  const queueRef = useRef<DistributedQueue<T> | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);
  const [metrics, setMetrics] = useState<QueueMetrics>({
    urgent: 0,
    normal: 0,
    background: 0,
    dead: 0,
    processing: 0,
    successCount: 0,
    failureCount: 0,
    avgProcessingTime: 0
  });
  const [queueSizes, setQueueSizes] = useState<Record<QueuePriority | 'dead' | 'processing', number>>({
    urgent: 0,
    normal: 0,
    background: 0,
    dead: 0,
    processing: 0
  });
  const [deadLetterItems, setDeadLetterItems] = useState<DeadLetterItem<T>[]>([]);
  const [isEmpty, setIsEmpty] = useState(true);

  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize queue
  useEffect(() => {
    if (!queueRef.current) {
      queueRef.current = new DistributedQueue<T>(executor, errorClassifier);
    }

    // Update metrics periodically
    const updateMetrics = () => {
      if (queueRef.current) {
        setMetrics(queueRef.current.getMetrics());
        setQueueSizes(queueRef.current.getQueueSizes());
        setDeadLetterItems(queueRef.current.getDeadLetterItems());
        setIsEmpty(queueRef.current.isEmpty());
      }
    };

    // Start metrics update interval
    updateMetrics();
    metricsIntervalRef.current = setInterval(updateMetrics, 500); // Update every 500ms

    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
      }
    };
  }, [executor, errorClassifier]);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart) {
      start();
    }

    return () => {
      stop();
    };
  }, [autoStart]);

  /**
   * Enqueue a new item
   */
  const enqueue = useCallback((
    data: T,
    priority: QueuePriority = 'normal',
    metadata?: Record<string, any>
  ): string => {
    if (!queueRef.current) {
      throw new Error('Queue not initialized');
    }

    const id = queueRef.current.enqueue(data, priority, metadata);

    // If processing is active and queue was empty, trigger immediate processing
    if (isProcessing && isEmpty) {
      processNext();
    }

    return id;
  }, [isProcessing, isEmpty]);

  /**
   * Process next item
   */
  const processNext = useCallback(async (): Promise<boolean> => {
    if (!queueRef.current) return false;

    try {
      return await queueRef.current.processNext();
    } catch (error) {
      console.error('[useDistributedQueue] Error processing item:', error);
      return false;
    }
  }, []);

  /**
   * Start processing loop
   */
  const start = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing(true);

    // Create processing loop with specified concurrency
    const processLoop = async () => {
      if (!queueRef.current || !isProcessing) return;

      // Process items with concurrency control
      const workers = Array(concurrency).fill(null).map(async () => {
        if (!queueRef.current) return;
        await queueRef.current.processNext();
      });

      await Promise.all(workers);
    };

    // Start continuous processing
    processingIntervalRef.current = setInterval(processLoop, pollingInterval);

    // Initial processing
    processLoop();

    logger.logInfo('distributed-queue.processing-start', {
      concurrency,
      pollingInterval,
    });
  }, [isProcessing, concurrency, pollingInterval]);

  /**
   * Stop processing loop
   */
  const stop = useCallback(() => {
    setIsProcessing(false);

    if (processingIntervalRef.current) {
      clearInterval(processingIntervalRef.current);
      processingIntervalRef.current = null;
    }

    logger.logInfo('distributed-queue.processing-stop');
  }, []);

  /**
   * Retry a dead letter item
   */
  const retryDeadLetter = useCallback((id: string): boolean => {
    if (!queueRef.current) return false;

    const success = queueRef.current.retryDeadLetterItem(id);

    if (success && isProcessing) {
      // Trigger immediate processing for retried item
      processNext();
    }

    return success;
  }, [isProcessing]);

  /**
   * Clear dead letter queue
   */
  const clearDeadLetter = useCallback((): number => {
    if (!queueRef.current) return 0;

    return queueRef.current.clearDeadLetterQueue();
  }, []);

  return {
    enqueue,
    start,
    stop,
    processNext,
    metrics,
    queueSizes,
    deadLetterItems,
    retryDeadLetter,
    clearDeadLetter,
    isProcessing,
    isEmpty
  };
}

/**
 * Hook for upload queue management using distributed queue
 */
export function useUploadDistributedQueue(
  uploadHandler: (file: File, metadata?: Record<string, any>) => Promise<void>,
  options?: Partial<UseDistributedQueueOptions<File>>
) {
  // Custom error classifier for upload errors
  const errorClassifier = useCallback((error: any): ErrorType => {
    const message = error.message?.toLowerCase() || '';

    if (message.includes('413') || message.includes('too large')) {
      return 'invalid'; // File too large, don't retry
    }
    if (message.includes('429') || message.includes('rate limit')) {
      return 'rate_limit';
    }
    if (message.includes('network') || message.includes('fetch')) {
      return 'network';
    }
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return 'server';
    }
    if (message.includes('400') || message.includes('invalid')) {
      return 'invalid';
    }

    return 'unknown';
  }, []);

  // Wrapper executor for file uploads
  const executor = useCallback(async (item: QueueItem<File>) => {
    await uploadHandler(item.data, item.metadata);
  }, [uploadHandler]);

  return useDistributedQueue<File>({
    executor,
    errorClassifier,
    ...options
  });
}
