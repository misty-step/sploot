import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UPDATE_STATUS_STORAGE_KEY,
  checkForUpdates,
  dismissUpdate,
  getUpdateNotice,
  isNewerVersion,
  openUpdatePage,
  resetUpdateCheckForTesting,
  setupUpdateStatus,
} from './update-status';

type Listener = (event: { version: string }) => void;

let stored: Record<string, unknown>;
let updateListener: Listener | undefined;
let manifestVersion: string;
let requestUpdateCheck: ReturnType<typeof vi.fn>;

beforeEach(() => {
  stored = {};
  updateListener = undefined;
  manifestVersion = '1.0.0';
  requestUpdateCheck = vi.fn().mockResolvedValue({ status: 'no_update' });
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ version: manifestVersion }),
      requestUpdateCheck,
      onUpdateAvailable: { addListener: vi.fn((listener: Listener) => { updateListener = listener; }) },
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
