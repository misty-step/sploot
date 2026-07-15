'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOffline } from './use-offline';
import { error as logError } from '@/lib/logger';
import { track } from '@/lib/analytics';

export interface QueuedUpload {
  id: string;
  file: {
    name: string;
    size: number;
    type: string;
    lastModified: number;
  };
  blobUrl?: string;
  status: 'queued' | 'uploading' | 'success' | 'error';
  error?: string;
  addedAt: number;
  retryCount: number;
}

const STORAGE_KEY = 'sploot-upload-queue';
const MAX_RETRIES = 3;

export function useUploadQueue() {
  const { isOffline } = useOffline();
  const [queue, setQueue] = useState<QueuedUpload[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load queue from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        queueMicrotask(() => {
          setQueue(parsed.filter((item: QueuedUpload) =>
            item.status === 'queued' || item.status === 'error'
          ));
        });
      } catch (error) {
        logError('Error loading upload queue:', error);
      }
    }
  }, []);

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    if (queue.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [queue]);

  // Add file to queue
  const addToQueue = useCallback((file: File) => {
    track({
      name: 'upload_file_selected',
      properties: {
        count: 1,
        totalSize: file.size,
      },
    });

    const queuedUpload: QueuedUpload = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      },
      status: 'queued',
      addedAt: Date.now(),
      retryCount: 0,
    };

    setQueue((prev) => [...prev, queuedUpload]);

    // Store file data as base64 if offline
    if (isOffline) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setQueue((prev) =>
          prev.map((item) =>
            item.id === queuedUpload.id
              ? { ...item, blobUrl: base64 }
              : item
          )
        );
      };
      reader.readAsDataURL(file);
    }

    return queuedUpload;
  }, [isOffline]);

  // Remove from queue
  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Update queue item
  const updateQueueItem = useCallback((id: string, updates: Partial<QueuedUpload>) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      )
    );
  }, []);

  // Process queue when online
  const processQueue = useCallback(async () => {
    if (isOffline || isProcessing) return;

    const pendingItems = queue.filter(
      (item) => item.status === 'queued' ||
      (item.status === 'error' && item.retryCount < MAX_RETRIES)
    );

    if (pendingItems.length === 0) return;

    setIsProcessing(true);

    for (const item of pendingItems) {
      try {
        updateQueueItem(item.id, { status: 'uploading' });
        track({
          name: 'upload_started',
          properties: {
            size: item.file.size,
          },
        });

        // Convert base64 back to File if needed
        let file: File;
        if (item.blobUrl && item.blobUrl.startsWith('data:')) {
          const response = await fetch(item.blobUrl);
          const blob = await response.blob();
          file = new File([blob], item.file.name, { type: item.file.type });
        } else {
          // Try to reconstruct file from stored metadata
          // This won't work for actual file content, but allows the upload flow to continue
          file = new File([], item.file.name, { type: item.file.type });
        }

        // Here you would call your actual upload function
        // For now, we'll simulate with a timeout
        const uploadStart = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const duration = performance.now() - uploadStart;

        // Mark as successful and remove from queue
        updateQueueItem(item.id, { status: 'success' });
        track({
          name: 'upload_completed',
          properties: {
            duration: Math.round(duration),
            size: item.file.size,
          },
        });
        setTimeout(() => removeFromQueue(item.id), 2000);
      } catch (error) {
        const newRetryCount = item.retryCount + 1;
        updateQueueItem(item.id, {
          status: newRetryCount >= MAX_RETRIES ? 'error' : 'queued',
          error: error instanceof Error ? error.message : 'Upload failed',
          retryCount: newRetryCount,
        });
        track({
          name: 'upload_failed',
          properties: {
            reason: 'unknown',
            size: item.file.size,
          },
        });
      }
    }

    setIsProcessing(false);
  }, [isOffline, isProcessing, queue, updateQueueItem, removeFromQueue]);

  // Process queue when coming back online
  useEffect(() => {
    if (!isOffline && queue.length > 0) {
      queueMicrotask(() => {
        void processQueue();
      });
    }
  }, [isOffline, queue.length, processQueue]);

  return {
    queue,
    addToQueue,
    removeFromQueue,
    updateQueueItem,
    processQueue,
    isProcessing,
    queueSize: queue.length,
    hasQueuedItems: queue.length > 0,
  };
}
