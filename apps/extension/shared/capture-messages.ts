import { setSaveStatus } from './save-status';

export const CAPTURE_MESSAGES = {
  VISIBLE_TAB: 'CAPTURE_VISIBLE_TAB',
} as const;

export interface CaptureVisibleTabMessage {
  type: typeof CAPTURE_MESSAGES.VISIBLE_TAB;
}

/** Send the popup's user gesture to the background worker before the popup closes. */
export async function requestVisibleTabCapture(): Promise<unknown> {
  try {
    return await chrome.runtime.sendMessage({ type: CAPTURE_MESSAGES.VISIBLE_TAB });
  } catch (error) {
    setSaveStatus({
      state: 'error',
      message: 'Could not start screenshot. Try again.',
      at: Date.now(),
    });
    throw error;
  }
}
