import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UploadQueueService } from '@/lib/upload/upload-queue-service';

describe('UploadQueueService', () => {
  let service: UploadQueueService<string, void>;

  beforeEach(() => {
    service = new UploadQueueService<string, void>({ maxRetries: 0 }); // Disable retries for simpler tests
  });

  describe('enqueue', () => {
    it('should add item to queue', () => {
      service.enqueue('file-1', 'test-data');
      const stats = service.getStats();
      expect(stats.pending).toBe(1);
    });

    it('should add multiple items', () => {
      service.enqueue('file-1', 'data-1');
      service.enqueue('file-2', 'data-2');
      const stats = service.getStats();
      expect(stats.pending).toBe(2);
    });
  });

  describe('enqueueBatch', () => {
    it('should add multiple items at once', () => {
      service.enqueueBatch([
        { id: 'file-1', data: 'data-1' },
        { id: 'file-2', data: 'data-2' },
      ]);
      const stats = service.getStats();
      expect(stats.pending).toBe(2);
    });
  });

  describe('processQueue', () => {
    it('should process all items successfully', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      service.enqueueBatch([
        { id: 'file-1', data: 'data-1' },
        { id: 'file-2', data: 'data-2' },
        { id: 'file-3', data: 'data-3' },
      ]);

      await service.processQueue(handler);

      expect(handler).toHaveBeenCalledTimes(3);
      const stats = service.getStats();
      expect(stats.successful).toBe(3);
      expect(stats.failed).toBe(0);
    });

    it('should handle failures without retries', async () => {
      const handler = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce(undefined);

      service.enqueueBatch([
        { id: 'file-1', data: 'data-1' },
        { id: 'file-2', data: 'data-2' },
        { id: 'file-3', data: 'data-3' },
      ]);

      await service.processQueue(handler);

      expect(handler).toHaveBeenCalledTimes(3);
      const stats = service.getStats();
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(1);
    });

    it('should call progress callback', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const onProgress = vi.fn();

      service.enqueue('file-1', 'data-1');
      await service.processQueue(handler, onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('should handle empty queue', async () => {
      const handler = vi.fn();
      await service.processQueue(handler);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should clear queue and reset stats', () => {
      service.enqueue('file-1', 'data-1');
      service.enqueue('file-2', 'data-2');

      let stats = service.getStats();
      expect(stats.pending).toBe(2);

      service.clear();

      stats = service.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('getConcurrency', () => {
    it('should return current concurrency limit', () => {
      const service = new UploadQueueService<string, void>({
        baseConcurrency: 4,
      });
      expect(service.getConcurrency()).toBe(4);
    });
  });

  describe('with retries', () => {
    it('should retry failed items', async () => {
      const service = new UploadQueueService<string, void>({
        maxRetries: 2,
        backoffDelays: [10, 20], // Short delays for testing
      });

      const handler = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt'))
        .mockResolvedValue(undefined);

      service.enqueue('file-1', 'data-1');

      await service.processQueue(handler);

      expect(handler).toHaveBeenCalledTimes(2); // Initial + 1 retry
      const stats = service.getStats();
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(0);
    }, 10000); // Longer timeout for retries

    it('should exhaust retries and mark as failed', async () => {
      const service = new UploadQueueService<string, void>({
        maxRetries: 2,
        backoffDelays: [10, 20],
      });

      const handler = vi.fn().mockRejectedValue(new Error('Always fails'));

      service.enqueue('file-1', 'data-1');

      await service.processQueue(handler);

      expect(handler).toHaveBeenCalledTimes(3); // Initial + 2 retries
      const stats = service.getStats();
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(1);
    }, 10000);
  });
});
