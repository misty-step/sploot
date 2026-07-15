export const CAPTURE_MESSAGES = {
  VISIBLE_TAB: 'CAPTURE_VISIBLE_TAB',
} as const;

export interface CaptureVisibleTabMessage {
  type: typeof CAPTURE_MESSAGES.VISIBLE_TAB;
}

/** Send the popup's user gesture to the background worker before the popup closes. */
export function requestVisibleTabCapture(): Promise<unknown> {
  return chrome.runtime.sendMessage({ type: CAPTURE_MESSAGES.VISIBLE_TAB });
}
