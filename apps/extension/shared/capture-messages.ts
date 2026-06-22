export const CAPTURE_MESSAGES = {
  VISIBLE_TAB: 'CAPTURE_VISIBLE_TAB',
} as const;

export interface CaptureVisibleTabMessage {
  type: typeof CAPTURE_MESSAGES.VISIBLE_TAB;
}
