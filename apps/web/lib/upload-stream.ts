/**
 * UploadStream - Streaming file uploads with TransformStream
 *
 * Streams files directly from File API to network without intermediate buffers.
 * Computes checksums on-the-fly during streaming for integrity verification.
 * Optimal for large files to minimize memory usage.
 */

export interface StreamedChunk {
  data: Uint8Array;
  checksum: string;
  offset: number;
  total: number;
  chunkIndex: number;
  isLastChunk: boolean;
}

export interface UploadStreamOptions {
  chunkSize?: number;
  computeChecksum?: boolean;
  onProgress?: (progress: number) => void;
  onChunk?: (chunk: StreamedChunk) => void;
}

export class UploadStream {
  private readonly CHUNK_SIZE: number;
  private readonly computeChecksum: boolean;
  private readonly onProgress?: (progress: number) => void;
  private readonly onChunk?: (chunk: StreamedChunk) => void;

  constructor(options: UploadStreamOptions = {}) {
    // 256KB chunks for optimal TCP performance (balance between overhead and throughput)
    this.CHUNK_SIZE = options.chunkSize ?? 256 * 1024;
    this.computeChecksum = options.computeChecksum ?? true;
    this.onProgress = options.onProgress;
    this.onChunk = options.onChunk;
  }

  /**
   * Create an upload stream from a file
   */
  createUploadStream(file: File): ReadableStream<StreamedChunk> {
    let offset = 0;
    let chunkIndex = 0;
    const totalSize = file.size;
    const computeChecksum = this.computeChecksum;
    const onProgress = this.onProgress;
    const onChunk = this.onChunk;

    // Check if File.stream() is available
    if (!file.stream) {
      // Fallback for browsers without stream support
      return this.createUploadStreamWithReader(file);
    }

    const fileStream = file.stream();

    return fileStream.pipeThrough(
      new TransformStream<Uint8Array, StreamedChunk>({
        async transform(chunk, controller) {
          try {
            // Compute checksum if enabled
            let checksum = '';
            if (computeChecksum && crypto?.subtle) {
              const hashBuffer = await crypto.subtle.digest('SHA-256', chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              checksum = btoa(hashArray.map(b => String.fromCharCode(b)).join(''));
            }

            const isLastChunk = offset + chunk.byteLength >= totalSize;

            const streamedChunk: StreamedChunk = {
              data: new Uint8Array(chunk),
              checksum,
              offset,
              total: totalSize,
              chunkIndex: chunkIndex++,
              isLastChunk
            };

            // Report progress
            const progress = Math.min(100, ((offset + chunk.byteLength) / totalSize) * 100);
            onProgress?.(progress);
            onChunk?.(streamedChunk);

            controller.enqueue(streamedChunk);

            offset += chunk.byteLength;
          } catch (error) {
            controller.error(error);
          }
        },

        flush() {
          // Called when the stream is closing
          onProgress?.(100);
        }
      })
    );
  }

  /**
   * Fallback implementation using FileReader for browsers without stream support
   */
  private createUploadStreamWithReader(file: File): ReadableStream<StreamedChunk> {
    let offset = 0;
    let chunkIndex = 0;
    const totalSize = file.size;
    const chunkSize = this.CHUNK_SIZE;
    const computeChecksum = this.computeChecksum;
    const onProgress = this.onProgress;
    const onChunk = this.onChunk;

    return new ReadableStream<StreamedChunk>({
      async start(controller) {
        const reader = new FileReader();

        const readNextChunk = () => {
          if (offset >= totalSize) {
            controller.close();
            onProgress?.(100);
            return;
          }

          const end = Math.min(offset + chunkSize, totalSize);
          const blob = file.slice(offset, end);
          reader.readAsArrayBuffer(blob);
        };

        reader.onload = async (event) => {
          if (!event.target?.result) {
            controller.error(new Error('Failed to read file chunk'));
            return;
          }

          const arrayBuffer = event.target.result as ArrayBuffer;
          const chunk = new Uint8Array(arrayBuffer);

          try {
            // Compute checksum if enabled
            let checksum = '';
            if (computeChecksum && crypto?.subtle) {
              const hashBuffer = await crypto.subtle.digest('SHA-256', chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              checksum = btoa(hashArray.map(b => String.fromCharCode(b)).join(''));
            }

            const isLastChunk = offset + chunk.byteLength >= totalSize;

            const streamedChunk: StreamedChunk = {
              data: chunk,
              checksum,
              offset,
              total: totalSize,
              chunkIndex: chunkIndex++,
              isLastChunk
            };

            // Report progress
            const progress = Math.min(100, ((offset + chunk.byteLength) / totalSize) * 100);
            onProgress?.(progress);
            onChunk?.(streamedChunk);

            controller.enqueue(streamedChunk);

            offset += chunk.byteLength;

            // Read next chunk
            readNextChunk();
          } catch (error) {
            controller.error(error);
          }
        };

        reader.onerror = () => {
          controller.error(new Error('Failed to read file'));
        };

        // Start reading
        readNextChunk();
      }
    });
  }

  /**
   * Upload a file using streaming with fetch API
   */
  async uploadWithStream(
    file: File,
    url: string,
    options?: {
      method?: string;
      headers?: HeadersInit;
      onProgress?: (progress: number) => void;
      signal?: AbortSignal;
    }
  ): Promise<Response> {
    const uploadStream = this.createUploadStream(file);

    // Create a new ReadableStream that outputs raw bytes for fetch
    const bodyStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = uploadStream.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Extract the raw data from StreamedChunk
            controller.enqueue(value.data);

            // Report progress if callback provided
            options?.onProgress?.(value.offset / value.total * 100);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      }
    });

    // Use fetch with streaming body
    return fetch(url, {
      method: options?.method || 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': file.size.toString(),
        ...options?.headers
      },
      body: bodyStream,
      signal: options?.signal,
      // @ts-ignore - duplex is needed for streaming uploads
      duplex: 'half'
    });
  }

  /**
   * Create a chunked multipart upload stream
   */
  createMultipartStream(
    file: File,
    fieldName: string = 'file',
    boundary?: string
  ): ReadableStream<Uint8Array> {
    const actualBoundary = boundary || `----WebKitFormBoundary${Math.random().toString(36).substr(2, 16)}`;
    const encoder = new TextEncoder();

    // Prepare multipart headers
    const headers = [
      `--${actualBoundary}`,
      `Content-Disposition: form-data; name="${fieldName}"; filename="${file.name}"`,
      `Content-Type: ${file.type || 'application/octet-stream'}`,
      '',
      ''
    ].join('\r\n');

    const footer = `\r\n--${actualBoundary}--\r\n`;

    const uploadStream = this.createUploadStream(file);

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        // Send headers
        controller.enqueue(encoder.encode(headers));

        // Stream file chunks
        const reader = uploadStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            controller.enqueue(value.data);
          }

          // Send footer
          controller.enqueue(encoder.encode(footer));
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      }
    });
  }

  /**
   * Calculate total checksum for the entire file (for verification)
   */
  async calculateFileChecksum(file: File): Promise<string> {
    const stream = this.createUploadStream(file);
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value.data);
      }

      // Combine all chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }

      // Calculate checksum of entire file
      if (crypto?.subtle) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }

      return '';
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * Helper function to create an upload stream with default settings
 */
export function createUploadStream(
  file: File,
  options?: UploadStreamOptions
): ReadableStream<StreamedChunk> {
  const uploader = new UploadStream(options);
  return uploader.createUploadStream(file);
}

/**
 * React hook for streaming uploads
 */
export function useUploadStream(options?: UploadStreamOptions) {
  const React = require('react');
  const uploaderRef = React.useRef(null) as { current: UploadStream | null };

  if (typeof window === 'undefined') {
    return {
      createStream: (_: File) => new ReadableStream<StreamedChunk>(),
      uploadWithStream: async (_f: File, _u: string) => new Response(),
      calculateChecksum: async (_: File) => ''
    };
  }

  if (!uploaderRef.current) {
    uploaderRef.current = new UploadStream(options);
  }

  const uploader = uploaderRef.current;

  return {
    createStream: (file: File) => uploader.createUploadStream(file),
    uploadWithStream: (file: File, url: string, opts?: any) =>
      uploader.uploadWithStream(file, url, opts),
    calculateChecksum: (file: File) => uploader.calculateFileChecksum(file)
  };
}