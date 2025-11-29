// Background Sync for Upload Queue
// This service worker handles background sync for failed uploads

// Register background sync when uploads fail
self.addEventListener('sync', async (event) => {
  if (event.tag === 'upload-queue') {
    event.waitUntil(processUploadQueue());
  }
});

// Process queued uploads
async function processUploadQueue() {
  try {
    // Get queued uploads from IndexedDB
    const queue = await getQueuedUploads();

    if (queue.length === 0) {
      console.log('[SW] No uploads in queue');
      return;
    }

    console.log(`[SW] Processing ${queue.length} queued uploads`);

    for (const item of queue) {
      try {
        // Skip if already processed
        if (item.status === 'success') {
          await removeFromQueue(item.id);
          continue;
        }

        // Check retry count
        if (item.retryCount >= 3) {
          console.error(`[SW] Max retries reached for upload ${item.id}`);
          await updateQueueItem(item.id, { status: 'error', error: 'Max retries exceeded' });
          continue;
        }

        console.log(`[SW] Processing upload ${item.id}: ${item.fileName}`);

        // Recreate the file from stored data
        const blob = await base64ToBlob(item.fileData);
        const formData = new FormData();
        formData.append('file', blob, item.fileName);

        // First, get the upload URL
        const uploadUrlResponse = await fetch('/api/upload-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: item.fileName,
            contentType: item.mimeType,
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
            'Content-Type': item.mimeType,
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
            blobUrl: uploadUrl.split('?')[0], // Remove query params
            pathname,
            filename: item.fileName,
            mimeType: item.mimeType,
            size: item.fileSize,
            checksum: item.checksum,
            width: item.width,
            height: item.height,
          }),
        });

        if (!assetResponse.ok) {
          throw new Error('Failed to create asset record');
        }

        // Mark as successful
        await updateQueueItem(item.id, { status: 'success' });

        // Notify the client
        await self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'upload-complete',
              id: item.id,
              fileName: item.fileName,
            });
          });
        });

        console.log(`[SW] Successfully uploaded ${item.fileName}`);
      } catch (error) {
        console.error(`[SW] Failed to upload ${item.fileName}:`, error);

        // Increment retry count
        const newRetryCount = (item.retryCount || 0) + 1;
        await updateQueueItem(item.id, {
          status: 'error',
          error: error.message,
          retryCount: newRetryCount,
        });

        // If we still have retries left, schedule another sync
        if (newRetryCount < 3) {
          await self.registration.sync.register('upload-queue');
        }
      }
    }
  } catch (error) {
    console.error('[SW] Error processing upload queue:', error);
  }
}

// IndexedDB operations
const DB_NAME = 'sploot-uploads';
const DB_VERSION = 1;
const STORE_NAME = 'upload-queue';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function getQueuedUploads() {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = (event) => {
      resolve(event.target.result || []);
    };
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function updateQueueItem(id, updates) {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const getRequest = store.get(id);

    getRequest.onsuccess = (event) => {
      const item = event.target.result;
      if (item) {
        const updated = { ...item, ...updates, updatedAt: Date.now() };
        const putRequest = store.put(updated);

        putRequest.onsuccess = () => resolve(updated);
        putRequest.onerror = (event) => reject(event.target.error);
      } else {
        resolve(null);
      }
    };

    getRequest.onerror = (event) => reject(event.target.error);
  });
}

async function removeFromQueue(id) {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

// Helper function to convert base64 to blob
function base64ToBlob(base64Data) {
  try {
    // Remove data URL prefix if present
    const base64String = base64Data.replace(/^data:[^;]+;base64,/, '');

    // Decode base64
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Detect MIME type from data URL or default to image/jpeg
    const mimeMatch = base64Data.match(/^data:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    return new Blob([bytes], { type: mimeType });
  } catch (error) {
    console.error('[SW] Error converting base64 to blob:', error);
    throw error;
  }
}

// Listen for messages from the client
self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'queue-upload') {
    // Store the upload in IndexedDB
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const uploadData = {
      ...event.data.upload,
      status: 'queued',
      retryCount: 0,
      addedAt: Date.now(),
    };

    store.add(uploadData);

    // Register for background sync
    await self.registration.sync.register('upload-queue');

    event.ports[0].postMessage({ success: true });
  }

  if (event.data && event.data.type === 'check-queue') {
    const queue = await getQueuedUploads();
    event.ports[0].postMessage({ queue });
  }
});

// Periodic sync for retry (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'upload-retry') {
    event.waitUntil(processUploadQueue());
  }
});

console.log('[SW] Background sync for uploads initialized');