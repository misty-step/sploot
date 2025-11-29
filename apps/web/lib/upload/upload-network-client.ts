/**
 * Upload Network Client Service
 *
 * Encapsulates all HTTP communication for file uploads with:
 * - XMLHttpRequest for progress tracking
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Error parsing with status codes
 *
 * Deep module: Simple interface (uploadFile) hides XMLHttpRequest complexity,
 * progress event handling, and error response parsing.
 */

export interface UploadProgressEvent {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  success: boolean;
  asset?: {
    id: string;
    blobUrl: string;
    needsEmbedding: boolean;
  };
  isDuplicate?: boolean;
  error?: string;
}

export interface UploadOptions {
  /** Callback for upload progress updates */
  onProgress?: (event: UploadProgressEvent) => void;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** API endpoint URL (default: '/api/upload') */
  endpoint?: string;
  /** AbortController signal for cancellation */
  signal?: AbortSignal;
}

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

/**
 * Network client for uploading files to the server
 *
 * Uses XMLHttpRequest for fine-grained progress tracking instead of fetch API.
 * Provides retry logic and detailed error information.
 */
export class UploadNetworkClient {
  private readonly defaultTimeout: number;
  private readonly defaultEndpoint: string;

  constructor(config?: { timeout?: number; endpoint?: string }) {
    this.defaultTimeout = config?.timeout ?? 10000; // 10 seconds
    this.defaultEndpoint = config?.endpoint ?? '/api/upload';
  }

  /**
   * Uploads a file to the server with progress tracking
   *
   * @param file - File to upload
   * @param options - Upload options (progress callback, timeout, etc.)
   * @returns Promise resolving to upload result
   * @throws UploadError with status code and retry information
   */
  async uploadFile(file: File, options?: UploadOptions): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);

    const timeout = options?.timeout ?? this.defaultTimeout;
    const endpoint = options?.endpoint ?? this.defaultEndpoint;

    return new Promise<UploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Handle cancellation via AbortSignal
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          xhr.abort();
        });
      }

      // Progress tracking
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && options?.onProgress) {
          options.onProgress({
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100),
          });
        }
      });

      // Success response
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText) as UploadResult;
            resolve(response);
          } catch {
            reject(
              new UploadError(
                'Invalid response from server',
                xhr.status,
                false // Not retryable - response parsing failed
              )
            );
          }
        } else {
          // HTTP error status
          let errorMessage: string;
          try {
            const error = JSON.parse(xhr.responseText);
            errorMessage = error.error || `Upload failed with status ${xhr.status}`;
          } catch {
            errorMessage = `Upload failed with status ${xhr.status}`;
          }

          // Determine if error is retryable (5xx server errors are retryable)
          const isRetryable = xhr.status >= 500 && xhr.status < 600;

          reject(new UploadError(errorMessage, xhr.status, isRetryable));
        }
      });

      // Network error (no response received)
      xhr.addEventListener('error', () => {
        reject(
          new UploadError(
            'Network error during upload',
            undefined,
            true // Retryable - transient network issue
          )
        );
      });

      // Request aborted by user or code
      xhr.addEventListener('abort', () => {
        reject(
          new UploadError(
            'Upload cancelled',
            undefined,
            false // Not retryable - user action
          )
        );
      });

      // Request timeout
      xhr.addEventListener('timeout', () => {
        reject(
          new UploadError(
            'Upload timeout - file too large or slow connection',
            undefined,
            true // Retryable - could be transient
          )
        );
      });

      // Start the upload
      xhr.open('POST', endpoint);
      xhr.timeout = timeout;
      xhr.send(formData);
    });
  }

  /**
   * Uploads a file with automatic retry on failure
   *
   * @param file - File to upload
   * @param options - Upload options
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Promise resolving to upload result
   * @throws UploadError if all retries exhausted
   */
  async uploadWithRetry(
    file: File,
    options?: UploadOptions,
    maxRetries: number = 3
  ): Promise<UploadResult> {
    const backoffDelays = [1000, 3000, 9000]; // 1s, 3s, 9s
    let lastError: UploadError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.uploadFile(file, options);
      } catch (error) {
        lastError = error instanceof UploadError ? error : new UploadError(
          error instanceof Error ? error.message : 'Upload failed',
          undefined,
          false
        );

        // Don't retry if error is not retryable or we've exhausted retries
        if (!lastError.isRetryable || attempt >= maxRetries) {
          throw lastError;
        }

        // Wait before retrying with exponential backoff
        const delay = backoffDelays[attempt] || backoffDelays[backoffDelays.length - 1];
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Should never reach here, but TypeScript doesn't know that
    throw lastError!;
  }

  /**
   * Uploads multiple files in parallel with concurrency limit
   *
   * @param files - Files to upload
   * @param options - Upload options (same for all files)
   * @param concurrency - Maximum concurrent uploads (default: 6)
   * @returns Promise resolving to array of results (in same order as input)
   */
  async uploadBatch(
    files: File[],
    options?: UploadOptions,
    concurrency: number = 6
  ): Promise<Array<UploadResult | UploadError>> {
    const results: Array<UploadResult | UploadError> = new Array(files.length);
    const queue = files.map((file, index) => ({ file, index }));
    const activeUploads = new Set<Promise<void>>();

    while (queue.length > 0 || activeUploads.size > 0) {
      // Fill up to concurrency limit
      while (queue.length > 0 && activeUploads.size < concurrency) {
        const item = queue.shift()!;

        const uploadPromise = this.uploadFile(item.file, options)
          .then(result => {
            results[item.index] = result;
          })
          .catch(error => {
            results[item.index] = error instanceof UploadError ? error : new UploadError(
              error instanceof Error ? error.message : 'Upload failed',
              undefined,
              false
            );
          })
          .finally(() => {
            activeUploads.delete(uploadPromise);
          });

        activeUploads.add(uploadPromise);
      }

      // Wait for at least one upload to complete
      if (activeUploads.size > 0) {
        await Promise.race(activeUploads);
      }
    }

    return results;
  }
}

/**
 * Create a singleton instance for the default configuration
 */
let defaultClient: UploadNetworkClient | null = null;

export function getUploadNetworkClient(config?: { timeout?: number; endpoint?: string }): UploadNetworkClient {
  if (!defaultClient) {
    defaultClient = new UploadNetworkClient(config);
  }
  return defaultClient;
}
