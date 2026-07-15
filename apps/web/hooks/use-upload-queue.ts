'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { error as logError } from '@/lib/logger';
import { track } from '@/lib/analytics';
import { createUploadId, getUploadQueueManager, UPLOAD_QUEUE_CLAIM_LEASE_MS, UPLOAD_QUEUE_MAX_RETRIES } from '@/lib/upload-queue';
import { getUploadNetworkClient, UploadError, type UploadResult } from '@/lib/upload/upload-network-client';
import { deriveUploadOwnerKey } from '@/lib/upload/upload-owner';
import { useOptionalAuthUser } from '@/lib/auth/client';
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
  intent: 'file' | 'url';
  status: 'queued' | 'uploading' | 'success' | 'error' | 'terminal';
  error?: string;
  addedAt: number;
  retryCount: number;
  claimGeneration: number;
  claimExpiresAt?: number;
}

export type UploadQueueEvent =
  | { id: string; status: 'queued' }
  | { id: string; status: 'uploading'; progress?: number }
  | { id: string; status: 'success'; result: UploadResult }
  | { id: string; status: 'failed' | 'ownership-lost'; error: string };

type QueueListener = () => void;
type QueueEventListener = (event: UploadQueueEvent) => void;

let queueSnapshot: QueuedUpload[] = [];
const queueListeners = new Set<QueueListener>();
const queueEventListeners = new Set<QueueEventListener>();
let queueOwner: string | null = null;
let queueProcessingPromise: Promise<void> | null = null;
let queueProcessingOwnerKey: string | null = null;
let queueProcessingRunId = 0;
let queueAccountKey: string | null = null;
let queueGeneration = 0;
const activeAbortControllers = new Map<string, AbortController>();

function getQueueOwner(): string {
  if (!queueOwner) queueOwner = `queue-${createUploadId()}`;
  return queueOwner;
}

function subscribeToQueue(listener: QueueListener): () => void {
  queueListeners.add(listener);
  return () => queueListeners.delete(listener);
}

function subscribeToQueueEvents(listener: QueueEventListener): () => void {
  queueEventListeners.add(listener);
  return () => queueEventListeners.delete(listener);
}

function emitQueueEvent(event: UploadQueueEvent): void {
  queueEventListeners.forEach((listener) => listener(event));
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
  intent: 'file' | 'url';
  filename: string;
  mimeType: string;
  size: number;
  lastModified: number;
  addedAt: number;
  status: string;
  error?: string;
  retryCount: number;
  claimGeneration: number;
  claimExpiresAt?: number;
}): QueuedUpload {
  return {
    id: upload.id,
    persistedId: upload.id,
    intent: upload.intent,
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
    claimGeneration: upload.claimGeneration ?? 0,
    claimExpiresAt: upload.claimExpiresAt,
  };
}

export function useUploadQueue({
  autoProcess = false,
  onEvent,
  ownerKey: suppliedOwnerKey,
}: {
  autoProcess?: boolean;
  onEvent?: (event: UploadQueueEvent) => void;
  ownerKey?: string;
} = {}) {
  const { isOffline } = useOffline();
  const { user } = useOptionalAuthUser();
  const queue = useSyncExternalStore(subscribeToQueue, getQueueSnapshot, getQueueSnapshot);
  const [isProcessing, setIsProcessing] = useState(false);
  const isOfflineRef = useRef(isOffline);
  const isProcessingRef = useRef(false);
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const claimOwner = getQueueOwner();
  const queueManager = useMemo(() => getUploadQueueManager(), []);
  const uploadClient = useMemo(() => getUploadNetworkClient(), []);
  const [derivedOwner, setDerivedOwner] = useState<{ userId: string; key: string } | null>(null);
  const derivedOwnerKey = user?.id && derivedOwner?.userId === user.id ? derivedOwner.key : null;
  const ownerKey = suppliedOwnerKey ?? derivedOwnerKey;

  useEffect(() => {
    let active = true;
    if (!suppliedOwnerKey && user?.id) {
      void deriveUploadOwnerKey(user.id).then((key) => {
        if (active) setDerivedOwner({ userId: user.id!, key });
      }).catch((error) => logError('Error deriving upload account partition:', error));
    }
    return () => { active = false; };
  }, [suppliedOwnerKey, user?.id]);

  useEffect(() => {
    if (queueAccountKey === ownerKey) return;
    queueGeneration += 1;
    activeAbortControllers.forEach((controller) => controller.abort());
    activeAbortControllers.clear();
    queueProcessingOwnerKey = null;
    queueProcessingPromise = null;
    queueProcessingRunId += 1;
    queueAccountKey = ownerKey;
    queueSnapshot = [];
    queueListeners.forEach((listener) => listener());
  }, [ownerKey]);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => subscribeToQueueEvents((event) => onEventRef.current?.(event)), []);

  const refreshQueue = useCallback(async () => {
    if (!ownerKey) {
      publishQueue([]);
      return;
    }
    try {
      await queueManager.init();
      const pending = await queueManager.getPendingUploads(ownerKey);
      publishQueue(pending.map(toQueuedUpload));
    } catch (error) {
      logError('Error loading upload queue:', error);
    }
  }, [ownerKey, queueManager]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshQueue();
    });
  }, [refreshQueue]);

  const addToQueue = useCallback(
    async (file: File) => {
      track({
        name: 'upload_file_selected',
        properties: { count: 1, totalSize: file.size },
      });

      if (!ownerKey) throw new Error('Sign in before adding an upload.');
      const persistedId = await queueManager.addUpload(file, ownerKey);
      const queuedUpload: QueuedUpload = {
        id: persistedId,
        persistedId,
        intent: 'file',
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        },
        status: 'queued',
        addedAt: Date.now(),
        retryCount: 0,
        claimGeneration: 0,
      };
      publishQueue((previous) => [...previous, queuedUpload]);
      return queuedUpload;
    },
    [ownerKey, queueManager],
  );

  const addUrlToQueue = useCallback(async (url: string) => {
    if (!ownerKey) throw new Error('Sign in before adding an upload.');
    const persistedId = await queueManager.addUrlUpload(url, ownerKey);
    const queuedUpload: QueuedUpload = {
      id: persistedId,
      persistedId,
      intent: 'url',
      file: { name: url, size: 0, type: 'text/uri-list', lastModified: Date.now() },
      status: 'queued',
      addedAt: Date.now(),
      retryCount: 0,
      claimGeneration: 0,
    };
    publishQueue((previous) => [...previous, queuedUpload]);
    return queuedUpload;
  }, [ownerKey, queueManager]);

  const assertCanEnqueue = useCallback((file: File) => queueManager.assertCanEnqueue(file), [queueManager]);

  const removeFromQueue = useCallback(
    async (id: string) => {
      try {
        if (!ownerKey) return false;
        const current = queueSnapshot.find((item) => item.id === id);
        if (!current) return false;
        await queueManager.removeUpload(id, ownerKey, current.claimGeneration);
        publishQueue((previous) => previous.filter((item) => item.id !== id));
        return true;
      } catch (error) {
        logError('Error removing upload queue item:', error);
        return false;
      }
    },
    [ownerKey, queueManager],
  );

  const processQueue = useCallback(async () => {
    if (isOfflineRef.current || !ownerKey) return;
    if (queueProcessingPromise && queueProcessingOwnerKey === ownerKey) return queueProcessingPromise;

    const runId = queueProcessingRunId + 1;
    queueProcessingRunId = runId;
    const run = async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      setIsProcessing(true);
      const runGeneration = queueGeneration;
      try {
        const attemptedIds = new Set<string>();
        while (true) {
          if (runGeneration !== queueGeneration || queueAccountKey !== ownerKey) return;
          const pending = await queueManager.getPendingUploads(ownerKey);
          const nextUploads = pending.filter((upload) => upload.status !== 'terminal' && !attemptedIds.has(upload.id));
          if (nextUploads.length === 0) break;

          for (const upload of nextUploads) {
            attemptedIds.add(upload.id);
            if (runGeneration !== queueGeneration || queueAccountKey !== ownerKey) return;
            const claimed = await queueManager.claimUpload(upload.id, ownerKey, claimOwner);
            if (!claimed) continue;
            try {
              emitQueueEvent({ id: upload.id, status: 'uploading' });
              publishQueue((previous) => previous.map((item) => (item.id === upload.id ? {
                ...item,
                status: 'uploading',
                claimGeneration: claimed.claimGeneration,
                claimExpiresAt: claimed.claimExpiresAt,
              } : item)));
              const controller = new AbortController();
              activeAbortControllers.set(upload.id, controller);
              const renewalTimer = setInterval(() => {
                void queueManager.renewUploadClaim(upload.id, ownerKey, claimOwner, claimed.claimGeneration, claimed.claimToken!).then((renewed) => {
                  if (!renewed) controller.abort();
                }).catch(() => controller.abort());
              }, Math.max(1_000, Math.floor(UPLOAD_QUEUE_CLAIM_LEASE_MS / 3)));
              let result: UploadResult;
              try {
                result = claimed.intent === 'url'
                  ? await uploadClient.uploadUrlWithRetry(claimed.sourceUrl!, { idempotencyKey: claimed.id, signal: controller.signal }, UPLOAD_QUEUE_MAX_RETRIES)
                  : await uploadClient.uploadWithRetry(await queueManager.toFile(claimed, ownerKey), {
                      idempotencyKey: claimed.id,
                      signal: controller.signal,
                      onProgress: (event) => emitQueueEvent({ id: upload.id, status: 'uploading', progress: event.percentage }),
                    }, UPLOAD_QUEUE_MAX_RETRIES);
              } finally {
                clearInterval(renewalTimer);
              }
              if (!result.success) throw new Error(result.error || 'Upload failed');
              const completed = await queueManager.completeUpload(upload.id, ownerKey, claimOwner, claimed.claimGeneration, claimed.claimToken!);
              if (!completed) {
                const refreshed = await queueManager.getPendingUploads(ownerKey);
                const durable = refreshed.find((candidate) => candidate.id === upload.id);
                emitQueueEvent({
                  id: upload.id,
                  status: 'ownership-lost',
                  error: 'Upload ownership was lost; retrying is required.',
                });
                publishQueue((previous) =>
                  previous.map((item) =>
                    item.id === upload.id
                      ? durable
                        ? toQueuedUpload(durable)
                        : {
                            ...item,
                            status: 'error',
                            error: 'Upload ownership was lost; retrying is required.',
                          }
                      : item,
                  ),
                );
                continue;
              }
              emitQueueEvent({ id: upload.id, status: 'success', result });
              publishQueue((previous) => previous.filter((item) => item.id !== upload.id));
              track({
                name: 'upload_completed',
                properties: {
                  assetId: upload.id,
                  duration: 0,
                  size: upload.size,
                },
              });
            } catch (error) {
              activeAbortControllers.delete(upload.id);
              const message = error instanceof Error ? error.message : 'Upload failed';
              if (runGeneration !== queueGeneration || queueAccountKey !== ownerKey) continue;
              const terminal = claimed.intent === 'url' && error instanceof UploadError && !error.isRetryable;
              const released = await queueManager.releaseUploadClaim(upload.id, ownerKey, claimOwner, claimed.claimGeneration, claimed.claimToken!, message, terminal);
              emitQueueEvent({
                id: upload.id,
                status: 'failed',
                error: released?.error ?? message,
              });
              publishQueue((previous) =>
                previous.map((item) =>
                  item.id === upload.id
                    ? {
                        ...item,
                        status: released?.status === 'terminal' ? 'terminal' : 'error',
                        error: released?.error ?? message,
                        retryCount: released?.retryCount ?? item.retryCount + 1,
                      }
                    : item,
                ),
              );
              track({
                name: 'upload_failed',
                properties: { reason: message, size: upload.size },
              });
            }
          }
        }
      } catch (error) {
        logError('Error processing upload queue:', error);
      } finally {
        isProcessingRef.current = false;
        setIsProcessing(false);
      }
    };

    queueProcessingPromise = run().finally(() => {
      if (queueProcessingRunId === runId) {
        queueProcessingPromise = null;
        queueProcessingOwnerKey = null;
      }
    });
    queueProcessingOwnerKey = ownerKey;
    return queueProcessingPromise;
  }, [claimOwner, ownerKey, queueManager, uploadClient]);

  useEffect(() => {
    if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
    const earliest = queue
      .filter((item) => item.status === 'uploading' && item.claimExpiresAt)
      .map((item) => item.claimExpiresAt!)
      .sort((a, b) => a - b)[0];
    if (earliest && !isOffline && ownerKey) {
      wakeTimerRef.current = setTimeout(() => void processQueue(), Math.max(0, earliest - Date.now() + 25));
    }
    return () => {
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
    };
  }, [isOffline, ownerKey, processQueue, queue]);

  const retryUpload = useCallback(
    async (id: string) => {
      try {
        if (!ownerKey) throw new Error('Sign in before retrying an upload.');
        const current = queueSnapshot.find((item) => item.id === id);
        if (!current) throw new Error('Upload is no longer in this account queue.');
        await queueManager.resetUploadForRetry(id, ownerKey, current.claimGeneration);
        publishQueue((previous) => previous.map((item) => (item.id === id ? { ...item, status: 'queued', error: undefined, retryCount: 0 } : item)));
        emitQueueEvent({ id, status: 'queued' });
        await processQueue();
      } catch (error) {
        logError('Error retrying upload queue item:', error);
        throw error;
      }
    },
    [ownerKey, processQueue, queueManager],
  );

  useEffect(() => {
    if (!autoProcess || isOffline || queue.length === 0) return;
    queueMicrotask(() => {
      void processQueue();
    });
  }, [autoProcess, isOffline, processQueue, queue.length]);

  return {
    queue,
    assertCanEnqueue,
    addToQueue,
    addUrlToQueue,
    removeFromQueue,
    retryUpload,
    processQueue,
    isProcessing,
    queueSize: queue.length,
    hasQueuedItems: queue.length > 0,
  };
}
