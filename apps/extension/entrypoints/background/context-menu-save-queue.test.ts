import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchImage: vi.fn(),
  saveToSploot: vi.fn(),
  showErrorNotification: vi.fn(),
}));

vi.mock('./image-fetcher', () => ({ fetchImage: mocks.fetchImage }));
vi.mock('./save-flow', () => ({ saveToSploot: mocks.saveToSploot }));
vi.mock('./notifications', () => ({ showErrorNotification: mocks.showErrorNotification }));

import {
  CONTEXT_MENU_QUEUE_KEY,
  MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
  MAX_CONTEXT_MENU_SAVE_AGE_MS,
  MAX_CONTEXT_MENU_SAVE_QUEUE_SIZE,
  PROCESSING_STALE_TIMEOUT_MS,
  discardContextMenuSave,
  enqueueContextMenuSave,
  recoverPendingContextMenuSaves,
  retryContextMenuSave,
} from './context-menu-save-queue';

interface StoredJob {
  id: string;
  imageUrl: string;
  filename: string;
  state: 'pending' | 'processing' | 'failed';
  createdAt: number;
  attempts?: number;
  nextAttemptAt?: number;
  processingStartedAt?: number;
  lastError?: string;
}

let storedQueue: StoredJob[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  vi.clearAllMocks();
  storedQueue = [];
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async () => ({ [CONTEXT_MENU_QUEUE_KEY]: storedQueue })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          if (CONTEXT_MENU_QUEUE_KEY in value) {
            storedQueue = value[CONTEXT_MENU_QUEUE_KEY] as StoredJob[];
          }
        }),
      },
    },
  });
  mocks.fetchImage.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  mocks.saveToSploot.mockResolvedValue({ ok: true, filename: 'cat.png', isDuplicate: false });
});

describe('durable context-menu save queue', () => {
  it('removes a job only after the save pipeline reports success', async () => {
    await enqueueContextMenuSave('https://x.test/cat.png', 'cat.png');

    expect(mocks.saveToSploot).toHaveBeenCalledOnce();
    expect(storedQueue).toEqual([]);
  });

  it('keeps failed payloads and schedules the next attempt with bounded backoff', async () => {
    mocks.saveToSploot.mockResolvedValue({ ok: false, error: new Error('network down') });

    await enqueueContextMenuSave('https://x.test/cat.png', 'cat.png');

    expect(storedQueue).toHaveLength(1);
    expect(storedQueue[0]).toMatchObject({
      imageUrl: 'https://x.test/cat.png',
      filename: 'cat.png',
      state: 'pending',
      attempts: 1,
      lastError: 'network down',
    });
    expect(storedQueue[0].nextAttemptAt).toBeGreaterThan(Date.now());

    await recoverPendingContextMenuSaves();
    expect(mocks.saveToSploot).toHaveBeenCalledOnce();

    vi.setSystemTime(storedQueue[0].nextAttemptAt!);
    await recoverPendingContextMenuSaves();
    expect(mocks.saveToSploot).toHaveBeenCalledTimes(2);
  });

  it('does not replay an eligible job twice when startup recovery repeats', async () => {
    storedQueue = [{
      id: 'job-1',
      imageUrl: 'https://x.test/cat.png',
      filename: 'cat.png',
      state: 'pending',
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
    }];
    mocks.saveToSploot.mockResolvedValue({ ok: false, error: new Error('still offline') });

    await Promise.all([
      recoverPendingContextMenuSaves(),
      recoverPendingContextMenuSaves(),
      recoverPendingContextMenuSaves(),
    ]);

    expect(mocks.saveToSploot).toHaveBeenCalledOnce();
    expect(storedQueue[0].attempts).toBe(1);
  });

  it('recovers only processing jobs left stale by a worker crash', async () => {
    storedQueue = [{
      id: 'stale',
      imageUrl: 'https://x.test/stale.png',
      filename: 'stale.png',
      state: 'processing',
      createdAt: Date.now() - 10_000,
      attempts: 1,
      nextAttemptAt: Date.now(),
      processingStartedAt: Date.now() - PROCESSING_STALE_TIMEOUT_MS - 1,
    }, {
      id: 'fresh',
      imageUrl: 'https://x.test/fresh.png',
      filename: 'fresh.png',
      state: 'processing',
      createdAt: Date.now() - 10_000,
      attempts: 1,
      nextAttemptAt: Date.now(),
      processingStartedAt: Date.now(),
    }];

    await recoverPendingContextMenuSaves();

    expect(storedQueue.find(job => job.id === 'fresh')).toMatchObject({
      state: 'processing',
      processingStartedAt: Date.now(),
    });

    expect(mocks.saveToSploot).toHaveBeenCalledOnce();
    expect(mocks.saveToSploot).toHaveBeenCalledWith(expect.any(Function), 'image');
    expect(storedQueue.find(job => job.id === 'fresh')).toMatchObject({
      state: 'processing',
      processingStartedAt: 1_000_000,
    });
  });

  it('retains a terminal failure and its payload after the attempt cap', async () => {
    storedQueue = [{
      id: 'poison',
      imageUrl: 'https://x.test/poison.png',
      filename: 'poison.png',
      state: 'pending',
      createdAt: Date.now(),
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS - 1,
      nextAttemptAt: Date.now(),
    }];
    mocks.saveToSploot.mockResolvedValue({ ok: false, error: new Error('permanent failure') });

    await recoverPendingContextMenuSaves();

    expect(storedQueue[0]).toMatchObject({
      id: 'poison',
      imageUrl: 'https://x.test/poison.png',
      state: 'failed',
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
      lastError: 'permanent failure',
    });
    expect(mocks.showErrorNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Retry or discard'),
    }));
  });

  it('terminalizes an old payload without retrying it forever', async () => {
    storedQueue = [{
      id: 'old',
      imageUrl: 'https://x.test/old.png',
      filename: 'old.png',
      state: 'pending',
      createdAt: Date.now() - MAX_CONTEXT_MENU_SAVE_AGE_MS - 1,
      attempts: 1,
      nextAttemptAt: Date.now(),
    }];

    await recoverPendingContextMenuSaves();

    expect(mocks.saveToSploot).not.toHaveBeenCalled();
    expect(storedQueue[0]).toMatchObject({ id: 'old', state: 'failed', attempts: 1 });
  });

  it('rejects new saves when the durable queue is full without changing old payloads', async () => {
    storedQueue = Array.from({ length: MAX_CONTEXT_MENU_SAVE_QUEUE_SIZE }, (_, index) => ({
      id: `job-${index}`,
      imageUrl: `https://x.test/${index}.png`,
      filename: `${index}.png`,
      state: 'failed' as const,
      createdAt: Date.now(),
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
      nextAttemptAt: 0,
      lastError: 'needs attention',
    }));
    const before = structuredClone(storedQueue);

    await expect(enqueueContextMenuSave('https://x.test/new.png', 'new.png'))
      .rejects.toMatchObject({ code: 'queue-full' });

    expect(storedQueue).toEqual(before);
    expect(mocks.saveToSploot).not.toHaveBeenCalled();
  });

  it('provides explicit retry and discard operations for terminal jobs', async () => {
    storedQueue = [{
      id: 'failed',
      imageUrl: 'https://x.test/failed.png',
      filename: 'failed.png',
      state: 'failed',
      createdAt: Date.now(),
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
      nextAttemptAt: 0,
      lastError: 'needs attention',
    }];

    await retryContextMenuSave('failed');
    expect(mocks.saveToSploot).toHaveBeenCalledOnce();
    expect(storedQueue).toEqual([]);

    storedQueue = [{
      id: 'discard-me',
      imageUrl: 'https://x.test/discard.png',
      filename: 'discard.png',
      state: 'failed',
      createdAt: Date.now(),
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
      nextAttemptAt: 0,
    }];
    await expect(discardContextMenuSave('discard-me')).resolves.toBe(true);
    expect(storedQueue).toEqual([]);
  });
});
