'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
  status: 'queued' | 'uploading' | 'success' | 'error' | 'terminal';
  error?: string;
  addedAt: number;
  retryCount: number;
}

type QueueListener = () => void;
let queueSnapshot: QueuedUpload[] = [];
const queueListeners = new Set<QueueListener>();

function subscribeToQueue(listener: QueueListener): () => void {
  queueListeners.add(listener);
  return () => queueListeners.delete(listener);
}

function getQueueSnapshot(): QueuedUpload[] {
  return queueSnapshot;
}

function publishQueue(next: QueuedUpload[] | ((previous: QueuedUpload[]) => QueuedUpload[])): void {
  queueSnapshot = typeof next === 'function' ? next(queueSnapshot) : next;
  queueListeners.forEach((listener) => listener());
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
    status: upload.status === 'terminal' ? 'terminal' : upload.status === 'failed' ? 'error' : upload.status === 'uploading' ? 'uploading' : 'queued',
    error: upload.error,
    addedAt: upload.addedAt,
    retryCount: upload.retryCount,
  };
}

export function useUploadQueue({ autoProcess = false }: { autoProcess?: boolean } = {}) {
  const { isOffline } = useOffline();
  const queue = useSyncExternalStore(subscribeToQueue, getQueueSnapshot, getQueueSnapshot);
  const [isProcessing, setIsProcessing] = useState(false);
  const isOfflineRef = useRef(isOffline);
  const isProcessingRef = useRef(false);
  const claimOwner = `queue-${useId()}`;
  const queueManager = useMemo(() => getUploadQueueManager(), []);
  const uploadClient = useMemo(() => getUploadNetworkClient(), []);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  const refreshQueue = useCallback(async () => {
    try {
      await queueManager.init();
      const pending = await queueManager.getPendingUploads();
      publishQueue(pending.map(toQueuedUpload));
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
    publishQueue((previous) => [...previous, queuedUpload]);
    return queuedUpload;
  }, [queueManager]);

  const removeFromQueue = useCallback((id: string) => {
    publishQueue((previous) => previous.filter((item) => item.id !== id));
    void queueManager.removeUpload(id).catch((error) => logError('Error removing upload queue item:', error));
  }, [queueManager]);

  const updateQueueItem = useCallback((id: string, updates: Partial<QueuedUpload>) => {
    publishQueue((previous) => previous.map((item) => item.id === id ? { ...item, ...updates } : item));
    if (updates.status === 'queued' && updates.retryCount === 0) {
      void queueManager.resetUploadForRetry(id).catch((error) => logError('Error resetting upload retry count:', error));
    } else if (updates.status) {
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
        if (upload.status === 'terminal') continue;
        const claimed = await queueManager.claimUpload(upload.id, claimOwner);
        if (!claimed) continue;
        try {
          publishQueue((previous) => previous.map((item) => item.id === upload.id ? { ...item, status: 'uploading' } : item));
          const file = await queueManager.toFile(claimed);
          const result = await uploadClient.uploadFile(file, { idempotencyKey: claimed.id });
          if (!result.success) throw new Error(result.error || 'Upload failed');
          await queueManager.completeUpload(upload.id, claimOwner);
          publishQueue((previous) => previous.filter((item) => item.id !== upload.id));
          track({ name: 'upload_completed', properties: { assetId: upload.id, duration: 0, size: upload.size } });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upload failed';
          const released = await queueManager.releaseUploadClaim(upload.id, claimOwner, message);
          publishQueue((previous) => previous.map((item) => item.id === upload.id ? {
            ...item,
            status: released?.status === 'terminal' ? 'terminal' : 'error',
            error: released?.error ?? message,
            retryCount: released?.retryCount ?? item.retryCount + 1,
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
  }, [claimOwner, queueManager, uploadClient]);

  const retryUpload = useCallback(async (id: string) => {
    await queueManager.resetUploadForRetry(id);
    publishQueue((previous) => previous.map((item) => item.id === id ? { ...item, status: 'queued', error: undefined, retryCount: 0 } : item));
    await processQueue();
  }, [processQueue, queueManager]);

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
    retryUpload,
    processQueue,
    isProcessing,
    queueSize: queue.length,
    hasQueuedItems: queue.length > 0,
  };
}
