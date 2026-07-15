import { logger } from '@/lib/observability-logger';
import { UPLOAD, isValidMimeType } from '@sploot/common';

/**
 * Upload Queue Persistence Manager
 * Persists pending uploads to IndexedDB for recovery after interruptions
 */

export interface PersistedUpload {
  id: string;
  /** Hashed Clerk account partition; raw user IDs never enter IndexedDB. */
  ownerKey: string;
  intent: 'file' | 'url';
  filename: string;
  mimeType: string;
  size: number;
  lastModified: number;
  /** Materialized only when this exact claimed file is read for upload. */
  fileData?: ArrayBuffer;
  sourceUrl?: string;
  addedAt: number;
  firstAddedAt?: number;
  attemptStartedAt?: number;
  status: 'pending' | 'uploading' | 'failed' | 'terminal';
  error?: string;
  retryCount: number;
  /** Monotonic generation incremented for every claim, including reclaimed claims. */
  claimGeneration: number;
  claimOwner?: string;
  /** Random token for this exact claim generation, not just the tab owner. */
  claimToken?: string;
  claimExpiresAt?: number;
}

export const UPLOAD_QUEUE_MAX_RETRIES = 3;
export const UPLOAD_QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const UPLOAD_QUEUE_MAX_BYTES = 250 * 1024 * 1024;
export const UPLOAD_QUEUE_MAX_ENTRIES = 100;
export const UPLOAD_QUEUE_MAX_URL_LENGTH = 2_048;
/** Must exceed the network client's 10-second request timeout. */
export const UPLOAD_QUEUE_CLAIM_LEASE_MS = 2 * 60 * 1000;

export function createUploadId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Secure upload identifiers are unavailable in this browser.');
}

function uploadAttemptStartedAt(upload: PersistedUpload): number {
  return upload.attemptStartedAt ?? upload.addedAt;
}

function isUploadExpired(upload: PersistedUpload, now: number): boolean {
  return uploadAttemptStartedAt(upload) <= now - UPLOAD_QUEUE_MAX_AGE_MS;
}

export class UploadQueueStorageLimitError extends Error {
  constructor() {
    super('Upload queue storage is full. Remove a queued upload before adding another file.');
    this.name = 'UploadQueueStorageLimitError';
  }
}

export class UploadQueueStorageUnavailableError extends Error {
  constructor(message = 'Durable upload storage is unavailable. Keep this upload open and try again.') {
    super(message);
    this.name = 'UploadQueueStorageUnavailableError';
  }
}

export class UploadQueueFileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadQueueFileValidationError';
  }
}

export class UploadQueueClaimActiveError extends Error {
  constructor() {
    super('Upload is currently owned by another live attempt.');
    this.name = 'UploadQueueClaimActiveError';
  }
}

export class UploadQueueClaimStaleError extends Error {
  constructor() {
    super('Upload claim generation changed; refresh before retrying or removing it.');
    this.name = 'UploadQueueClaimStaleError';
  }
}

/**
 * Manages upload persistence using IndexedDB
 */
export class UploadQueueManager {
  private static instance: UploadQueueManager | null = null;
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'sploot_uploads';
  private readonly DB_VERSION = 4;
  private readonly STORE_NAME = 'pending_uploads';
  private readonly PAYLOAD_STORE_NAME = 'upload_payloads';

  private constructor() {}

  /** Create an independent manager that shares the durable IndexedDB store. */
  static create(): UploadQueueManager {
    return new UploadQueueManager();
  }

  static getInstance(): UploadQueueManager {
    if (!UploadQueueManager.instance) {
      UploadQueueManager.instance = new UploadQueueManager();
    }
    return UploadQueueManager.instance;
  }

  /**
   * Initialize IndexedDB connection
   */
  async init(): Promise<void> {
    if (this.db) return;

    // Check if IndexedDB is available
    if (typeof indexedDB === 'undefined') {
      throw new UploadQueueStorageUnavailableError();
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error('[UploadQueue] Failed to open IndexedDB:', request.error);
        reject(new UploadQueueStorageUnavailableError('Durable upload storage failed to open.'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        logger.logInfo('upload-queue.db-initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, {
            keyPath: 'id',
          });
          store.createIndex('addedAt', 'addedAt', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('claimExpiresAt', 'claimExpiresAt', {
            unique: false,
          });
          store.createIndex('ownerKey', 'ownerKey', { unique: false });
        } else {
          const store = (event.target as IDBOpenDBRequest).transaction?.objectStore(this.STORE_NAME);
          if (store && !store.indexNames.contains('claimExpiresAt')) {
            store.createIndex('claimExpiresAt', 'claimExpiresAt', {
              unique: false,
            });
          }
          if (store && !store.indexNames.contains('ownerKey')) {
            store.createIndex('ownerKey', 'ownerKey', { unique: false });
          }
          if (store) {
            const cursor = store.openCursor();
            cursor.onsuccess = () => {
              if (!cursor.result) return;
              const record = cursor.result.value as Partial<PersistedUpload>;
              if (typeof record.claimGeneration !== 'number') {
                cursor.result.update({ ...record, claimGeneration: 0 });
              }
              cursor.result.continue();
            };
          }
        }
        if (!db.objectStoreNames.contains(this.PAYLOAD_STORE_NAME)) {
          db.createObjectStore(this.PAYLOAD_STORE_NAME, { keyPath: 'id' });
        }
        const metadataStore = (event.target as IDBOpenDBRequest).transaction?.objectStore(this.STORE_NAME);
        const payloadStore = (event.target as IDBOpenDBRequest).transaction?.objectStore(this.PAYLOAD_STORE_NAME);
        if (metadataStore && payloadStore) {
          const cursor = metadataStore.openCursor();
          cursor.onsuccess = () => {
            if (!cursor.result) return;
            const record = cursor.result.value as PersistedUpload;
            if (record.fileData) {
              payloadStore.put({ id: record.id, fileData: record.fileData });
              const { fileData: _fileData, ...metadata } = record;
              cursor.result.update(metadata);
            }
            cursor.result.continue();
          };
        }
      };
    });
  }

  /** Validate metadata and capacity without reading file bytes. */
  async assertCanEnqueue(file: File): Promise<void> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new UploadQueueStorageUnavailableError();
    }
    this.validateFileMetadata(file);
    const usage = await this.getStorageUsage();
    if (usage.count >= UPLOAD_QUEUE_MAX_ENTRIES || usage.totalBytes + file.size > UPLOAD_QUEUE_MAX_BYTES) {
      throw new UploadQueueStorageLimitError();
    }
  }

  private assertOwnerKey(ownerKey: string): void {
    if (!ownerKey || !/^account-[a-f0-9]{64}$/.test(ownerKey)) {
      throw new Error('Upload queue requires a valid authenticated account partition.');
    }
  }

  private validateFileMetadata(file: File): void {
    if (!isValidMimeType(file.type)) {
      throw new UploadQueueFileValidationError(`Unsupported upload file type: ${file.type || 'unknown'}`);
    }
    if (file.size <= 0 || file.size > UPLOAD.maxSize || file.size > UPLOAD_QUEUE_MAX_BYTES) {
      throw new UploadQueueStorageLimitError();
    }
  }

  /**
   * Add a file to the persisted upload queue
   */
  async addUpload(file: File, ownerKey: string, collisionAttempt = 0): Promise<string> {
    this.assertOwnerKey(ownerKey);
    await this.assertCanEnqueue(file);

    const id = createUploadId();
    const addedAt = Date.now();

    // Convert File to ArrayBuffer for storage
    const arrayBuffer = await file.arrayBuffer();

    const upload: PersistedUpload = {
      id,
      ownerKey,
      intent: 'file',
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      lastModified: file.lastModified,
      fileData: arrayBuffer,
      addedAt,
      firstAddedAt: addedAt,
      attemptStartedAt: addedAt,
      status: 'pending',
      retryCount: 0,
      claimGeneration: 0,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME, this.PAYLOAD_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const payloadStore = transaction.objectStore(this.PAYLOAD_STORE_NAME);
      let failure: Error | DOMException | null = null;
      let committed = false;
      let count = 0;
      let totalBytes = 0;
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const existing = cursor.value as PersistedUpload;
          count += 1;
          totalBytes += existing.size;
          cursor.continue();
          return;
        }
        if (count >= UPLOAD_QUEUE_MAX_ENTRIES || totalBytes + upload.size > UPLOAD_QUEUE_MAX_BYTES) {
          failure = new UploadQueueStorageLimitError();
          transaction.abort();
          return;
        }
        const { fileData: _fileData, ...metadata } = upload;
        const request = store.add(metadata);
        payloadStore.add({ id: upload.id, fileData: arrayBuffer });
        request.onsuccess = () => logger.logInfo('upload-queue.persisted', { filename: file.name, size: file.size });
        request.onerror = () => {
          failure = request.error;
          transaction.abort();
        };
      };

      cursorRequest.onerror = () => {
        failure = cursorRequest.error;
        transaction.abort();
      };
      transaction.oncomplete = () => {
        committed = true;
        resolve(id);
      };
      transaction.onerror = () => {
        if (!failure) failure = transaction.error;
      };
      transaction.onabort = () => {
        if (committed) return;
        if (failure?.name === 'ConstraintError' && collisionAttempt < 3) {
          void this.addUpload(file, ownerKey, collisionAttempt + 1).then(resolve, reject);
          return;
        }
        reject(failure ?? transaction.error ?? new Error('Upload queue transaction aborted before commit.'));
      };
    });
  }

  async addUrlUpload(url: string, ownerKey: string, collisionAttempt = 0): Promise<string> {
    this.assertOwnerKey(ownerKey);
    if (!/^https?:\/\/[^\s]{1,2040}$/i.test(url) || url.length > UPLOAD_QUEUE_MAX_URL_LENGTH) {
      throw new UploadQueueFileValidationError('URL import is invalid or too long.');
    }
    if (!this.db) await this.init();
    if (!this.db) throw new UploadQueueStorageUnavailableError();
    const usage = await this.getStorageUsage();
    if (usage.count >= UPLOAD_QUEUE_MAX_ENTRIES) throw new UploadQueueStorageLimitError();
    const now = Date.now();
    const upload: PersistedUpload = {
      id: createUploadId(),
      ownerKey,
      intent: 'url',
      filename: url,
      mimeType: '',
      size: 0,
      lastModified: now,
      sourceUrl: url,
      addedAt: now,
      firstAddedAt: now,
      attemptStartedAt: now,
      status: 'pending',
      retryCount: 0,
      claimGeneration: 0,
    };
    return this.putUpload(upload, ownerKey, collisionAttempt);
  }

  private async putUpload(upload: PersistedUpload, ownerKey: string, collisionAttempt: number): Promise<string> {
    if (!this.db) throw new UploadQueueStorageUnavailableError();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME, this.PAYLOAD_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      let failure: Error | DOMException | null = null;
      let committed = false;
      let count = 0;
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          count += 1;
          cursor.continue();
          return;
        }
        if (count >= UPLOAD_QUEUE_MAX_ENTRIES) {
          failure = new UploadQueueStorageLimitError();
          transaction.abort();
          return;
        }
        const request = store.add(upload);
        request.onerror = () => {
          failure = request.error;
          transaction.abort();
        };
      };
      cursorRequest.onerror = () => {
        failure = cursorRequest.error;
        transaction.abort();
      };
      transaction.oncomplete = () => {
        committed = true;
        resolve(upload.id);
      };
      transaction.onerror = () => {
        if (!failure) failure = transaction.error;
      };
      transaction.onabort = () => {
        if (committed) return;
        if (failure?.name === 'ConstraintError' && collisionAttempt < 3) {
          void this.putUpload({ ...upload, id: createUploadId() }, ownerKey, collisionAttempt + 1).then(resolve, reject);
          return;
        }
        reject(failure ?? transaction.error ?? new Error('Upload queue transaction aborted before commit.'));
      };
    });
  }

  private async getStorageUsage(): Promise<{
    count: number;
    totalBytes: number;
  }> {
    if (!this.db) throw new UploadQueueStorageUnavailableError();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const request = transaction.objectStore(this.STORE_NAME).openCursor();
      const usage = { count: 0, totalBytes: 0 };
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const upload = cursor.value as PersistedUpload;
        usage.count += 1;
        usage.totalBytes += upload.size;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(usage);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Upload queue usage read aborted.'));
    });
  }

  /**
   * Update upload status
   */
  async updateUploadStatus(id: string, ownerKey: string, status: PersistedUpload['status'], error?: string): Promise<void> {
    this.assertOwnerKey(ownerKey);
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME, this.PAYLOAD_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const upload = getRequest.result;
        if (!upload || upload.ownerKey !== ownerKey) {
          resolve();
          return;
        }

        upload.status = status;
        if (error) upload.error = error;
        if (status === 'failed') upload.retryCount++;
        delete upload.claimOwner;
        delete upload.claimToken;
        delete upload.claimExpiresAt;
        if (upload.retryCount >= UPLOAD_QUEUE_MAX_RETRIES) {
          upload.status = 'terminal';
          upload.error = upload.error ?? 'Automatic retries exhausted. Retry or remove this upload.';
        }
        if (isUploadExpired(upload, Date.now())) {
          upload.status = 'terminal';
          upload.error = upload.error ?? 'Upload is older than 24 hours. Retry or remove this upload.';
        }

        const updateRequest = store.put(upload);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /** Atomically claim one upload for a tab/manager, recovering stale claims. */
  async claimUpload(id: string, ownerKey: string, owner: string, leaseMs = UPLOAD_QUEUE_CLAIM_LEASE_MS): Promise<PersistedUpload | null> {
    this.assertOwnerKey(ownerKey);
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME, this.PAYLOAD_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.get(id);
      let claimed: PersistedUpload | null = null;

      request.onsuccess = () => {
        const upload = request.result as PersistedUpload | undefined;
        if (!upload || upload.ownerKey !== ownerKey || upload.status === 'terminal') return;
        const now = Date.now();
        if (upload.status === 'uploading' && (upload.claimExpiresAt ?? 0) > now) return;
        if (upload.retryCount >= UPLOAD_QUEUE_MAX_RETRIES || isUploadExpired(upload, now)) {
          upload.status = 'terminal';
          upload.error = upload.retryCount >= UPLOAD_QUEUE_MAX_RETRIES ? 'Automatic retries exhausted. Retry or remove this upload.' : 'Upload is older than 24 hours. Retry or remove this upload.';
          delete upload.claimOwner;
          delete upload.claimToken;
          delete upload.claimExpiresAt;
          store.put(upload);
          return;
        }

        upload.status = 'uploading';
        upload.claimOwner = owner;
        upload.claimToken = createUploadId();
        upload.claimGeneration = (upload.claimGeneration ?? 0) + 1;
        upload.claimExpiresAt = now + leaseMs;
        const updateRequest = store.put(upload);
        updateRequest.onsuccess = () => {
          claimed = upload;
        };
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(claimed);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('upload claim transaction aborted'));
    });
  }

  /** Record a failed attempt only if this manager still owns the claim. */
  async releaseUploadClaim(id: string, ownerKey: string, owner: string, claimGeneration: number, claimToken: string, error?: string): Promise<PersistedUpload | null> {
    this.assertOwnerKey(ownerKey);
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME, this.PAYLOAD_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.get(id);
      let released: PersistedUpload | null = null;
      request.onsuccess = () => {
        const upload = request.result as PersistedUpload | undefined;
        if (!upload || upload.ownerKey !== ownerKey || upload.claimOwner !== owner || upload.claimGeneration !== claimGeneration || upload.claimToken !== claimToken || (upload.claimExpiresAt ?? 0) <= Date.now()) return;
        upload.status = 'failed';
        upload.retryCount += 1;
        upload.error = error;
        delete upload.claimOwner;
        delete upload.claimToken;
        delete upload.claimExpiresAt;
        if (upload.retryCount >= UPLOAD_QUEUE_MAX_RETRIES) {
          upload.status = 'terminal';
          upload.error = 'Automatic retries exhausted. Retry or remove this upload.';
        } else if (isUploadExpired(upload, Date.now())) {
          upload.status = 'terminal';
          upload.error = 'Upload is older than 24 hours. Retry or remove this upload.';
        }
        const updateRequest = store.put(upload);
        updateRequest.onsuccess = () => {
          released = upload;
        };
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(released);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('upload claim release transaction aborted'));
    });
  }

  /** Delete an upload only after its owning claim has completed successfully. */
  async completeUpload(id: string, ownerKey: string, owner: string, claimGeneration: number, claimToken: string): Promise<boolean> {
    this.assertOwnerKey(ownerKey);
    if (!this.db) return false;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME, this.PAYLOAD_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.get(id);
      let completed = false;
      request.onsuccess = () => {
        const upload = request.result as PersistedUpload | undefined;
        if (!upload || upload.ownerKey !== ownerKey || upload.claimOwner !== owner || upload.claimGeneration !== claimGeneration || upload.claimToken !== claimToken || (upload.claimExpiresAt ?? 0) <= Date.now()) return;
        store.delete(id);
        transaction.objectStore(this.PAYLOAD_STORE_NAME).delete(id);
        completed = true;
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(completed);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('upload completion transaction aborted'));
    });
  }

  /** Atomically make a failed upload eligible for a fresh manual attempt. */
  async resetUploadForRetry(id: string, ownerKey: string, expectedClaimGeneration: number): Promise<void> {
    this.assertOwnerKey(ownerKey);
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME, this.PAYLOAD_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const getRequest = store.get(id);
      let failure: Error | null = null;

      getRequest.onsuccess = () => {
        const upload = getRequest.result as PersistedUpload | undefined;
        if (!upload || upload.ownerKey !== ownerKey) return;

        if ((upload.claimGeneration ?? 0) !== expectedClaimGeneration) {
          failure = new UploadQueueClaimStaleError();
          transaction.abort();
          return;
        }

        if (upload.status === 'uploading' && (upload.claimExpiresAt ?? 0) > Date.now()) {
          failure = new UploadQueueClaimActiveError();
          transaction.abort();
          return;
        }

        upload.status = 'pending';
        upload.retryCount = 0;
        upload.attemptStartedAt = Date.now();
        delete upload.error;
        delete upload.claimOwner;
        delete upload.claimToken;
        delete upload.claimExpiresAt;
        const updateRequest = store.put(upload);
        updateRequest.onerror = () => reject(updateRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('upload retry reset transaction aborted'));
    });
  }

  /**
   * Remove successfully uploaded file
   */
  async removeUpload(id: string, ownerKey: string, expectedClaimGeneration: number): Promise<void> {
    this.assertOwnerKey(ownerKey);
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME, this.PAYLOAD_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const getRequest = store.get(id);
      let failure: Error | null = null;

      getRequest.onsuccess = () => {
        const upload = getRequest.result as PersistedUpload | undefined;
        if (!upload || upload.ownerKey !== ownerKey) return;
        if ((upload.claimGeneration ?? 0) !== expectedClaimGeneration) {
          failure = new UploadQueueClaimStaleError();
          transaction.abort();
          return;
        }
        if (upload.status === 'uploading' && (upload.claimExpiresAt ?? 0) > Date.now()) {
          failure = new UploadQueueClaimActiveError();
          transaction.abort();
          return;
        }
        const deleteRequest = store.delete(id);
        transaction.objectStore(this.PAYLOAD_STORE_NAME).delete(id);
        deleteRequest.onerror = () => {
          failure = deleteRequest.error;
          transaction.abort();
        };
      };

      getRequest.onerror = () => {
        failure = getRequest.error;
        transaction.abort();
      };
      transaction.oncomplete = () => {
        logger.logInfo('upload-queue.removed', { id });
        resolve();
      };
      transaction.onerror = () => {
        if (!failure) failure = transaction.error;
      };
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('upload removal transaction aborted'));
    });
  }

  /**
   * Get all pending uploads
   */
  async getPendingUploads(ownerKey: string): Promise<PersistedUpload[]> {
    this.assertOwnerKey(ownerKey);
    if (!this.db) {
      await this.init();
      if (!this.db) return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.index('ownerKey').openCursor(IDBKeyRange.only(ownerKey));
      const normalizedUploads: PersistedUpload[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const upload = cursor.value as PersistedUpload;
        const normalized = { ...upload };
        const expired = isUploadExpired(normalized, Date.now());
        if (normalized.status === 'uploading' && (normalized.claimExpiresAt ?? 0) <= Date.now()) {
          normalized.status = 'pending';
          delete normalized.claimOwner;
          delete normalized.claimToken;
          delete normalized.claimExpiresAt;
        }
        if (normalized.status !== 'terminal' && (expired || normalized.retryCount >= UPLOAD_QUEUE_MAX_RETRIES)) {
          normalized.status = 'terminal';
          normalized.error = expired ? 'Upload is older than 24 hours. Retry or remove this upload.' : 'Automatic retries exhausted. Retry or remove this upload.';
          delete normalized.claimOwner;
          delete normalized.claimToken;
          delete normalized.claimExpiresAt;
        }
        if (normalized.status !== upload.status || normalized.error !== upload.error || normalized.claimOwner !== upload.claimOwner || normalized.claimToken !== upload.claimToken) {
          cursor.update(normalized);
        }
        const { fileData: _fileData, ...metadata } = normalized;
        normalizedUploads.push(metadata);
        cursor.continue();
      };

      request.onerror = () => {
        console.error('[UploadQueue] Failed to get pending uploads:', request.error);
        reject(request.error);
      };
      transaction.oncomplete = () => resolve(normalizedUploads);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('upload queue read transaction aborted'));
    });
  }

  /** Convert persisted upload back to File object. */
  async toFile(upload: PersistedUpload, ownerKey: string): Promise<File> {
    this.assertOwnerKey(ownerKey);
    const stored = await this.getOwnedUpload(upload.id, ownerKey, upload.claimToken, upload.claimGeneration);
    if (!stored || stored.intent !== 'file' || !stored.fileData || stored.claimToken !== upload.claimToken || stored.claimGeneration !== upload.claimGeneration) {
      throw new UploadQueueClaimStaleError();
    }
    const blob = new Blob([stored.fileData], { type: stored.mimeType });
    return new File([blob], stored.filename, { type: stored.mimeType, lastModified: stored.lastModified });
  }

  private async getOwnedUpload(id: string, ownerKey: string, claimToken?: string, claimGeneration?: number): Promise<PersistedUpload | null> {
    if (!this.db) await this.init();
    if (!this.db) throw new UploadQueueStorageUnavailableError();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME, this.PAYLOAD_STORE_NAME], 'readonly');
      const request = transaction.objectStore(this.STORE_NAME).get(id);
      const payloadStore = transaction.objectStore(this.PAYLOAD_STORE_NAME);
      let result: PersistedUpload | null = null;
      let payload: { fileData?: ArrayBuffer } | undefined;
      request.onsuccess = () => {
        const upload = request.result as PersistedUpload | undefined;
        if (upload?.ownerKey === ownerKey && upload.claimToken === claimToken && upload.claimGeneration === claimGeneration) {
          result = upload;
          const payloadRequest = payloadStore.get(id);
          payloadRequest.onsuccess = () => { payload = payloadRequest.result as { fileData?: ArrayBuffer } | undefined; };
        }
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result ? { ...result, fileData: payload?.fileData } : null);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Upload lookup aborted.'));
    });
  }

  /**
   * Clear all persisted uploads
   */
  async clearAll(ownerKey: string): Promise<void> {
    this.assertOwnerKey(ownerKey);
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME, this.PAYLOAD_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const payloadStore = transaction.objectStore(this.PAYLOAD_STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          const payloadCursor = payloadStore.openCursor();
          payloadCursor.onsuccess = () => {
            const cursor = payloadCursor.result;
            if (!cursor) return;
            const metadataRequest = store.get(cursor.primaryKey);
            metadataRequest.onsuccess = () => {
              if (!metadataRequest.result) cursor.delete();
              cursor.continue();
            };
            metadataRequest.onerror = () => transaction.abort();
          };
          return;
        }
        const record = cursor.value as PersistedUpload;
        if (record.ownerKey === ownerKey) {
          cursor.delete();
          payloadStore.delete(cursor.primaryKey);
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => {
        logger.logInfo('upload-queue.cleared');
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Upload queue clear aborted.'));
    });
  }

  /**
   * Get upload statistics
   */
  async getStats(ownerKey: string): Promise<{
    pending: number;
    uploading: number;
    failed: number;
    total: number;
  }> {
    const uploads = await this.getPendingUploads(ownerKey);

    return {
      pending: uploads.filter((u) => u.status === 'pending').length,
      uploading: uploads.filter((u) => u.status === 'uploading').length,
      failed: uploads.filter((u) => u.status === 'failed').length,
      total: uploads.length,
    };
  }
}

// Singleton instance getter
let queueManagerInstance: UploadQueueManager | null = null;

export function getUploadQueueManager(): UploadQueueManager {
  if (!queueManagerInstance) {
    queueManagerInstance = UploadQueueManager.getInstance();
  }
  return queueManagerInstance;
}
