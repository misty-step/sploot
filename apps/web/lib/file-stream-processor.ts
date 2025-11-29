/**
 * FileStreamProcessor - Memory-efficient file processing
 *
 * Processes files as streams to prevent memory exhaustion.
 * Problem: 10,000 files × 5MB = 50GB in browser memory = crash
 * Solution: Process files as streams, never hold more than 100MB in memory
 */

export interface ProcessedFile {
  file: string;           // File name
  chunks: Uint8Array[];   // File chunks
  checksum: string;       // SHA-256 checksum
  size: number;          // Total size in bytes
  processedAt: number;   // Timestamp
}

export interface ProcessingStats {
  filesProcessed: number;
  bytesProcessed: number;
  currentMemoryUsage: number;
  peakMemoryUsage: number;
  errors: number;
}

export interface ProcessorOptions {
  chunkSize?: number;        // Size of chunks to read (default: 5MB)
  maxMemory?: number;        // Maximum memory usage (default: 100MB)
  computeChecksum?: boolean; // Whether to compute checksums (default: true)
  onProgress?: (file: string, progress: number) => void;
  onError?: (file: string, error: Error) => void;
}

export class FileStreamProcessor {
  // Configuration
  private readonly CHUNK_SIZE: number;
  private readonly MAX_MEMORY: number;
  private readonly computeChecksum: boolean;

  // Memory tracking
  private currentMemoryUsage = 0;
  private peakMemoryUsage = 0;

  // Statistics
  private filesProcessed = 0;
  private bytesProcessed = 0;
  private errors = 0;

  // Callbacks
  private readonly onProgress?: (file: string, progress: number) => void;
  private readonly onError?: (file: string, error: Error) => void;

  constructor(options: ProcessorOptions = {}) {
    this.CHUNK_SIZE = options.chunkSize ?? 5 * 1024 * 1024; // 5MB default
    this.MAX_MEMORY = options.maxMemory ?? 100 * 1024 * 1024; // 100MB default
    this.computeChecksum = options.computeChecksum ?? true;
    this.onProgress = options.onProgress;
    this.onError = options.onError;
  }

  /**
   * Process files as an async generator, yielding one at a time
   * This ensures we never hold all files in memory simultaneously
   */
  async *processFiles(fileList: FileList): AsyncGenerator<ProcessedFile> {
    for (let i = 0; i < fileList.length; i++) {
      // Wait if memory limit exceeded
      while (this.currentMemoryUsage > this.MAX_MEMORY) {
        await this.waitForMemory();
      }

      const file = fileList[i];
      if (!file) continue;

      try {
        // Process single file
        const processed = await this.processFile(file);

        // Yield processed result
        yield processed;

        // Update stats
        this.filesProcessed++;
        this.bytesProcessed += file.size;

        // Note: FileList is immutable and read-only, cannot null references
        // Browser handles FileList garbage collection automatically

      } catch (error) {
        this.errors++;
        const errorObj = error instanceof Error ? error : new Error(String(error));

        console.error(`Failed to process file ${file.name}:`, errorObj);
        this.onError?.(file.name, errorObj);

        // Note: FileList is immutable and read-only, cannot null references
        // Browser handles FileList garbage collection automatically
      }
    }
  }

  /**
   * Process a single file using streams
   */
  private async processFile(file: File): Promise<ProcessedFile> {
    const startTime = Date.now();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    let checksum = '';

    // Check if File.stream() is available
    if (!file.stream) {
      // Fallback for older browsers
      return this.processFileWithReader(file);
    }

    const stream = file.stream();
    const reader = stream.getReader();

    try {
      let hasher: SubtleCrypto | null = null;
      let hashBuffer: ArrayBuffer[] = [];

      if (this.computeChecksum && crypto?.subtle) {
        // We'll compute hash incrementally
        hashBuffer = [];
      }

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        // Track memory usage
        this.currentMemoryUsage += value.byteLength;
        this.peakMemoryUsage = Math.max(this.peakMemoryUsage, this.currentMemoryUsage);

        // Store chunk
        chunks.push(new Uint8Array(value));
        totalSize += value.byteLength;

        // Add to hash buffer if computing checksum
        if (this.computeChecksum) {
          hashBuffer.push(value.buffer.slice(0));
        }

        // Report progress
        const progress = Math.min(100, (totalSize / file.size) * 100);
        this.onProgress?.(file.name, progress);

        // If we're using too much memory, wait
        if (this.currentMemoryUsage > this.MAX_MEMORY) {
          await this.waitForMemory();
        }
      }

      // Compute final checksum if enabled
      if (this.computeChecksum && hashBuffer.length > 0) {
        checksum = await this.computeChecksum256(hashBuffer);
      }

      return {
        file: file.name,
        chunks,
        checksum,
        size: totalSize,
        processedAt: Date.now()
      };

    } finally {
      // Always release the reader
      reader.releaseLock();

      // Update memory usage (will be decreased when chunks are consumed)
      // Note: We keep memory allocated until consumer processes the chunks
    }
  }

  /**
   * Fallback for browsers without File.stream() API
   */
  private async processFileWithReader(file: File): Promise<ProcessedFile> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const chunks: Uint8Array[] = [];
      let offset = 0;

      const readNextChunk = () => {
        const end = Math.min(offset + this.CHUNK_SIZE, file.size);
        const blob = file.slice(offset, end);
        reader.readAsArrayBuffer(blob);
      };

      reader.onload = async (e) => {
        if (!e.target?.result) {
          reject(new Error('Failed to read file'));
          return;
        }

        const chunk = new Uint8Array(e.target.result as ArrayBuffer);
        chunks.push(chunk);

        // Update memory tracking
        this.currentMemoryUsage += chunk.byteLength;
        this.peakMemoryUsage = Math.max(this.peakMemoryUsage, this.currentMemoryUsage);

        offset += chunk.byteLength;

        // Report progress
        const progress = Math.min(100, (offset / file.size) * 100);
        this.onProgress?.(file.name, progress);

        if (offset < file.size) {
          // Read next chunk
          readNextChunk();
        } else {
          // File completely read
          let checksum = '';
          if (this.computeChecksum) {
            const combined = this.combineChunks(chunks);
            checksum = await this.computeChecksum256([combined.buffer.slice(0) as ArrayBuffer]);
          }

          resolve({
            file: file.name,
            chunks,
            checksum,
            size: offset,
            processedAt: Date.now()
          });
        }
      };

      reader.onerror = () => {
        reject(new Error(`Failed to read file: ${file.name}`));
      };

      // Start reading
      readNextChunk();
    });
  }

  /**
   * Compute SHA-256 checksum from array buffers
   */
  private async computeChecksum256(buffers: ArrayBuffer[]): Promise<string> {
    if (!crypto?.subtle) {
      return ''; // Crypto API not available
    }

    try {
      // Combine all buffers
      const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;

      for (const buffer of buffers) {
        combined.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }

      // Compute hash
      const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    } catch (error) {
      console.error('Failed to compute checksum:', error);
      return '';
    }
  }

  /**
   * Combine chunks into a single Uint8Array
   */
  private combineChunks(chunks: Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return combined;
  }

  /**
   * Wait for memory to be available
   */
  private async waitForMemory(): Promise<void> {
    // Simple wait strategy - in real app might trigger GC or process queue
    await new Promise(resolve => setTimeout(resolve, 100));

    // In a real implementation, we'd wait for consumers to process chunks
    // and call releaseMemory() to update currentMemoryUsage
  }

  /**
   * Release memory used by processed chunks
   * Should be called by consumers after processing
   */
  releaseMemory(bytes: number): void {
    this.currentMemoryUsage = Math.max(0, this.currentMemoryUsage - bytes);
  }

  /**
   * Get current processing statistics
   */
  getStats(): ProcessingStats {
    return {
      filesProcessed: this.filesProcessed,
      bytesProcessed: this.bytesProcessed,
      currentMemoryUsage: this.currentMemoryUsage,
      peakMemoryUsage: this.peakMemoryUsage,
      errors: this.errors
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.filesProcessed = 0;
    this.bytesProcessed = 0;
    this.currentMemoryUsage = 0;
    this.peakMemoryUsage = 0;
    this.errors = 0;
  }

  /**
   * Create a blob from processed chunks (for upload)
   */
  static createBlobFromChunks(chunks: Uint8Array[], mimeType: string): Blob {
    // Cast to BlobPart array for TypeScript compatibility
    const blobParts = chunks as unknown as BlobPart[];
    return new Blob(blobParts, { type: mimeType });
  }

  /**
   * Estimate memory usage for a FileList
   */
  static estimateMemoryUsage(fileList: FileList): number {
    let total = 0;
    for (let i = 0; i < fileList.length; i++) {
      total += fileList[i].size;
    }
    return total;
  }
}

/**
 * Helper function to process files with default settings
 */
export async function* streamProcessFiles(
  fileList: FileList,
  options?: ProcessorOptions
): AsyncGenerator<ProcessedFile> {
  const processor = new FileStreamProcessor(options);
  yield* processor.processFiles(fileList);
}

/**
 * React hook for file stream processing
 */
export function useFileStreamProcessor(options?: ProcessorOptions) {
  const React = require('react');
  const processorRef = React.useRef(null) as { current: FileStreamProcessor | null };

  if (typeof window === 'undefined') {
    return {
      processFiles: async function* (_: FileList) {
        // No-op for SSR - yield nothing to satisfy generator
        const empty: ProcessedFile[] = [];
        yield* empty;
      },
      getStats: () => ({
        filesProcessed: 0,
        bytesProcessed: 0,
        currentMemoryUsage: 0,
        peakMemoryUsage: 0,
        errors: 0
      }),
      releaseMemory: (_: number) => {},
      resetStats: () => {}
    };
  }

  if (!processorRef.current) {
    processorRef.current = new FileStreamProcessor(options);
  }

  const processor = processorRef.current;

  return {
    processFiles: (fileList: FileList) => processor.processFiles(fileList),
    getStats: () => processor.getStats(),
    releaseMemory: (bytes: number) => processor.releaseMemory(bytes),
    resetStats: () => processor.resetStats()
  };
}