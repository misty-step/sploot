import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  UploadNetworkClient,
  UploadError,
  getUploadNetworkClient,
  type UploadResult,
} from '@/lib/upload/upload-network-client';

describe('UploadNetworkClient', () => {
  let client: UploadNetworkClient;
  let mockXHR: any;
  let xhrInstances: any[];

  beforeEach(() => {
    client = new UploadNetworkClient();
    xhrInstances = [];

    // Mock XMLHttpRequest
    mockXHR = vi.fn(function (this: any) {
      this.upload = { addEventListener: vi.fn() };
      this.addEventListener = vi.fn();
      this.open = vi.fn();
      this.send = vi.fn();
      this.abort = vi.fn();
      this.status = 200;
      this.responseText = '';
      this.timeout = 0;
      xhrInstances.push(this);
    });

    global.XMLHttpRequest = mockXHR as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const mockResponse: UploadResult = {
        success: true,
        asset: {
          id: 'asset-123',
          blobUrl: 'https://example.com/blob.jpg',
          needsEmbedding: false,
        },
      };

      const uploadPromise = client.uploadFile(file);

      // Simulate successful upload
      const xhr = xhrInstances[0];
      xhr.status = 200;
      xhr.responseText = JSON.stringify(mockResponse);

      const loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      const result = await uploadPromise;
      expect(result).toEqual(mockResponse);
      expect(xhr.open).toHaveBeenCalledWith('POST', '/api/upload');
      expect(xhr.send).toHaveBeenCalled();
    });

    it('should track upload progress', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const onProgress = vi.fn();
      const mockResponse: UploadResult = { success: true };

      const uploadPromise = client.uploadFile(file, { onProgress });

      const xhr = xhrInstances[0];

      // Simulate progress events
      const progressHandler = xhr.upload.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'progress'
      )[1];

      progressHandler({ lengthComputable: true, loaded: 500, total: 1000 });
      progressHandler({ lengthComputable: true, loaded: 1000, total: 1000 });

      expect(onProgress).toHaveBeenCalledWith({
        loaded: 500,
        total: 1000,
        percentage: 50,
      });
      expect(onProgress).toHaveBeenCalledWith({
        loaded: 1000,
        total: 1000,
        percentage: 100,
      });

      // Complete upload
      xhr.status = 200;
      xhr.responseText = JSON.stringify(mockResponse);
      const loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      await uploadPromise;
    });

    it('should handle HTTP error status', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const uploadPromise = client.uploadFile(file);

      const xhr = xhrInstances[0];
      xhr.status = 400;
      xhr.responseText = JSON.stringify({ error: 'Invalid file' });

      const loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      await expect(uploadPromise).rejects.toThrow(UploadError);
      await expect(uploadPromise).rejects.toMatchObject({
        message: 'Invalid file',
        statusCode: 400,
        isRetryable: false,
      });
    });

    it('should mark 5xx errors as retryable', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const uploadPromise = client.uploadFile(file);

      const xhr = xhrInstances[0];
      xhr.status = 500;
      xhr.responseText = JSON.stringify({ error: 'Internal server error' });

      const loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      await expect(uploadPromise).rejects.toMatchObject({
        statusCode: 500,
        isRetryable: true,
      });
    });

    it('should handle network error', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const uploadPromise = client.uploadFile(file);

      const xhr = xhrInstances[0];
      const errorHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )[1];
      errorHandler();

      await expect(uploadPromise).rejects.toMatchObject({
        message: 'Network error during upload',
        isRetryable: true,
      });
    });

    it('should handle timeout', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const uploadPromise = client.uploadFile(file, { timeout: 5000 });

      const xhr = xhrInstances[0];
      expect(xhr.timeout).toBe(5000);

      const timeoutHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'timeout'
      )[1];
      timeoutHandler();

      await expect(uploadPromise).rejects.toMatchObject({
        message: 'Upload timeout - file too large or slow connection',
        isRetryable: true,
      });
    });

    it('should handle abort signal', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const abortController = new AbortController();
      const uploadPromise = client.uploadFile(file, { signal: abortController.signal });

      // Abort the request
      abortController.abort();

      const xhr = xhrInstances[0];
      expect(xhr.abort).toHaveBeenCalled();

      const abortHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'abort'
      )[1];
      abortHandler();

      await expect(uploadPromise).rejects.toMatchObject({
        message: 'Upload cancelled',
        isRetryable: false,
      });
    });

    it('should use custom endpoint', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const mockResponse: UploadResult = { success: true };

      const uploadPromise = client.uploadFile(file, { endpoint: '/api/custom-upload' });

      const xhr = xhrInstances[0];
      xhr.status = 200;
      xhr.responseText = JSON.stringify(mockResponse);

      const loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      await uploadPromise;
      expect(xhr.open).toHaveBeenCalledWith('POST', '/api/custom-upload');
    });

    it('should handle invalid JSON response', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const uploadPromise = client.uploadFile(file);

      const xhr = xhrInstances[0];
      xhr.status = 200;
      xhr.responseText = 'not json';

      const loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      await expect(uploadPromise).rejects.toMatchObject({
        message: 'Invalid response from server',
        isRetryable: false,
      });
    });

    it('should handle duplicate detection', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const mockResponse: UploadResult = {
        success: true,
        isDuplicate: true,
        asset: {
          id: 'asset-123',
          blobUrl: 'https://example.com/blob.jpg',
          needsEmbedding: false,
        },
      };

      const uploadPromise = client.uploadFile(file);

      const xhr = xhrInstances[0];
      xhr.status = 200;
      xhr.responseText = JSON.stringify(mockResponse);

      const loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      const result = await uploadPromise;
      expect(result.isDuplicate).toBe(true);
    });
  });

  describe('uploadWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const mockResponse: UploadResult = { success: true };

      const uploadPromise = client.uploadWithRetry(file);

      const xhr = xhrInstances[0];
      xhr.status = 200;
      xhr.responseText = JSON.stringify(mockResponse);

      const loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      const result = await uploadPromise;
      expect(result).toEqual(mockResponse);
      expect(xhrInstances).toHaveLength(1); // No retries
    });

    it('should retry on retryable error and succeed', async () => {
      vi.useFakeTimers();
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const mockResponse: UploadResult = { success: true };

      const uploadPromise = client.uploadWithRetry(file, undefined, 2);

      // First attempt fails with 500
      let xhr = xhrInstances[0];
      xhr.status = 500;
      xhr.responseText = JSON.stringify({ error: 'Server error' });
      let loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      // Wait for backoff delay (1s)
      await vi.advanceTimersByTimeAsync(1000);

      // Second attempt succeeds
      xhr = xhrInstances[1];
      xhr.status = 200;
      xhr.responseText = JSON.stringify(mockResponse);
      loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      const result = await uploadPromise;
      expect(result).toEqual(mockResponse);
      expect(xhrInstances).toHaveLength(2); // 1 failure + 1 success

      vi.useRealTimers();
    });

    it('should not retry on non-retryable error', async () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const uploadPromise = client.uploadWithRetry(file);

      const xhr = xhrInstances[0];
      xhr.status = 400;
      xhr.responseText = JSON.stringify({ error: 'Bad request' });

      const loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      await expect(uploadPromise).rejects.toMatchObject({
        statusCode: 400,
        isRetryable: false,
      });
      expect(xhrInstances).toHaveLength(1); // No retries
    });

    it('should exhaust retries and fail', async () => {
      vi.useFakeTimers();
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const uploadPromise = client.uploadWithRetry(file, undefined, 2);

      // All attempts fail
      for (let i = 0; i < 3; i++) {
        const xhr = xhrInstances[i];
        xhr.status = 500;
        xhr.responseText = JSON.stringify({ error: 'Server error' });
        const loadHandler = xhr.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'load'
        )[1];
        loadHandler();

        if (i < 2) {
          await vi.advanceTimersByTimeAsync(i === 0 ? 1000 : 3000);
        }
      }

      await expect(uploadPromise).rejects.toMatchObject({
        statusCode: 500,
        isRetryable: true,
      });
      expect(xhrInstances).toHaveLength(3); // 3 attempts

      vi.useRealTimers();
    });
  });

  describe('uploadBatch', () => {
    it('should upload multiple files in parallel', async () => {
      const files = [
        new File(['content1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['content2'], 'test2.jpg', { type: 'image/jpeg' }),
        new File(['content3'], 'test3.jpg', { type: 'image/jpeg' }),
      ];

      const uploadPromise = client.uploadBatch(files, undefined, 2);

      // Simulate uploads completing
      for (let i = 0; i < 3; i++) {
        const xhr = xhrInstances[i];
        xhr.status = 200;
        xhr.responseText = JSON.stringify({ success: true, asset: { id: `asset-${i}` } });
        const loadHandler = xhr.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'load'
        )[1];
        loadHandler();

        // Allow event loop to process
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      const results = await uploadPromise;
      expect(results).toHaveLength(3);
      expect(results.every(r => 'success' in r && (r as UploadResult).success)).toBe(true);
    });

    it('should handle mixed success and failure', async () => {
      const files = [
        new File(['content1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['content2'], 'test2.jpg', { type: 'image/jpeg' }),
      ];

      const uploadPromise = client.uploadBatch(files);

      // First succeeds
      let xhr = xhrInstances[0];
      xhr.status = 200;
      xhr.responseText = JSON.stringify({ success: true });
      let loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      await new Promise(resolve => setTimeout(resolve, 0));

      // Second fails
      xhr = xhrInstances[1];
      xhr.status = 400;
      xhr.responseText = JSON.stringify({ error: 'Bad request' });
      loadHandler = xhr.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'load'
      )[1];
      loadHandler();

      await new Promise(resolve => setTimeout(resolve, 0));

      const results = await uploadPromise;
      expect(results).toHaveLength(2);
      expect('success' in results[0] && (results[0] as UploadResult).success).toBe(true);
      expect(results[1]).toBeInstanceOf(UploadError);
    });
  });

  describe('getUploadNetworkClient', () => {
    it('should return singleton instance', () => {
      const client1 = getUploadNetworkClient();
      const client2 = getUploadNetworkClient();
      expect(client1).toBe(client2);
    });
  });
});
