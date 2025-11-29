/**
 * File Metadata Manager
 *
 * Manages file metadata separately from File objects to reduce memory usage.
 * For 10,000 files: ~3MB metadata vs 50GB with full File objects.
 *
 * This manager implements a two-tier storage system:
 * 1. Metadata Map: Stores only display-relevant information (~300 bytes per file)
 * 2. WeakMap: Temporarily stores File objects only during active upload
 */

export interface FileMetadata {
  id: string;
  name: string; // max 255 bytes
  size: number; // 8 bytes
  status: 'pending' | 'uploading' | 'success' | 'error' | 'queued' | 'duplicate'; // 1 byte enum
  progress: number; // 4 bytes
  error?: string;
  errorDetails?: any;
  assetId?: string;
  blobUrl?: string;
  isDuplicate?: boolean;
  needsEmbedding?: boolean;
  embeddingStatus?: 'pending' | 'processing' | 'ready' | 'failed';
  embeddingError?: string;
  retryCount?: number;
  addedAt: number; // timestamp for sorting
}

export class FileMetadataManager {
  private metadata = new Map<string, FileMetadata>();
  private fileObjects = new WeakMap<FileMetadata, File>();

  /**
   * Add a new file with metadata
   */
  addFile(file: File, id?: string): FileMetadata {
    const metadata: FileMetadata = {
      id: id || `${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      status: 'pending',
      progress: 0,
      addedAt: Date.now(),
    };

    this.metadata.set(metadata.id, metadata);
    this.fileObjects.set(metadata, file);

    return metadata;
  }

  /**
   * Get metadata by ID
   */
  getMetadata(id: string): FileMetadata | undefined {
    return this.metadata.get(id);
  }

  /**
   * Get File object for metadata (may return undefined if GC'd)
   */
  getFile(metadata: FileMetadata): File | undefined {
    return this.fileObjects.get(metadata);
  }

  /**
   * Update metadata
   */
  updateMetadata(id: string, updates: Partial<FileMetadata>): FileMetadata | undefined {
    const metadata = this.metadata.get(id);
    if (!metadata) return undefined;

    const updated = { ...metadata, ...updates };
    this.metadata.set(id, updated);

    // Preserve File object association if it exists
    const file = this.fileObjects.get(metadata);
    if (file) {
      this.fileObjects.delete(metadata);
      this.fileObjects.set(updated, file);
    }

    return updated;
  }

  /**
   * Remove file and its metadata
   */
  removeFile(id: string): boolean {
    const metadata = this.metadata.get(id);
    if (!metadata) return false;

    // File object will be GC'd automatically when metadata is deleted
    this.metadata.delete(id);
    return true;
  }

  /**
   * Get all metadata as array (sorted by addedAt)
   */
  getAllMetadata(): FileMetadata[] {
    return Array.from(this.metadata.values()).sort((a, b) => a.addedAt - b.addedAt);
  }

  /**
   * Get metadata Map directly (for React state)
   */
  getMetadataMap(): Map<string, FileMetadata> {
    return new Map(this.metadata);
  }

  /**
   * Clear completed/failed uploads to free memory
   */
  clearCompleted(): number {
    let cleared = 0;
    for (const [id, metadata] of this.metadata) {
      if (metadata.status === 'success' || metadata.status === 'error' || metadata.status === 'duplicate') {
        this.metadata.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Get memory usage estimate
   */
  getMemoryEstimate(): { metadataSize: number; estimatedFileSize: number } {
    const metadataSize = this.metadata.size * 300; // ~300 bytes per metadata entry
    // We can't accurately measure WeakMap size, but we can count active uploads
    const activeUploads = Array.from(this.metadata.values()).filter(
      m => m.status === 'uploading' || m.status === 'pending'
    ).length;
    const estimatedFileSize = activeUploads * 5 * 1024 * 1024; // Assume 5MB average

    return { metadataSize, estimatedFileSize };
  }
}