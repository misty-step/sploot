import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSaveStatus, onSaveStatusChanged, setSaveStatus, type SaveStatus } from './save-status';

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
) => void;

let stored: Record<string, unknown>;
let listeners: StorageListener[];

beforeEach(() => {
  stored = {};
  listeners = [];
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(stored, items);
        }),
        get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
      },
      onChanged: {
        addListener: vi.fn((listener: StorageListener) => {
          listeners.push(listener);
        }),
        removeListener: vi.fn((listener: StorageListener) => {
          listeners = listeners.filter(l => l !== listener);
        }),
      },
    },
  });
});

describe('save-status', () => {
  it('round-trips the last save outcome through chrome.storage.local', async () => {
    const status: SaveStatus = { state: 'success', filename: 'meme.png', isDuplicate: false, at: 123 };
    setSaveStatus(status);
    await Promise.resolve(); // let the fire-and-forget set settle

    expect(await getSaveStatus()).toEqual(status);
  });

  it('returns null when nothing has been saved yet', async () => {
    expect(await getSaveStatus()).toBeNull();
  });

  it('notifies subscribers of new outcomes and stops after unsubscribe', () => {
    const seen: SaveStatus[] = [];
    const unsubscribe = onSaveStatusChanged(status => seen.push(status));
    const status: SaveStatus = { state: 'error', message: 'boom', at: 456 };

    listeners.forEach(l => l({ 'sploot:last-save': { newValue: status } }, 'local'));
    expect(seen).toEqual([status]);

    // Other areas and other keys are ignored.
    listeners.forEach(l => l({ 'sploot:last-save': { newValue: status } }, 'sync'));
    listeners.forEach(l => l({ other: { newValue: 1 } }, 'local'));
    expect(seen).toHaveLength(1);

    unsubscribe();
    expect(listeners).toHaveLength(0);
  });

  it('never throws when chrome.storage is unavailable', async () => {
    vi.stubGlobal('chrome', {});
    expect(() =>
      setSaveStatus({ state: 'saving', label: 'Saving screenshot…', at: 1 })
    ).not.toThrow();
    expect(await getSaveStatus()).toBeNull();
  });
});
