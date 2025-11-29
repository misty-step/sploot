'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useOffline } from './use-offline';
import { error as logError, info } from '@/lib/logger';

export interface BackgroundUpload {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileData: string; // base64
  checksum?: string;
  width?: number;
  height?: number;
  status: 'queued' | 'uploading' | 'success' | 'error';
  error?: string;
  retryCount: number;
  addedAt: number;
  updatedAt?: number;
}

const DB_NAME = 'sploot-uploads';
const DB_VERSION = 1;
const STORE_NAME = 'upload-queue';

export function useBackgroundSync() {
  const { isOffline } = useOffline();
  const [queue, setQueue] = useState<BackgroundUpload[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [supportsBackgroundSync, setSupportsBackgroundSync] = useState(false);
  const dbRef = useRef<IDBDatabase | null>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // Initialize IndexedDB
  const initDB = useCallback(async () => {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        dbRef.current = db;
        resolve(db);
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }, []);

  // Load queue from IndexedDB
  const loadQueue = useCallback(async () => {
    if (!dbRef.current) return;

    const transaction = dbRef.current.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise<BackgroundUpload[]>((resolve, reject) => {
      request.onsuccess = (event) => {
        const items = (event.target as IDBRequest).result || [];
        setQueue(items);
        resolve(items);
      };

      request.onerror = (event) => {
        reject((event.target as IDBRequest).error);
      };
    });
  }, []);

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Initialize IndexedDB
        await initDB();

        // Check for service worker and background sync support
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          const registration = await navigator.serviceWorker.ready;
          swRegistrationRef.current = registration;
          setSupportsBackgroundSync(true);

          // Listen for messages from service worker
          navigator.serviceWorker.addEventListener('message', handleSWMessage);
        }

        // Load existing queue
        await loadQueue();
        setIsReady(true);
      } catch (error) {
        logError('Failed to initialize background sync:', error);
        setIsReady(true);
      }
    };

    init();

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
      if (dbRef.current) {
        dbRef.current.close();
      }
    };
  }, [initDB, loadQueue]);

  // Handle messages from service worker
  const handleSWMessage = useCallback((event: MessageEvent) => {
    if (event.data.type === 'upload-complete') {
      // Update queue when upload completes
      removeFromQueue(event.data.id);

      // Show notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Upload Complete', {
          body: `${event.data.fileName} has been uploaded successfully`,
          icon: '/icons/icon-192x192.png',
        });
      }
    }
  }, []);

  // Add file to background sync queue
  const addToBackgroundSync = useCallback(async (file: File): Promise<string> => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Read file as base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Calculate checksum
    const checksum = await calculateChecksum(file);

    // Get image dimensions if it's an image
    let width: number | undefined;
    let height: number | undefined;
    if (file.type.startsWith('image/')) {
      const dimensions = await getImageDimensions(base64);
      width = dimensions.width;
      height = dimensions.height;
    }

    const upload: BackgroundUpload = {
      id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      fileData: base64,
      checksum,
      width,
      height,
      status: 'queued',
      retryCount: 0,
      addedAt: Date.now(),
    };

    // Store in IndexedDB
    if (dbRef.current) {
      const transaction = dbRef.current.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const request = store.add(upload);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    // Update local state
    setQueue((prev) => [...prev, upload]);

    // Register for background sync if supported
    if (supportsBackgroundSync && swRegistrationRef.current) {
      try {
        await (swRegistrationRef.current as any).sync.register('upload-queue');
        info('Background sync registered for upload queue');
      } catch (error) {
        logError('Failed to register background sync:', error);
      }
    }

    // If online and no background sync, process immediately
    if (!isOffline && !supportsBackgroundSync) {
      processUploadImmediately(upload);
    }

    return id;
  }, [isOffline, supportsBackgroundSync]);

  // Remove from queue
  const removeFromQueue = useCallback(async (id: string) => {
    if (dbRef.current) {
      const transaction = dbRef.current.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(id);
    }

    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Update queue item
  const updateQueueItem = useCallback(async (id: string, updates: Partial<BackgroundUpload>) => {
    if (dbRef.current) {
      const transaction = dbRef.current.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          const updated = { ...item, ...updates, updatedAt: Date.now() };
          store.put(updated);
        }
      };
    }

    setQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, ...updates, updatedAt: Date.now() }
          : item
      )
    );
  }, []);

  // Process upload immediately (fallback when no background sync)
  const processUploadImmediately = useCallback(async (upload: BackgroundUpload) => {
    try {
      updateQueueItem(upload.id, { status: 'uploading' });

      // Convert base64 to blob
      const response = await fetch(upload.fileData);
      const blob = await response.blob();

      // Get upload URL
      const uploadUrlResponse = await fetch('/api/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: upload.fileName,
          contentType: upload.mimeType,
        }),
      });

      if (!uploadUrlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { url: uploadUrl, pathname } = await uploadUrlResponse.json();

      // Upload to blob storage
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': upload.mimeType,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      // Create asset record
      const assetResponse = await fetch('/api/assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blobUrl: uploadUrl.split('?')[0],
          pathname,
          filename: upload.fileName,
          mimeType: upload.mimeType,
          size: upload.fileSize,
          checksum: upload.checksum,
          width: upload.width,
          height: upload.height,
        }),
      });

      if (!assetResponse.ok) {
        throw new Error('Failed to create asset record');
      }

      // Mark as successful and remove from queue
      updateQueueItem(upload.id, { status: 'success' });
      setTimeout(() => removeFromQueue(upload.id), 2000);
    } catch (error) {
      logError('Failed to upload:', error);

      const newRetryCount = upload.retryCount + 1;
      updateQueueItem(upload.id, {
        status: newRetryCount >= 3 ? 'error' : 'queued',
        error: error instanceof Error ? error.message : 'Upload failed',
        retryCount: newRetryCount,
      });
    }
  }, [updateQueueItem, removeFromQueue]);

  // Retry failed uploads
  const retryFailedUploads = useCallback(async () => {
    const failedUploads = queue.filter(
      (item) => item.status === 'error' && item.retryCount < 3
    );

    for (const upload of failedUploads) {
      updateQueueItem(upload.id, { status: 'queued', retryCount: 0 });
    }

    // Trigger background sync if supported
    if (supportsBackgroundSync && swRegistrationRef.current) {
      try {
        await (swRegistrationRef.current as any).sync.register('upload-queue');
      } catch (error) {
        logError('Failed to register background sync:', error);
      }
    } else {
      // Process immediately if online
      if (!isOffline) {
        failedUploads.forEach(processUploadImmediately);
      }
    }
  }, [queue, supportsBackgroundSync, isOffline, updateQueueItem, processUploadImmediately]);

  // Clear completed uploads
  const clearCompleted = useCallback(async () => {
    const completed = queue.filter((item) => item.status === 'success');

    if (dbRef.current) {
      const transaction = dbRef.current.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      completed.forEach((item) => {
        store.delete(item.id);
      });
    }

    setQueue((prev) => prev.filter((item) => item.status !== 'success'));
  }, [queue]);

  return {
    queue,
    isReady,
    supportsBackgroundSync,
    addToBackgroundSync,
    removeFromQueue,
    updateQueueItem,
    retryFailedUploads,
    clearCompleted,
    queueSize: queue.length,
    pendingCount: queue.filter((item) => item.status === 'queued').length,
    uploadingCount: queue.filter((item) => item.status === 'uploading').length,
    errorCount: queue.filter((item) => item.status === 'error').length,
  };
}

// Helper function to calculate file checksum
async function calculateChecksum(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Helper function to get image dimensions
function getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
    };
    img.src = base64;
  });
}