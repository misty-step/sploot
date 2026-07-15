/**
 * Persistent last-save status.
 *
 * OS notifications get suppressed (Do Not Disturb, focus modes) and the badge
 * auto-clears, so every save ALSO records its outcome in
 * `chrome.storage.local`. The popup renders this as a persistent "last save"
 * strip: reopening the popup always shows what happened to the most recent
 * save, no matter when it finished. Written by the background feedback layer
 * (`background/notifications.ts` + `background/save-flow.ts`), read and
 * subscribed to by the popup.
 */

export type SaveStatus =
  | { state: 'saving'; label: string; at: number }
  | { state: 'success'; filename: string; isDuplicate: boolean; at: number }
  | { state: 'error'; message: string; at: number };

const STORAGE_KEY = 'sploot:last-save';

/** Record the latest save outcome. Fire-and-forget safe: never throws. */
export function setSaveStatus(status: SaveStatus): void {
  try {
    void chrome.storage.local.set({ [STORAGE_KEY]: status }).catch((error: unknown) => {
      console.error('[SaveStatus] Failed to persist save status', error);
    });
  } catch (error) {
    // Status is companion feedback; never let it break a save.
    console.error('[SaveStatus] Failed to persist save status', error);
  }
}

export async function getSaveStatus(): Promise<SaveStatus | null> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return (stored[STORAGE_KEY] as SaveStatus | undefined) ?? null;
  } catch (error) {
    console.error('[SaveStatus] Failed to read save status', error);
    return null;
  }
}

/**
 * Subscribe to save-status changes (e.g. while the popup is open during a
 * capture). Returns an unsubscribe function.
 */
export function onSaveStatusChanged(callback: (status: SaveStatus) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== 'local') return;
    const change = changes[STORAGE_KEY];
    if (change?.newValue) {
      callback(change.newValue as SaveStatus);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
