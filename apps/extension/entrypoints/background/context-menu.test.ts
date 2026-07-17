import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_MESSAGES } from '../../shared/auth-messages';
import { CONTEXT_MENU_SAVE_MESSAGES } from '../../shared/context-menu-save-messages';

const mocks = vi.hoisted(() => ({
  fetchImage: vi.fn(),
  isAuthenticated: vi.fn(),
  promptUserSignIn: vi.fn(),
  getAuthAuthority: vi.fn(),
  readAuthAuthority: vi.fn(),
  getAuthTokenForAuthority: vi.fn(),
  sameAccountAuthority: vi.fn(),
  runAuthDiagnostics: vi.fn(),
  uploadImage: vi.fn(),
  showSuccessNotification: vi.fn(),
  showErrorNotification: vi.fn(),
}));

// Live build-mode toggle so both the dev and production branches are testable.
const buildMode = vi.hoisted(() => ({ dev: true }));
vi.mock('../../shared/build-mode', () => ({
  get IS_DEV_BUILD() {
    return buildMode.dev;
  },
}));

vi.mock('./image-fetcher', () => ({ fetchImage: mocks.fetchImage }));
vi.mock('./auth-manager', () => ({
  isAuthenticated: mocks.isAuthenticated,
  promptUserSignIn: mocks.promptUserSignIn,
  getAuthAuthority: mocks.getAuthAuthority,
  readAuthAuthority: mocks.readAuthAuthority,
  getAuthTokenForAuthority: mocks.getAuthTokenForAuthority,
  sameAccountAuthority: mocks.sameAccountAuthority,
  runAuthDiagnostics: mocks.runAuthDiagnostics,
}));
vi.mock('../../shared/api-client', () => ({ uploadImage: mocks.uploadImage }));
vi.mock('./notifications', () => ({
  showSuccessNotification: mocks.showSuccessNotification,
  showErrorNotification: mocks.showErrorNotification,
}));
// save-flow is intentionally NOT mocked — exercise the real shared pipeline so
// the shipped right-click path is verified end-to-end, not just compiled.

import { ensureContextMenus, setupContextMenu } from './context-menu';

type ClickHandler = (info: { menuItemId: string; srcUrl?: string }, tab?: { title?: string }) => Promise<void>;
type MessageHandler = (
  message: { type: string; jobId?: string },
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;
let onClicked: ClickHandler;
let onStartup: (() => Promise<void>) | undefined;
let onMessage: MessageHandler;
let runtimeMessageListeners: Array<(message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => unknown> = [];
let contextMenusCreate: ReturnType<typeof vi.fn>;
let contextMenusRemove: ReturnType<typeof vi.fn>;
let storedQueue: unknown[] = [];
const OWNER = { userId: 'user-1', sessionId: 'session-1' };

beforeEach(() => {
  vi.clearAllMocks();
  buildMode.dev = true;
  contextMenusCreate = vi.fn();
  contextMenusRemove = vi.fn();
  storedQueue = [];
  runtimeMessageListeners = [];
  vi.stubGlobal('chrome', {
    contextMenus: {
      create: contextMenusCreate,
      remove: contextMenusRemove,
      onClicked: { addListener: vi.fn((fn: ClickHandler) => { onClicked = fn; }) },
    },
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn((fn: () => Promise<void>) => { onStartup = fn; }) },
      onMessage: { addListener: vi.fn((fn: MessageHandler) => { runtimeMessageListeners.push(fn as unknown as (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => unknown); onMessage = fn; }) },
    },
    alarms: {
      create: vi.fn(async () => undefined),
      clear: vi.fn(async () => true),
      onAlarm: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: vi.fn().mockImplementation(async () => ({
          'sploot:context-menu-queue': storedQueue.map(job => ({
            ...(job as Record<string, unknown>),
            owner: (job as Record<string, unknown>).owner ?? ((job as Record<string, unknown>).state === 'awaiting-auth' ? undefined : OWNER),
            sourceBytes: (job as Record<string, unknown>).sourceBytes ?? btoa('x'),
            sourceType: (job as Record<string, unknown>).sourceType ?? 'image/png',
          })),
        })),
        set: vi.fn().mockImplementation(async (value: Record<string, unknown>) => {
          if ('sploot:context-menu-queue' in value) {
            storedQueue = value['sploot:context-menu-queue'] as unknown[];
          }
        }),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });
  mocks.isAuthenticated.mockResolvedValue(true);
  mocks.getAuthAuthority.mockResolvedValue(OWNER);
  mocks.readAuthAuthority.mockImplementation((signal?: AbortSignal) => mocks.getAuthAuthority(signal));
  mocks.getAuthTokenForAuthority.mockResolvedValue('token');
  mocks.sameAccountAuthority.mockImplementation((left, right) => Boolean(
    left && right
    && left.userId === right.userId
    && (left.accountId ?? left.userId) === (right.accountId ?? right.userId),
  ));
  mocks.fetchImage.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
  mocks.uploadImage.mockResolvedValue({
    assetId: 'a1',
    blobUrl: 'b',
    thumbnailUrl: 't',
    isDuplicate: false,
  });
  setupContextMenu();
});

describe('context menu save', () => {
  it('fetches and uploads the right-clicked image, then reports success', async () => {
    await onClicked({ menuItemId: 'save-to-sploot', srcUrl: 'https://x.test/cat.png' }, { title: 'Cat' });

    await vi.waitFor(() => expect(mocks.fetchImage).toHaveBeenCalledWith('https://x.test/cat.png', expect.any(AbortSignal)));
    await vi.waitFor(() => expect(mocks.uploadImage).toHaveBeenCalledWith(
      expect.any(Blob), 'cat.png', expect.anything(), expect.any(AbortSignal),
    ));
    await vi.waitFor(() => expect(mocks.showSuccessNotification).toHaveBeenCalled());
    expect(mocks.showErrorNotification).not.toHaveBeenCalled();
  });

  it('continues the original right-click from the signed-in runtime event after a worker boundary', async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    mocks.getAuthAuthority.mockClear();
    mocks.getAuthAuthority
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(OWNER);
    let finishPrompt!: (signedIn: boolean) => void;
    mocks.promptUserSignIn.mockReturnValueOnce(new Promise(resolve => { finishPrompt = resolve; }));

    const click = onClicked({ menuItemId: 'save-to-sploot', srcUrl: 'https://x.test/cat.png' }, { title: 'Cat' });
    await vi.waitFor(() => expect(mocks.promptUserSignIn).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(storedQueue).toEqual([expect.objectContaining({ state: 'awaiting-auth' })]));

    for (const listener of runtimeMessageListeners) {
      listener({
        type: AUTH_MESSAGES.STATE_CHANGED,
        payload: { status: 'signed-in', userId: OWNER.userId, sessionId: OWNER.sessionId },
      }, {}, vi.fn());
    }

    await vi.waitFor(() => expect(mocks.uploadImage).toHaveBeenCalledWith(
      expect.any(Blob), 'cat.png', expect.anything(), expect.any(AbortSignal),
    ));
    finishPrompt(false);
    await click;

    expect(mocks.showSuccessNotification).toHaveBeenCalled();
    expect(mocks.showErrorNotification).not.toHaveBeenCalled();
  });

  it('keeps an authenticated duplicate save successful and reports duplicate truth', async () => {
    mocks.uploadImage.mockResolvedValueOnce({
      assetId: 'existing-a1',
      blobUrl: 'b',
      thumbnailUrl: 't',
      isDuplicate: true,
    });

    await onClicked({ menuItemId: 'save-to-sploot', srcUrl: 'https://x.test/cat.png' }, { title: 'Cat' });

    await vi.waitFor(() => expect(mocks.isAuthenticated).toHaveBeenCalled());
    await vi.waitFor(() => expect(mocks.showSuccessNotification).toHaveBeenCalledWith('cat.png', 't', { isDuplicate: true }));
    expect(mocks.showErrorNotification).not.toHaveBeenCalled();
  });

  it('shows an error and never uploads when there is no image URL', async () => {
    await onClicked({ menuItemId: 'save-to-sploot', srcUrl: undefined }, undefined);

    expect(mocks.showErrorNotification).toHaveBeenCalledWith('No image URL found');
    expect(mocks.fetchImage).not.toHaveBeenCalled();
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it('persists immutable source bytes before processing and removes them after success', async () => {
    await onClicked({ menuItemId: 'save-to-sploot', srcUrl: 'https://x.test/cat.png' }, { title: 'Cat' });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      'sploot:context-menu-queue': [expect.objectContaining({
        imageUrl: 'https://x.test/cat.png',
        filename: 'cat.png',
        state: 'pending',
        sourceBytes: expect.any(String),
      })],
    });
    await vi.waitFor(() => expect(storedQueue).toEqual([]));
  });

  it('replays an in-flight save after a worker restart', async () => {
    storedQueue = [{
      id: 'job-1',
      imageUrl: 'https://x.test/cat.png',
      filename: 'cat.png',
      state: 'processing',
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
      processingStartedAt: Date.now() - 5 * 60 * 1000 - 1,
    }];

    await onStartup?.();

    expect(mocks.fetchImage).not.toHaveBeenCalled();
    expect(mocks.uploadImage).toHaveBeenCalledWith(
      expect.any(Blob), 'cat.png', expect.anything(), expect.any(AbortSignal),
    );
    await vi.waitFor(() => expect(storedQueue).toEqual([]));
  });

  it('does not replay the same persisted job twice when startup recovery races', async () => {
    storedQueue = [{
      id: 'job-1',
      imageUrl: 'https://x.test/cat.png',
      filename: 'cat.png',
      state: 'processing',
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
      processingStartedAt: Date.now() - 5 * 60 * 1000 - 1,
    }];

    await Promise.all([onStartup?.(), onStartup?.()]);

    expect(mocks.fetchImage).not.toHaveBeenCalled();
    expect(mocks.uploadImage).toHaveBeenCalledOnce();
  });

  it('exposes retained failures to the popup and supports explicit discard', async () => {
    storedQueue = [{
      id: 'failed-1',
      imageUrl: 'https://x.test/cat.png',
      filename: 'cat.png',
      state: 'failed',
      createdAt: Date.now(),
      attempts: 5,
      nextAttemptAt: 0,
      lastError: 'needs attention',
    }];

    const listResponse = vi.fn();
    expect(onMessage({ type: CONTEXT_MENU_SAVE_MESSAGES.LIST_QUEUE }, {}, listResponse)).toBe(true);
    await vi.waitFor(() => expect(listResponse).toHaveBeenCalledWith({ ok: true, jobs: [{
        id: 'failed-1',
        filename: 'cat.png',
        createdAt: expect.any(Number),
        attempts: 5,
        state: 'failed',
        nextAttemptAt: 0,
        lastError: 'needs attention',
      }] }));

    const discardResponse = vi.fn();
    expect(onMessage({ type: CONTEXT_MENU_SAVE_MESSAGES.DISCARD, jobId: 'failed-1' }, {}, discardResponse)).toBe(true);
    await vi.waitFor(() => expect(discardResponse).toHaveBeenCalledWith({ ok: true, action: 'discarded' }));
    expect(storedQueue).toEqual([]);
  });

  it('returns no queue metadata and refuses discard for a different or signed-out owner', async () => {
    storedQueue = [{
      id: 'owner-a',
      imageUrl: 'https://private.test/a.png',
      filename: 'private-a.png',
      state: 'failed',
      createdAt: Date.now(),
      attempts: 5,
      nextAttemptAt: 0,
      owner: { userId: 'user-a', sessionId: 'session-a' },
      sourceBytes: btoa('private-bytes'),
      sourceType: 'image/png',
    }];
    mocks.getAuthAuthority.mockResolvedValue({ userId: 'user-b', sessionId: 'session-b' });

    const otherList = vi.fn();
    expect(onMessage({ type: CONTEXT_MENU_SAVE_MESSAGES.LIST_QUEUE }, {}, otherList)).toBe(true);
    await vi.waitFor(() => expect(otherList).toHaveBeenCalledWith({ ok: true, jobs: [] }));
    const otherDiscard = vi.fn();
    expect(onMessage({ type: CONTEXT_MENU_SAVE_MESSAGES.DISCARD, jobId: 'owner-a' }, {}, otherDiscard)).toBe(true);
    await vi.waitFor(() => expect(otherDiscard).toHaveBeenCalledWith({ ok: false, code: 'not-found', error: 'Queue job not found.' }));
    expect(storedQueue).toHaveLength(1);

    mocks.getAuthAuthority.mockResolvedValue(null);
    const signedOutList = vi.fn();
    onMessage({ type: CONTEXT_MENU_SAVE_MESSAGES.LIST_QUEUE }, {}, signedOutList);
    await vi.waitFor(() => expect(signedOutList).toHaveBeenCalledWith({ ok: true, jobs: [] }));
    const signedOutDiscard = vi.fn();
    onMessage({ type: CONTEXT_MENU_SAVE_MESSAGES.DISCARD, jobId: 'owner-a' }, {}, signedOutDiscard);
    await vi.waitFor(() => expect(signedOutDiscard).toHaveBeenCalledWith({
      ok: false,
      code: 'auth-required',
      error: 'Sign in to Sploot to manage retained saves.',
    }));
    expect(storedQueue).toHaveLength(1);
  });

  it('answers signed-out retry with an auth-required code instead of a misleading one', async () => {
    storedQueue = [{
      id: 'needs-auth',
      imageUrl: 'https://x.test/needs-auth.png',
      filename: 'needs-auth.png',
      state: 'failed',
      createdAt: Date.now(),
      attempts: 5,
      nextAttemptAt: 0,
    }];
    mocks.getAuthAuthority.mockResolvedValue(null);

    const retryResponse = vi.fn();
    expect(onMessage({ type: CONTEXT_MENU_SAVE_MESSAGES.RETRY, jobId: 'needs-auth' }, {}, retryResponse)).toBe(true);
    await vi.waitFor(() => expect(retryResponse).toHaveBeenCalledWith({
      ok: false,
      code: 'auth-required',
      error: 'Sign in to Sploot to manage retained saves.',
    }));
    expect(storedQueue).toHaveLength(1);
  });

  it('lists and retries a retained save for the same account under a new session', async () => {
    storedQueue = [{
      id: 'same-account',
      imageUrl: 'https://x.test/same-account.png',
      filename: 'same-account.png',
      state: 'failed',
      createdAt: Date.now(),
      attempts: 5,
      nextAttemptAt: 0,
      lastError: 'needs attention',
      owner: { userId: 'user-1', accountId: 'user-1', sessionId: 'session-original' },
    }];
    mocks.getAuthAuthority.mockResolvedValue({ userId: 'user-1', accountId: 'user-1', sessionId: 'session-after-reauth' });

    const listResponse = vi.fn();
    expect(onMessage({ type: CONTEXT_MENU_SAVE_MESSAGES.LIST_QUEUE }, {}, listResponse)).toBe(true);
    await vi.waitFor(() => expect(listResponse).toHaveBeenCalledWith({
      ok: true,
      jobs: [expect.objectContaining({ id: 'same-account', state: 'failed' })],
    }));

    const retryResponse = vi.fn();
    expect(onMessage({ type: CONTEXT_MENU_SAVE_MESSAGES.RETRY, jobId: 'same-account' }, {}, retryResponse)).toBe(true);
    await vi.waitFor(() => expect(retryResponse).toHaveBeenCalledWith({ ok: true, action: 'retry-queued' }));
  });

  it('returns a stable error when LIST_FAILED storage access rejects', async () => {
    // Let the startup recovery kicked off by setupContextMenu() settle (it is
    // purely microtask-based) so the one-shot rejection below is consumed by
    // the LIST_FAILED read and not by recovery's own queue reads.
    await new Promise(resolve => setTimeout(resolve, 0));
    const get = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    get.mockRejectedValueOnce(new Error('storage offline'));

    const response = vi.fn();
    expect(onMessage({ type: CONTEXT_MENU_SAVE_MESSAGES.LIST_FAILED }, {}, response)).toBe(true);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({
      ok: false,
      code: 'storage-unavailable',
      error: 'storage offline',
    }));
  });

  it('rejects malformed recognized actions without leaving the message port hanging', () => {
    const response = vi.fn();

    expect(onMessage({ type: CONTEXT_MENU_SAVE_MESSAGES.RETRY }, {}, response)).toBe(true);
    expect(response).toHaveBeenCalledWith({
      ok: false,
      code: 'invalid-request',
      error: 'Queue job id is required.',
    });
  });
});

describe('debug diagnostics production gate', () => {
  it('creates the debug menu item only in dev builds', () => {
    buildMode.dev = true;
    ensureContextMenus();

    const createdIds = contextMenusCreate.mock.calls.map(([props]) => props.id);
    expect(createdIds).toContain('save-to-sploot');
    expect(createdIds).toContain('sploot-debug-auth');
  });

  it('never creates the debug menu item in production builds and removes a stale one', () => {
    buildMode.dev = false;
    ensureContextMenus();

    const createdIds = contextMenusCreate.mock.calls.map(([props]) => props.id);
    expect(createdIds).toEqual(['save-to-sploot']);
    expect(contextMenusRemove).toHaveBeenCalledWith('sploot-debug-auth', expect.any(Function));
  });

  it('ignores debug menu clicks in production builds', async () => {
    buildMode.dev = false;
    await onClicked({ menuItemId: 'sploot-debug-auth' }, undefined);

    expect(mocks.runAuthDiagnostics).not.toHaveBeenCalled();
  });

  it('runs diagnostics on debug menu clicks in dev builds', async () => {
    buildMode.dev = true;
    mocks.runAuthDiagnostics.mockResolvedValue({ ok: true });
    await onClicked({ menuItemId: 'sploot-debug-auth' }, undefined);

    expect(mocks.runAuthDiagnostics).toHaveBeenCalled();
  });
});
