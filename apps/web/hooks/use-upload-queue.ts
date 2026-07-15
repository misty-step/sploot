'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { error as logError } from '@/lib/logger';
import { track } from '@/lib/analytics';
import { getUploadQueueManager } from '@/lib/upload-queue';
import { getUploadNetworkClient } from '@/lib/upload/upload-network-client';
import { useOffline } from './use-offline';

export interface QueuedUpload {
  id: string;
  persistedId: string;
  file: {
    name: string;
    size: number;
    type: string;
    lastModified: number;
  };
  status: 'queued' | 'uploading' | 'success' | 'error';
  error?: string;
  addedAt: number;
  retryCount: number;
}

function toQueuedUpload(upload: {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  lastModified: number;
  addedAt: number;
  status: string;
  error?: string;
  retryCount: number;
}): QueuedUpload {
  return {
    id: upload.id,
    persistedId: upload.id,
    file: {
      name: upload.filename,
      size: upload.size,
      type: upload.mimeType,
      lastModified: upload.lastModified,
    },
    status: upload.status === 'failed' ? 'error' : upload.status === 'uploading' ? 'uploading' : 'queued',
    error: upload.error,
    addedAt: upload.addedAt,
    retryCount: upload.retryCount,
  };
}

export function useUploadQueue({ autoProcess = false }: { autoProcess?: boolean } = {}) {
  const { isOffline } = useOffline();
  const [queue, setQueue] = useState<QueuedUpload[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const isOfflineRef = useRef(isOffline);
  const isProcessingRef = useRef(false);
  const queueManager = useMemo(() => getUploadQueueManager(), []);
  const uploadClient = useMemo(() => getUploadNetworkClient(), []);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  const refreshQueue = useCallback(async () => {
    try {
      await queueManager.init();
      const pending = await queueManager.getPendingUploads();
      setQueue(pending.map(toQueuedUpload));
    } catch (error) {
      logError('Error loading upload queue:', error);
    }
  }, [queueManager]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshQueue();
    });
  }, [refreshQueue]);

  const addToQueue = useCallback(async (file: File) => {
    track({
      name: 'upload_file_selected',
      properties: { count: 1, totalSize: file.size },
    });

    const persistedId = await queueManager.addUpload(file);
    const queuedUpload: QueuedUpload = {
      id: persistedId,
      persistedId,
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
    setQueue((previous) => [...previous, queuedUpload]);
    return queuedUpload;
  }, [queueManager]);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((previous) => previous.filter((item) => item.id !== id));
    void queueManager.removeUpload(id).catch((error) => logError('Error removing upload queue item:', error));
  }, [queueManager]);

  const updateQueueItem = useCallback((id: string, updates: Partial<QueuedUpload>) => {
    setQueue((previous) => previous.map((item) => item.id === id ? { ...item, ...updates } : item));
    if (updates.status) {
      const persistedStatus: 'pending' | 'uploading' | 'failed' = updates.status === 'error' ? 'failed' : updates.status === 'uploading' ? 'uploading' : 'pending';
      void queueManager.updateUploadStatus(id, persistedStatus, updates.error).catch((error) => logError('Error updating upload queue item:', error));
    }
  }, [queueManager]);

  const processQueue = useCallback(async () => {
    if (isOfflineRef.current || isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);
    try {
      const pending = await queueManager.getPendingUploads();
      for (const upload of pending) {
        try {
          await queueManager.updateUploadStatus(upload.id, 'uploading');
          setQueue((previous) => previous.map((item) => item.id === upload.id ? { ...item, status: 'uploading' } : item));
          const file = await queueManager.toFile(upload);
          const result = await uploadClient.uploadFile(file);
          if (!result.success) throw new Error(result.error || 'Upload failed');
          await queueManager.removeUpload(upload.id);
          setQueue((previous) => previous.filter((item) => item.id !== upload.id));
          track({ name: 'upload_completed', properties: { assetId: upload.id, duration: 0, size: upload.size } });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upload failed';
          await queueManager.updateUploadStatus(upload.id, 'failed', message);
          setQueue((previous) => previous.map((item) => item.id === upload.id ? {
            ...item,
            status: 'error',
            error: message,
            retryCount: item.retryCount + 1,
          } : item));
          track({ name: 'upload_failed', properties: { reason: message, size: upload.size } });
        }
      }
    } catch (error) {
      logError('Error processing upload queue:', error);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [queueManager, uploadClient]);

  useEffect(() => {
    if (!autoProcess || isOffline) return;
    queueMicrotask(() => {
      void processQueue();
    });
  }, [autoProcess, isOffline, processQueue]);

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
