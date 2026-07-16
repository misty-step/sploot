import * as fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UPDATE_MESSAGES,
  UPDATE_STATUS_STORAGE_KEY,
  requestDismissUpdate,
  requestUpdateNotice,
  checkForUpdates,
  dismissUpdate,
  getUpdateNotice,
  isNewerVersion,
  openUpdatePage,
  resetUpdateCheckForTesting,
  setupUpdateStatus,
  setUpdateAvailableForTesting,
} from './update-status';

type Listener = (event: { version: string }) => void;

let stored: Record<string, unknown>;
let updateListener: Listener | undefined;
let manifestVersion: string;
let requestUpdateCheck: ReturnType<typeof vi.fn>;
let messageListener: ((message: any, sender: any, sendResponse: (value: any) => void) => boolean | undefined) | undefined;

beforeEach(() => {
  stored = {};
  updateListener = undefined;
  manifestVersion = '1.0.0';
  requestUpdateCheck = vi.fn().mockResolvedValue({ status: 'no_update' });
  messageListener = undefined;
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'test-extension',
      getManifest: () => ({ version: manifestVersion }),
      requestUpdateCheck,
      onUpdateAvailable: { addListener: vi.fn((listener: Listener) => { updateListener = listener; }) },
      onMessage: { addListener: vi.fn((listener: typeof messageListener) => { messageListener = listener; }) },
      sendMessage: vi.fn(),
    },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(stored, items)),
        remove: vi.fn(async (key: string) => { delete stored[key]; }),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: { create: vi.fn().mockResolvedValue({ id: 1 }) },
  });
  resetUpdateCheckForTesting();
});

describe('update-status', () => {
  it('routes popup status and dismissal helpers through typed worker messages', async () => {
    const sendMessage = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    sendMessage.mockResolvedValueOnce({ version: '1.2.0', dismissed: false }).mockResolvedValueOnce({ ok: true });
    expect(await requestUpdateNotice()).toEqual({ version: '1.2.0', dismissed: false });
    expect(await requestDismissUpdate('1.2.0')).toBe(true);
    expect(sendMessage).toHaveBeenNthCalledWith(1, { type: UPDATE_MESSAGES.GET_STATUS });
    expect(sendMessage).toHaveBeenNthCalledWith(2, { type: UPDATE_MESSAGES.DISMISS, version: '1.2.0' });
  });

  it('fails closed when popup worker requests reject', async () => {
    const sendMessage = chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    sendMessage.mockRejectedValue(new Error('worker unavailable'));
    expect(await requestUpdateNotice()).toBeNull();
    expect(await requestDismissUpdate('1.2.0')).toBe(false);
  });

  it('registers a same-extension message boundary and ignores malformed messages', async () => {
    setupUpdateStatus();
    const sendResponse = vi.fn();
    expect(messageListener?.({ type: 'unknown' }, { id: 'test-extension' }, sendResponse)).toBeUndefined();
    expect(messageListener?.({ type: UPDATE_MESSAGES.GET_STATUS }, { id: 'other-extension' }, sendResponse)).toBeUndefined();
    expect(messageListener?.({ type: UPDATE_MESSAGES.DISMISS }, { id: 'test-extension' }, sendResponse)).toBeUndefined();
    expect(messageListener?.({ type: UPDATE_MESSAGES.REQUEST_CHECK }, { id: 'test-extension' }, sendResponse)).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  it('survives service-worker setup restart with persisted dismissal', async () => {
    await setUpdateAvailableForTesting('1.2.0');
    await dismissUpdate('1.2.0');
    requestUpdateCheck.mockReturnValue(new Promise(() => undefined));
    resetUpdateCheckForTesting();
    setupUpdateStatus();
    expect(await getUpdateNotice()).toEqual({ version: '1.2.0', dismissed: true });
  });

  it('keeps popup update ownership in the worker', async () => {
    const popup = await fs.readFile(new URL('../entrypoints/popup/App.tsx', import.meta.url), 'utf8');
    expect(popup).toContain('requestUpdateNotice');
    expect(popup).toContain('requestDismissUpdate');
    expect(popup).not.toMatch(/\b(getUpdateNotice|dismissUpdate)\b/);
    expect(popup).not.toMatch(/chrome\.storage\.local\.(set|remove)/);
  });

  it('compares Chrome versions without treating equal/current versions as updates', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.0.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false);
    expect(isNewerVersion('999999999999999999', '1.0.0')).toBe(false);
  });

  it('stores an update returned by requestUpdateCheck at startup', async () => {
    requestUpdateCheck.mockResolvedValue({ status: 'update_available', version: '1.2.0' });
    setupUpdateStatus();
    await vi.waitFor(async () => expect(await getUpdateNotice()).toEqual({ version: '1.2.0', dismissed: false }));
    expect(requestUpdateCheck).toHaveBeenCalledTimes(1);
  });

  it('stores only a newer version from the native update event', async () => {
    requestUpdateCheck.mockReturnValue(new Promise(() => undefined));
    setupUpdateStatus();
    updateListener?.({ version: '1.1.0' });
    await vi.waitFor(async () => expect(await getUpdateNotice()).toEqual({ version: '1.1.0', dismissed: false }));
    updateListener?.({ version: '1.0.1' });
    await Promise.resolve();
    expect(stored[UPDATE_STATUS_STORAGE_KEY]).toMatchObject({ availableVersion: '1.1.0' });
  });

  it('clears stale state when the native check reports no update or the installed version catches up', async () => {
    stored[UPDATE_STATUS_STORAGE_KEY] = { availableVersion: '1.1.0', dismissedVersion: null };
    setupUpdateStatus();
    await vi.waitFor(() => expect(stored[UPDATE_STATUS_STORAGE_KEY]).toBeUndefined());
    stored[UPDATE_STATUS_STORAGE_KEY] = { availableVersion: '1.1.0', dismissedVersion: null };
    manifestVersion = '1.1.0';
    expect(await getUpdateNotice()).toBeNull();
    expect(stored[UPDATE_STATUS_STORAGE_KEY]).toBeUndefined();
  });

  it('dismisses exactly one version and shows a later version again', async () => {
    requestUpdateCheck.mockReturnValue(new Promise(() => undefined));
    setupUpdateStatus();
    updateListener?.({ version: '1.1.0' });
    await vi.waitFor(() => expect(stored[UPDATE_STATUS_STORAGE_KEY]).toBeTruthy());
    await dismissUpdate('1.1.0');
    expect(await getUpdateNotice()).toEqual({ version: '1.1.0', dismissed: true });
    updateListener?.({ version: '1.2.0' });
    await vi.waitFor(async () => expect(await getUpdateNotice()).toEqual({ version: '1.2.0', dismissed: false }));
  });

  it('fails silently when the native check rejects and does not block startup', async () => {
    requestUpdateCheck.mockRejectedValue(new Error('offline'));
    expect(() => checkForUpdates()).not.toThrow();
    await Promise.resolve();
    expect(stored[UPDATE_STATUS_STORAGE_KEY]).toBeUndefined();
  });

  it('does not mutate when native update storage reads reject', async () => {
    requestUpdateCheck.mockResolvedValue({ status: 'update_available', version: '1.2.0' });
    Object.assign(chrome.storage.local, { get: vi.fn().mockRejectedValue(new Error('storage down')) });
    setupUpdateStatus();
    await Promise.resolve();
    await Promise.resolve();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it('does not remove stale state when popup reconciliation reads reject', async () => {
    Object.assign(chrome.storage.local, { get: vi.fn().mockRejectedValue(new Error('storage down')) });
    expect(await getUpdateNotice()).toBeNull();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it('does not rewrite dismissal when dismissal reads reject', async () => {
    Object.assign(chrome.storage.local, { get: vi.fn().mockRejectedValue(new Error('storage down')) });
    await dismissUpdate('1.1.0');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it('preserves a newer event while stale popup reconciliation is pending', async () => {
    requestUpdateCheck.mockReturnValue(new Promise(() => undefined));
    stored[UPDATE_STATUS_STORAGE_KEY] = { availableVersion: '0.9.0', dismissedVersion: null };
    let releaseRead!: () => void;
    const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
    const get = vi.fn(async (key: string) => {
      if (key === UPDATE_STATUS_STORAGE_KEY) await readGate;
      return { [key]: stored[key] };
    });
    Object.assign(chrome.storage.local, { get });
    setupUpdateStatus();

    const staleReconciliation = getUpdateNotice();
    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    updateListener?.({ version: '1.2.0' });
    releaseRead();
    await staleReconciliation;
    await vi.waitFor(async () => expect(await getUpdateNotice()).toEqual({ version: '1.2.0', dismissed: false }));
  });

  it('preserves a newer event while dismissal is pending', async () => {
    requestUpdateCheck.mockReturnValue(new Promise(() => undefined));
    stored[UPDATE_STATUS_STORAGE_KEY] = { availableVersion: '1.1.0', dismissedVersion: null };
    let releaseRead!: () => void;
    const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
    const get = vi.fn(async (key: string) => {
      if (key === UPDATE_STATUS_STORAGE_KEY) await readGate;
      return { [key]: stored[key] };
    });
    Object.assign(chrome.storage.local, { get });
    setupUpdateStatus();

    const dismissal = dismissUpdate('1.1.0');
    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    updateListener?.({ version: '1.2.0' });
    releaseRead();
    await dismissal;
    await vi.waitFor(async () => expect(await getUpdateNotice()).toEqual({ version: '1.2.0', dismissed: false }));
  });

  it('opens the existing Chrome extensions update path', async () => {
    expect(await openUpdatePage()).toBe(true);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions' });
  });
});
