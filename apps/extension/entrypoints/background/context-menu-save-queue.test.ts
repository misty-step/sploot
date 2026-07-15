import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchImage: vi.fn(),
  saveToSploot: vi.fn(),
  showErrorNotification: vi.fn(),
  getAuthAuthority: vi.fn(),
  readAuthAuthority: vi.fn(),
}));

interface MockAuthority {
  userId: string;
  accountId?: string;
  sessionId: string;
}

vi.mock('./image-fetcher', () => ({ fetchImage: mocks.fetchImage }));
vi.mock('./save-flow', () => ({ saveToSploot: mocks.saveToSploot }));
vi.mock('./notifications', () => ({ showErrorNotification: mocks.showErrorNotification }));
vi.mock('./auth-manager', () => ({
  getAuthAuthority: mocks.getAuthAuthority,
  readAuthAuthority: mocks.readAuthAuthority,
  // Mirrors the production contract proven in auth-manager.test.ts: durable
  // ownership is the stable account identity; sessionId never participates.
  sameAccountAuthority: (left: MockAuthority | null, right: MockAuthority | null) => Boolean(
    left && right
    && left.userId === right.userId
    && (left.accountId ?? left.userId) === (right.accountId ?? right.userId),
  ),
}));

import {
  CONTEXT_MENU_QUEUE_KEY,
  CONTEXT_MENU_SAVE_DEADLINE_MS,
  CONTEXT_MENU_SAVE_ALARM_NAME,
  ConcurrencyGate,
  MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
  MAX_CONTEXT_MENU_SAVE_AGE_MS,
  MAX_CONTEXT_MENU_SAVE_QUEUE_SIZE,
  MAX_CONTEXT_MENU_SAVE_STORAGE_BYTES,
  PROCESSING_STALE_TIMEOUT_MS,
  TERMINAL_SAVE_RETENTION_MS,
  discardContextMenuSave,
  enqueueCapturedSave,
  enqueueContextMenuSave,
  listContextMenuSaves,
  recoverPendingContextMenuSaves,
  retryContextMenuSave,
  scheduleContextMenuSaveQueueWakeup,
  setupContextMenuSaveQueue,
} from './context-menu-save-queue';

interface StoredJob {
  id: string;
  imageUrl: string;
  filename: string;
  state: 'pending' | 'processing' | 'failed' | 'paused';
  createdAt: number;
  attempts?: number;
  nextAttemptAt?: number;
  processingStartedAt?: number;
  processingToken?: string;
  lastError?: string;
  failedAt?: number;
  pausedAt?: number;
  sourceBytes?: string;
  sourceType?: string;
  owner?: { userId: string; accountId?: string; sessionId: string };
}

let storedQueue: StoredJob[];
let alarmListener: ((alarm: { name: string }) => void) | undefined;
let alarmCreate: ReturnType<typeof vi.fn>;
let alarmClear: ReturnType<typeof vi.fn>;
const OWNER = { userId: 'user-1', sessionId: 'session-1' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  vi.clearAllMocks();
  storedQueue = [];
  alarmListener = undefined;
  alarmCreate = vi.fn(async () => undefined);
  alarmClear = vi.fn(async () => true);
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async () => ({
          [CONTEXT_MENU_QUEUE_KEY]: storedQueue.map(job => ({
            ...job,
            owner: job.owner ?? OWNER,
            sourceBytes: job.sourceBytes ?? btoa('image'),
            sourceType: job.sourceType ?? 'image/png',
          })),
        })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          if (CONTEXT_MENU_QUEUE_KEY in value) {
            storedQueue = value[CONTEXT_MENU_QUEUE_KEY] as StoredJob[];
          }
        }),
      },
    },
    alarms: {
      create: alarmCreate,
      clear: alarmClear,
      onAlarm: {
        addListener: vi.fn((listener: (alarm: { name: string }) => void) => {
          alarmListener = listener;
        }),
      },
    },
  });
  setupContextMenuSaveQueue();
  mocks.getAuthAuthority.mockResolvedValue(OWNER);
  // readAuthAuthority is the throwing variant of getAuthAuthority; by default
  // mirror it so owner-fencing tests drive both through one seam.
  mocks.readAuthAuthority.mockImplementation((signal?: AbortSignal) => mocks.getAuthAuthority(signal));
  mocks.fetchImage.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  mocks.saveToSploot.mockResolvedValue({ ok: true, filename: 'cat.png', isDuplicate: false });
});

describe.sequential('durable context-menu save queue', () => {
  it('removes a job only after the save pipeline reports success', async () => {
    await enqueueContextMenuSave('https://x.test/cat.png', 'cat.png');

    await vi.waitFor(() => expect(mocks.saveToSploot).toHaveBeenCalledWith(
      expect.any(Function), 'image', { owner: OWNER, signal: expect.any(AbortSignal) },
    ));
    await vi.waitFor(() => expect(storedQueue).toEqual([]));
  });

  it('keeps failed payloads and schedules the next attempt with bounded backoff', async () => {
    mocks.saveToSploot.mockResolvedValue({ ok: false, error: new Error('network down') });

    await enqueueContextMenuSave('https://x.test/cat.png', 'cat.png');

    expect(storedQueue).toHaveLength(1);
    await vi.waitFor(() => expect(storedQueue[0]).toMatchObject({
      imageUrl: 'https://x.test/cat.png',
      filename: 'cat.png',
      state: 'pending',
      attempts: 1,
      lastError: 'network down',
    }));
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
    expect(mocks.saveToSploot).toHaveBeenCalledWith(
      expect.any(Function), 'image', { owner: OWNER, signal: expect.any(AbortSignal) },
    );
    expect(storedQueue.find(job => job.id === 'fresh')).toMatchObject({
      state: 'processing',
      processingStartedAt: 1_000_000,
    });
  });

  it('replays a processing job immediately when a new worker starts', async () => {
    storedQueue = [{
      id: 'restarted',
      imageUrl: 'https://x.test/restarted.png',
      filename: 'restarted.png',
      state: 'processing',
      createdAt: Date.now(),
      attempts: 1,
      nextAttemptAt: Date.now(),
      processingStartedAt: Date.now(),
    }];

    await recoverPendingContextMenuSaves('startup');

    expect(mocks.saveToSploot).toHaveBeenCalledOnce();
    expect(storedQueue).toEqual([]);
  });

  it('fences a different owner before a future retry is due', async () => {
    storedQueue = [{
      id: 'future-owner-bound',
      imageUrl: 'https://x.test/future-owner-bound.png',
      filename: 'future-owner-bound.png',
      state: 'pending',
      createdAt: Date.now(),
      attempts: 1,
      nextAttemptAt: Date.now() + 30_000,
      owner: OWNER,
    }];
    mocks.getAuthAuthority.mockResolvedValue({ userId: 'user-2', sessionId: 'session-2' });

    await recoverPendingContextMenuSaves('startup');

    expect(mocks.saveToSploot).not.toHaveBeenCalled();
    expect(storedQueue[0]).toMatchObject({
      state: 'paused',
      lastError: 'Sign in to the original Sploot account to resume this save.',
    });
    expect(alarmClear).toHaveBeenCalledWith(CONTEXT_MENU_SAVE_ALARM_NAME);
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
    expect(mocks.saveToSploot).not.toHaveBeenCalled();
    await recoverPendingContextMenuSaves();
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

  it('resets the age window and gives a manual retry one real attempt', async () => {
    storedQueue = [{
      id: 'aged',
      imageUrl: 'https://x.test/aged.png',
      filename: 'aged.png',
      state: 'failed',
      createdAt: Date.now() - MAX_CONTEXT_MENU_SAVE_AGE_MS - 1,
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
      nextAttemptAt: 0,
      lastError: 'expired',
    }];

    await retryContextMenuSave('aged');

    expect(storedQueue[0]).toMatchObject({
      state: 'pending',
      createdAt: Date.now(),
      attempts: 0,
    });
    expect(mocks.saveToSploot).not.toHaveBeenCalled();

    await recoverPendingContextMenuSaves();
    expect(mocks.saveToSploot).toHaveBeenCalledOnce();
    expect(storedQueue).toEqual([]);
  });

  it('acknowledges enqueue after durable persistence, before network completion', async () => {
    let resolveSave!: (outcome: { ok: true; filename: string; isDuplicate: boolean }) => void;
    mocks.saveToSploot.mockReturnValue(new Promise(resolve => { resolveSave = resolve; }));

    const enqueue = enqueueContextMenuSave('https://x.test/queued.png', 'queued.png');
    await enqueue;

    await vi.waitFor(() => expect(storedQueue[0]).toMatchObject({ state: 'processing', filename: 'queued.png' }));
    expect(mocks.saveToSploot).toHaveBeenCalledOnce();

    resolveSave({ ok: true, filename: 'queued.png', isDuplicate: false });
    await vi.waitFor(() => expect(storedQueue).toEqual([]));
  });

  it('schedules the earliest pending or stale-processing wakeup and clears an empty alarm', async () => {
    storedQueue = [{
      id: 'later',
      imageUrl: 'https://x.test/later.png',
      filename: 'later.png',
      state: 'pending',
      createdAt: Date.now(),
      attempts: 1,
      nextAttemptAt: Date.now() + 90_000,
    }, {
      id: 'earlier',
      imageUrl: 'https://x.test/earlier.png',
      filename: 'earlier.png',
      state: 'pending',
      createdAt: Date.now(),
      attempts: 1,
      nextAttemptAt: Date.now() + 30_000,
    }];

    await scheduleContextMenuSaveQueueWakeup();
    expect(alarmCreate).toHaveBeenLastCalledWith(CONTEXT_MENU_SAVE_ALARM_NAME, {
      when: Date.now() + 30_000,
    });

    storedQueue = [];
    await scheduleContextMenuSaveQueueWakeup();
    expect(alarmClear).toHaveBeenCalledWith(CONTEXT_MENU_SAVE_ALARM_NAME);
  });

  it('wakes retrying work at the durable due time and removes only after success', async () => {
    storedQueue = [{
      id: 'retrying',
      imageUrl: 'https://x.test/retrying.png',
      filename: 'retrying.png',
      state: 'pending',
      createdAt: Date.now(),
      attempts: 1,
      nextAttemptAt: Date.now(),
    }];
    mocks.saveToSploot.mockResolvedValueOnce({ ok: false, error: new Error('offline') });

    alarmListener!({ name: CONTEXT_MENU_SAVE_ALARM_NAME });
    await vi.waitFor(() => expect(mocks.saveToSploot).toHaveBeenCalledWith(
      expect.any(Function), 'image', { owner: OWNER, signal: expect.any(AbortSignal) },
    ));
    await vi.waitFor(() => expect(storedQueue[0].nextAttemptAt).toBeGreaterThan(Date.now()));
    expect(storedQueue[0].state).toBe('pending');

    vi.setSystemTime(storedQueue[0].nextAttemptAt!);
    mocks.saveToSploot.mockResolvedValueOnce({ ok: true, filename: 'retrying.png', isDuplicate: false });
    alarmListener!({ name: CONTEXT_MENU_SAVE_ALARM_NAME });
    await vi.waitFor(() => expect(storedQueue).toEqual([]));
    expect(alarmClear).toHaveBeenCalledWith(CONTEXT_MENU_SAVE_ALARM_NAME);
  });

  it('keeps pending, processing, and failed jobs queryable from the background store', async () => {
    storedQueue = [{
      id: 'pending',
      imageUrl: 'https://x.test/pending.png',
      filename: 'pending.png',
      state: 'pending',
      createdAt: Date.now(),
      attempts: 1,
      nextAttemptAt: Date.now() + 30_000,
    }, {
      id: 'failed',
      imageUrl: 'https://x.test/failed.png',
      filename: 'failed.png',
      state: 'failed',
      createdAt: Date.now(),
      attempts: 5,
      nextAttemptAt: 0,
      lastError: 'permanent',
    }];

    await expect(listContextMenuSaves()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'pending', state: 'pending', nextAttemptAt: expect.any(Number) }),
      expect.objectContaining({ id: 'failed', state: 'failed', lastError: 'permanent' }),
    ]));
  });

  it('fences a stale completion from removing a newer generation', async () => {
    storedQueue = [{
      id: 'generation',
      imageUrl: 'https://x.test/generation.png',
      filename: 'generation.png',
      state: 'pending',
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
    }];
    let resolveSave!: (outcome: { ok: true; filename: string; isDuplicate: boolean }) => void;
    mocks.saveToSploot.mockReturnValue(new Promise(resolve => { resolveSave = resolve; }));

    const processing = recoverPendingContextMenuSaves();
    await vi.waitFor(() => expect(mocks.saveToSploot).toHaveBeenCalledOnce());
    storedQueue = [{
      ...storedQueue[0],
      state: 'failed',
      processingToken: 'new-generation',
      lastError: 'manual transition',
    }];
    resolveSave({ ok: true, filename: 'generation.png', isDuplicate: false });
    await processing;

    expect(storedQueue[0]).toMatchObject({ state: 'failed', lastError: 'manual transition' });
  });

  it('replays the retained original bytes when the remote URL changes after a crash', async () => {
    let saveAttempt = 0;
    mocks.fetchImage
      .mockResolvedValueOnce(new Blob(['original'], { type: 'image/png' }))
      .mockResolvedValueOnce(new Blob(['changed'], { type: 'image/png' }));
    mocks.saveToSploot.mockImplementation(async (produce: () => Promise<{ blob: Blob; filename: string }>) => {
      saveAttempt += 1;
      const produced = await produce();
      expect(await produced.blob.text()).toBe('original');
      if (saveAttempt === 1) {
        return { ok: false, error: new Error('worker crashed after upload') };
      }
      return { ok: true, filename: produced.filename, isDuplicate: true };
    });

    await enqueueContextMenuSave('https://x.test/changing.png', 'changing.png');
    await vi.waitFor(() => expect(mocks.saveToSploot).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(storedQueue[0]?.state).toBe('pending'));
    vi.setSystemTime(storedQueue[0].nextAttemptAt!);
    await recoverPendingContextMenuSaves();

    expect(mocks.fetchImage).toHaveBeenCalledOnce();
    expect(mocks.saveToSploot).toHaveBeenCalledTimes(2);
    expect(storedQueue).toEqual([]);
  });

  it('pauses a durable save when the Clerk session changes without leaking the owner', async () => {
    storedQueue = [{
      id: 'owner-bound',
      imageUrl: 'https://x.test/private.png',
      filename: 'private.png',
      state: 'pending',
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
      owner: OWNER,
    }];
    mocks.getAuthAuthority.mockResolvedValue({ userId: 'user-2', sessionId: 'session-2' });

    await recoverPendingContextMenuSaves();

    expect(mocks.saveToSploot).not.toHaveBeenCalled();
    expect(storedQueue[0]).toMatchObject({
      state: 'paused',
      lastError: 'Sign in to the original Sploot account to resume this save.',
    });
    expect(storedQueue[0].lastError).not.toContain('user-1');
  });

  it('fans out eligible jobs so a hung first upload cannot starve the next job', async () => {
    storedQueue = [{
      id: 'hung', imageUrl: 'https://x.test/hung.png', filename: 'hung.png', state: 'pending',
      createdAt: Date.now(), attempts: 0, nextAttemptAt: Date.now(), owner: OWNER,
    }, {
      id: 'next', imageUrl: 'https://x.test/next.png', filename: 'next.png', state: 'pending',
      createdAt: Date.now(), attempts: 0, nextAttemptAt: Date.now(), owner: OWNER,
    }];
    mocks.saveToSploot.mockImplementation(async (produce: () => Promise<{ filename: string }>) => {
      const produced = await produce();
      if (produced.filename === 'hung.png') {
        return await new Promise<never>(() => undefined);
      }
      return { ok: true, filename: produced.filename, isDuplicate: false };
    });

    const recovery = recoverPendingContextMenuSaves();
    await vi.waitFor(() => expect(mocks.saveToSploot).toHaveBeenCalledTimes(2));
    expect(storedQueue.find(job => job.id === 'next')).toBeUndefined();
    vi.advanceTimersByTime(CONTEXT_MENU_SAVE_DEADLINE_MS);
    await recovery;

    expect(storedQueue.find(job => job.id === 'hung')).toMatchObject({
      state: 'processing', attempts: 1, processingSettling: true,
    });
  });

  it('keeps recovery concurrency bounded instead of fanning out every job', async () => {
    storedQueue = Array.from({ length: 5 }, (_, index) => ({
      id: `bounded-${index}`,
      imageUrl: `https://x.test/${index}.png`,
      filename: `${index}.png`,
      state: 'pending' as const,
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
      owner: OWNER,
    }));
    let active = 0;
    let maximum = 0;
    const resolvers: Array<() => void> = [];
    mocks.saveToSploot.mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>(resolve => resolvers.push(resolve));
      active -= 1;
      return { ok: true, filename: 'bounded.png', isDuplicate: false };
    });

    const recovery = recoverPendingContextMenuSaves();
    await vi.waitFor(() => expect(mocks.saveToSploot).toHaveBeenCalledTimes(2));
    expect(maximum).toBe(2);
    expect(mocks.saveToSploot).toHaveBeenCalledTimes(2);
    resolvers.splice(0, 2).forEach(resolve => resolve());
    await vi.waitFor(() => expect(mocks.saveToSploot).toHaveBeenCalledTimes(4));
    resolvers.splice(0, 2).forEach(resolve => resolve());
    await vi.waitFor(() => expect(mocks.saveToSploot).toHaveBeenCalledTimes(5));
    resolvers.shift()?.();
    await recovery;
    expect(maximum).toBe(2);
    expect(storedQueue).toEqual([]);
  });

  it('keeps a late success fenced until the timed-out operation settles', async () => {
    storedQueue = [{
      id: 'late', imageUrl: 'https://x.test/late.png', filename: 'late.png', state: 'pending',
      createdAt: Date.now(), attempts: 0, nextAttemptAt: Date.now(), owner: OWNER,
    }];
    let resolveLate!: (outcome: { ok: true; filename: string; isDuplicate: boolean }) => void;
    mocks.saveToSploot.mockReturnValue(new Promise(resolve => { resolveLate = resolve; }));

    const recovery = recoverPendingContextMenuSaves();
    await vi.waitFor(() => expect(mocks.saveToSploot).toHaveBeenCalledOnce());
    vi.advanceTimersByTime(CONTEXT_MENU_SAVE_DEADLINE_MS);
    await recovery;
    expect(storedQueue[0]).toMatchObject({ state: 'processing', processingSettling: true });

    resolveLate({ ok: true, filename: 'late.png', isDuplicate: false });
    await vi.waitFor(() => expect(storedQueue[0]).toMatchObject({ state: 'pending', attempts: 1 }));
    expect(storedQueue).toHaveLength(1);
    await recoverPendingContextMenuSaves();
    expect(mocks.saveToSploot).toHaveBeenCalledOnce();
  });

  it('persists screenshot bytes before processing and replays them after an upload failure', async () => {
    mocks.saveToSploot.mockResolvedValueOnce({ ok: false, error: new Error('offline') });
    await enqueueCapturedSave(new Blob(['captured-original'], { type: 'image/png' }), 'shot.png');

    expect(storedQueue[0]).toMatchObject({
      state: 'pending',
      sourceType: 'image/png',
      sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const original = storedQueue[0].sourceBytes;
    await vi.waitFor(() => expect(storedQueue[0].nextAttemptAt).toBeGreaterThan(Date.now()));
    vi.setSystemTime(storedQueue[0].nextAttemptAt!);
    mocks.saveToSploot.mockImplementationOnce(async (produce: () => Promise<{ blob: Blob; filename: string }>) => {
      const produced = await produce();
      expect(await produced.blob.text()).toBe('captured-original');
      return { ok: true, filename: produced.filename, isDuplicate: true };
    });
    await recoverPendingContextMenuSaves();
    expect(original).toBeDefined();
    expect(storedQueue).toEqual([]);
  });

  it('bounds concurrent source fetches so a hung URL does not block later enqueue work', async () => {
    mocks.fetchImage.mockImplementation((url: string) => (
      url.includes('hung')
        ? new Promise<Blob>(() => undefined)
        : Promise.resolve(new Blob(['later'], { type: 'image/png' }))
    ));

    const hung = enqueueContextMenuSave('https://x.test/hung.png', 'hung.png');
    const later = enqueueContextMenuSave('https://x.test/later.png', 'later.png');
    await vi.waitFor(() => expect(mocks.saveToSploot).toHaveBeenCalledWith(
      expect.any(Function), 'image', { owner: OWNER, signal: expect.any(AbortSignal) },
    ));
    expect(storedQueue).toEqual([]);
    vi.advanceTimersByTime(CONTEXT_MENU_SAVE_DEADLINE_MS);
    const results = await Promise.allSettled([hung, later]);
    expect(results[0].status).not.toBe('pending');
    expect(results[1]).toEqual({ status: 'fulfilled', value: undefined });
  });

  it('admits no more than two initial source fetches at once', async () => {
    let active = 0;
    let maximum = 0;
    const resolvers: Array<() => void> = [];
    mocks.fetchImage.mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>(resolve => resolvers.push(resolve));
      active -= 1;
      return new Blob(['admitted'], { type: 'image/png' });
    });
    const enqueues = Array.from({ length: 5 }, (_, index) => enqueueContextMenuSave(`https://x.test/${index}.png`, `${index}.png`));
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    expect(maximum).toBe(2);
    resolvers.splice(0, 2).forEach(resolve => resolve());
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers.splice(0, 2).forEach(resolve => resolve());
    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    resolvers.shift()?.();
    await Promise.all(enqueues);
    await recoverPendingContextMenuSaves();
    expect(maximum).toBe(2);
  });

  it('does not upload if the worker terminates before source bytes are persisted', async () => {
    const storageSet = chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>;
    storageSet.mockRejectedValueOnce(new Error('worker terminated before commit'));

    await expect(enqueueCapturedSave(new Blob(['not-durable'], { type: 'image/png' }), 'lost.png'))
      .rejects.toThrow('worker terminated before commit');
    expect(mocks.saveToSploot).not.toHaveBeenCalled();
  });

  it('adopts a paused save for the same account under a new session', async () => {
    storedQueue = [{
      id: 'adopt',
      imageUrl: 'https://x.test/adopt.png',
      filename: 'adopt.png',
      state: 'paused',
      createdAt: Date.now(),
      attempts: 1,
      nextAttemptAt: 0,
      lastError: 'Sign in to the original Sploot account to resume this save.',
      owner: { userId: 'user-1', accountId: 'user-1', sessionId: 'session-1' },
    }];
    mocks.getAuthAuthority.mockResolvedValue({ userId: 'user-1', accountId: 'user-1', sessionId: 'session-99' });

    await recoverPendingContextMenuSaves();

    expect(mocks.saveToSploot).toHaveBeenCalledOnce();
    expect(storedQueue).toEqual([]);
  });

  it('lets the same account retry and discard terminal saves under a new session', async () => {
    storedQueue = [{
      id: 'stranded',
      imageUrl: 'https://x.test/stranded.png',
      filename: 'stranded.png',
      state: 'failed',
      createdAt: Date.now(),
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
      nextAttemptAt: 0,
      lastError: 'needs attention',
      owner: { userId: 'user-1', accountId: 'user-1', sessionId: 'session-1' },
    }];
    mocks.getAuthAuthority.mockResolvedValue({ userId: 'user-1', accountId: 'user-1', sessionId: 'session-99' });

    await expect(retryContextMenuSave('stranded')).resolves.toBe(true);
    expect(storedQueue[0]).toMatchObject({ state: 'pending', attempts: 0 });

    storedQueue = [{
      ...storedQueue[0],
      id: 'stranded-2',
      state: 'failed',
      nextAttemptAt: 0,
    }];
    await expect(discardContextMenuSave('stranded-2')).resolves.toBe(true);
    expect(storedQueue).toEqual([]);
  });

  it('refuses retry and discard for a different account even with an identical session id', async () => {
    storedQueue = [{
      id: 'foreign',
      imageUrl: 'https://x.test/foreign.png',
      filename: 'foreign.png',
      state: 'failed',
      createdAt: Date.now(),
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
      nextAttemptAt: 0,
      owner: { userId: 'user-1', accountId: 'user-1', sessionId: 'session-1' },
    }];
    mocks.getAuthAuthority.mockResolvedValue({ userId: 'user-2', accountId: 'user-2', sessionId: 'session-1' });

    await expect(retryContextMenuSave('foreign')).resolves.toBe(false);
    await expect(discardContextMenuSave('foreign')).resolves.toBe(false);
    expect(storedQueue).toHaveLength(1);
    expect(mocks.saveToSploot).not.toHaveBeenCalled();
  });

  it('drops terminal saves after the bounded retention window', async () => {
    storedQueue = [{
      id: 'expired-failed',
      imageUrl: 'https://x.test/expired-failed.png',
      filename: 'expired-failed.png',
      state: 'failed',
      createdAt: Date.now() - TERMINAL_SAVE_RETENTION_MS - 120_000,
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
      nextAttemptAt: 0,
      failedAt: Date.now() - TERMINAL_SAVE_RETENTION_MS - 1,
    }, {
      id: 'expired-paused',
      imageUrl: 'https://x.test/expired-paused.png',
      filename: 'expired-paused.png',
      state: 'paused',
      createdAt: Date.now() - TERMINAL_SAVE_RETENTION_MS - 120_000,
      attempts: 1,
      nextAttemptAt: 0,
      pausedAt: Date.now() - TERMINAL_SAVE_RETENTION_MS - 1,
      owner: { userId: 'user-9', accountId: 'user-9', sessionId: 'session-9' },
    }, {
      id: 'fresh-failed',
      imageUrl: 'https://x.test/fresh-failed.png',
      filename: 'fresh-failed.png',
      state: 'failed',
      createdAt: Date.now() - 60_000,
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
      nextAttemptAt: 0,
      failedAt: Date.now() - 1_000,
    }];

    await recoverPendingContextMenuSaves();

    expect(storedQueue.map(job => job.id)).toEqual(['fresh-failed']);
    expect(mocks.saveToSploot).not.toHaveBeenCalled();
  });

  it('reclaims a full queue of another account\'s failures so the current account can save', async () => {
    storedQueue = Array.from({ length: MAX_CONTEXT_MENU_SAVE_QUEUE_SIZE }, (_, index) => ({
      id: `foreign-${index}`,
      imageUrl: `https://private.test/${index}.png`,
      filename: `foreign-${index}.png`,
      state: 'failed' as const,
      createdAt: Date.now() - (MAX_CONTEXT_MENU_SAVE_QUEUE_SIZE - index) * 1_000,
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
      nextAttemptAt: 0,
      failedAt: Date.now() - 1_000,
      lastError: 'old account failure',
      owner: { userId: 'user-old', accountId: 'user-old', sessionId: 'session-old' },
    }));

    await enqueueContextMenuSave('https://x.test/new.png', 'new.png');

    // Deterministic, privacy-safe reclaim: the oldest non-active foreign job is
    // evicted (never uploaded, never surfaced) and the new save proceeds.
    await vi.waitFor(() => expect(mocks.saveToSploot).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(storedQueue.every(job => job.filename !== 'new.png')).toBe(true));
    expect(storedQueue).toHaveLength(MAX_CONTEXT_MENU_SAVE_QUEUE_SIZE - 1);
    expect(storedQueue.some(job => job.id === 'foreign-0')).toBe(false);
    expect(storedQueue.some(job => job.id === 'foreign-1')).toBe(true);
    expect(mocks.showErrorNotification).not.toHaveBeenCalled();
  });

  it('reclaims byte-budget pressure from foreign saves without uploading or leaking them', async () => {
    const halfBudget = btoa('a'.repeat(3 * 1024 * 1024)).slice(0, Math.ceil(MAX_CONTEXT_MENU_SAVE_STORAGE_BYTES / 2));
    storedQueue = [0, 1].map(index => ({
      id: `foreign-bytes-${index}`,
      imageUrl: `https://private.test/bytes-${index}.png`,
      filename: `foreign-bytes-${index}.png`,
      state: 'failed' as const,
      createdAt: Date.now() - (2 - index) * 1_000,
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
      nextAttemptAt: 0,
      failedAt: Date.now() - 1_000,
      sourceBytes: halfBudget,
      sourceType: 'image/png',
      owner: { userId: 'user-old', accountId: 'user-old', sessionId: 'session-old' },
    }));

    await enqueueCapturedSave(new Blob(['captured-new'], { type: 'image/png' }), 'fresh-capture.png');

    await vi.waitFor(() => expect(mocks.saveToSploot).toHaveBeenCalledOnce());
    expect(storedQueue.map(job => job.id)).toEqual(['foreign-bytes-1']);
    expect(mocks.showErrorNotification).not.toHaveBeenCalled();
  });

  it('never evicts current-owner or actively processing jobs to admit a new save', async () => {
    storedQueue = Array.from({ length: MAX_CONTEXT_MENU_SAVE_QUEUE_SIZE - 1 }, (_, index) => ({
      id: `mine-${index}`,
      imageUrl: `https://x.test/mine-${index}.png`,
      filename: `mine-${index}.png`,
      state: 'failed' as const,
      createdAt: Date.now() - index * 1_000,
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS,
      nextAttemptAt: 0,
      failedAt: Date.now() - 1_000,
      owner: OWNER,
    }));
    storedQueue.push({
      id: 'foreign-active',
      imageUrl: 'https://private.test/active.png',
      filename: 'foreign-active.png',
      state: 'processing',
      createdAt: Date.now() - 500_000,
      attempts: 1,
      nextAttemptAt: 0,
      processingStartedAt: Date.now(),
      processingToken: 'active-token',
      owner: { userId: 'user-old', accountId: 'user-old', sessionId: 'session-old' },
    });
    const before = structuredClone(storedQueue);

    await expect(enqueueContextMenuSave('https://x.test/new.png', 'new.png'))
      .rejects.toMatchObject({ code: 'queue-full' });

    expect(storedQueue).toEqual(before);
    expect(mocks.saveToSploot).not.toHaveBeenCalled();
  });

  it('schedules a bounded retry instead of pausing when the auth check fails transiently', async () => {
    storedQueue = [{
      id: 'transient-auth',
      imageUrl: 'https://x.test/transient.png',
      filename: 'transient.png',
      state: 'pending',
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
      owner: OWNER,
    }];
    mocks.readAuthAuthority.mockRejectedValue(new Error('clerk transport down'));

    await recoverPendingContextMenuSaves();

    expect(mocks.saveToSploot).not.toHaveBeenCalled();
    expect(storedQueue[0]).toMatchObject({
      state: 'pending',
      attempts: 1,
      lastError: 'clerk transport down',
    });
    expect(storedQueue[0].nextAttemptAt).toBeGreaterThan(Date.now());
    const storageSet = chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>;
    expect(storageSet).toHaveBeenCalledWith(expect.objectContaining({
      'sploot:last-save': expect.objectContaining({ state: 'retrying' }),
    }));
  });

  it('terminalizes a save when transient auth failures exhaust the attempt budget', async () => {
    storedQueue = [{
      id: 'auth-exhausted',
      imageUrl: 'https://x.test/auth-exhausted.png',
      filename: 'auth-exhausted.png',
      state: 'pending',
      createdAt: Date.now(),
      attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS - 1,
      nextAttemptAt: Date.now(),
      owner: OWNER,
    }];
    mocks.readAuthAuthority.mockRejectedValue(new Error('clerk transport down'));

    await recoverPendingContextMenuSaves();

    expect(mocks.saveToSploot).not.toHaveBeenCalled();
    expect(storedQueue[0]).toMatchObject({ state: 'failed', attempts: MAX_CONTEXT_MENU_SAVE_ATTEMPTS });
    expect(mocks.showErrorNotification).toHaveBeenCalledOnce();
  });

  it('notifies once per recovery pass when saves pause for a different account', async () => {
    storedQueue = ['a', 'b'].map(suffix => ({
      id: `paused-${suffix}`,
      imageUrl: `https://private.test/${suffix}.png`,
      filename: `private-${suffix}.png`,
      state: 'pending' as const,
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
      owner: { userId: 'user-1', accountId: 'user-1', sessionId: 'session-1' },
    }));
    mocks.getAuthAuthority.mockResolvedValue({ userId: 'user-2', accountId: 'user-2', sessionId: 'session-2' });

    await recoverPendingContextMenuSaves();

    expect(storedQueue.every(job => job.state === 'paused')).toBe(true);
    expect(mocks.saveToSploot).not.toHaveBeenCalled();
    expect(mocks.showErrorNotification).toHaveBeenCalledOnce();
    const [notified] = mocks.showErrorNotification.mock.calls[0];
    const message = typeof notified === 'string' ? notified : notified.message;
    expect(message).toContain('original Sploot account');
    expect(message).not.toContain('private-');
  });

  it('never admits more than the gate limit when a release races a new caller', async () => {
    const gate = new ConcurrencyGate(1);
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    const operation = async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>(resolve => releases.push(resolve));
      active -= 1;
    };

    const first = gate.run(operation);
    const second = gate.run(operation);
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()!();
    // Land a new admission attempt inside the release window, after the gate
    // wakes its waiter but before that waiter re-enters.
    await Promise.resolve();
    await Promise.resolve();
    const third = gate.run(operation);

    while (releases.length > 0 || active > 0) {
      releases.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
    await Promise.all([first, second, third]);
    expect(maximum).toBe(1);
  });
});
