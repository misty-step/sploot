/**
 * Save feedback — the OS notification plus the action badge.
 *
 * `showSuccessNotification` / `showErrorNotification` are the single feedback
 * points every save flow (right-click, screenshot) calls. They fire a Chrome
 * notification AND flash the toolbar badge, so an outcome is visible even when
 * notifications are suppressed.
 */

import { getSplootAppUrl } from '../../shared/app-url';
import { setSaveStatus } from '../../shared/save-status';
import { flashErrorBadge, flashSuccessBadge } from './badge';

export interface ErrorNotificationInput {
  message: string;
  actionHref?: string;
}

const SUCCESS_DISMISS_MS = 5000;
const ERROR_DISMISS_MS = 10000;
const ACTIONS_STORAGE_KEY = 'sploot:notification-actions';
const MAX_PERSISTED_ACTIONS = 32;

interface NotificationAction {
  notificationId: string;
  url: string;
}

// Maps a live notification id to the URL its click should open. A single
// onClicked listener (registered once via setupNotificationFeedback) reads this
// — replacing the previous per-notification addListener, which leaked a listener
// on every notification that auto-dismissed without ever being clicked.
const notificationActions = new Map<string, string>();
let actionWriteQueue = Promise.resolve();
let clickListenerRegistered = false;

async function loadPersistedActions(): Promise<NotificationAction[]> {
  const result = await chrome.storage.local.get(ACTIONS_STORAGE_KEY);
  const actions = result[ACTIONS_STORAGE_KEY];
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions.filter(
    (action): action is NotificationAction =>
      Boolean(action) && typeof action.notificationId === 'string' && typeof action.url === 'string'
  );
}

function enqueueActionWrite(write: () => Promise<void>): Promise<void> {
  actionWriteQueue = actionWriteQueue.then(write, write);
  return actionWriteQueue;
}

function rememberAction(notificationId: string, url: string): void {
  notificationActions.set(notificationId, url);
  while (notificationActions.size > MAX_PERSISTED_ACTIONS) {
    const oldest = notificationActions.keys().next().value;
    if (oldest) {
      notificationActions.delete(oldest);
    }
  }

  void enqueueActionWrite(async () => {
    const actions = (await loadPersistedActions()).filter(action => action.notificationId !== notificationId);
    actions.push({ notificationId, url });
    await chrome.storage.local.set({
      [ACTIONS_STORAGE_KEY]: actions.slice(-MAX_PERSISTED_ACTIONS),
    });
  });
}

async function forgetAction(notificationId: string): Promise<void> {
  notificationActions.delete(notificationId);
  await enqueueActionWrite(async () => {
    const actions = (await loadPersistedActions()).filter(action => action.notificationId !== notificationId);
    await chrome.storage.local.set({ [ACTIONS_STORAGE_KEY]: actions });
  });
}

/**
 * Register the one notifications click handler. Call once at worker startup.
 */
export function setupNotificationFeedback(): void {
  if (clickListenerRegistered) {
    return;
  }

  clickListenerRegistered = true;
  chrome.notifications.onClicked.addListener((notificationId) => {
    void (async () => {
      const url = notificationActions.get(notificationId)
        ?? (await loadPersistedActions()).find(action => action.notificationId === notificationId)?.url;
      if (url) {
        chrome.tabs.create({ url });
      }
      await dismiss(notificationId);
    })();
  });
}

async function dismiss(notificationId: string): Promise<void> {
  await forgetAction(notificationId);
  chrome.notifications.clear(notificationId);
}

/**
 * Show success feedback (notification + badge).
 *
 * Note: Chrome MV3 doesn't support remote URLs for notification icons, so the
 * local extension icon is always used.
 */
export function showSuccessNotification(
  filename: string,
  _thumbnailUrl?: string, // Kept for API compatibility but unused
  options?: { isDuplicate?: boolean }
): void {
  const notificationId = `success-${crypto.randomUUID()}`;

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon-128.png'), // Always use local icon
    title: options?.isDuplicate ? 'Already in Sploot' : 'Saved to Sploot',
    message: filename,
    priority: 1,
    isClickable: true,
  });

  rememberAction(notificationId, getSplootAppUrl());
  flashSuccessBadge();
  // Persistent trace for the popup — survives DND-suppressed notifications.
  setSaveStatus({
    state: 'success',
    filename,
    isDuplicate: options?.isDuplicate ?? false,
    at: Date.now(),
  });

  setTimeout(() => dismiss(notificationId), SUCCESS_DISMISS_MS);
}

/**
 * Convert internal upload/auth/network errors into short user-facing copy.
 */
export function toErrorNotificationMessage(errorMessage: string): string {
  if (errorMessage.includes('Storage quota exceeded')) {
    return 'Storage quota exceeded. Open Sploot settings.';
  }
  if (errorMessage.includes('Uploads are temporarily paused')) {
    return 'Uploads are paused. Please try again later.';
  }
  if (errorMessage.includes('Authentication required')) {
    return 'Please login to sploot.app first';
  }
  if (errorMessage.includes('Session expired')) {
    return 'Session expired. Please login again.';
  }
  if (errorMessage.includes('too large')) {
    return 'Image too large after compression.';
  }
  if (errorMessage.includes('timeout')) {
    return 'Upload timeout. Please try again.';
  }
  if (errorMessage.includes('Network error')) {
    return 'Network error. Check your connection.';
  }

  return errorMessage;
}

/**
 * Show error feedback (notification + badge).
 */
export function showErrorNotification(error: string | ErrorNotificationInput): void {
  const notificationId = `error-${crypto.randomUUID()}`;
  const errorMessage = typeof error === 'string' ? error : error.message;
  const userMessage = toErrorNotificationMessage(errorMessage);
  const actionHref = typeof error === 'string' ? undefined : error.actionHref;
  const actionUrl = actionHref ? getSplootAppUrl(actionHref) : undefined;

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon-128.png'),
    title: 'Save Failed',
    message: userMessage,
    priority: 2,
    isClickable: Boolean(actionUrl),
  });

  if (actionUrl) {
    rememberAction(notificationId, actionUrl);
  }
  flashErrorBadge();
  setSaveStatus({ state: 'error', message: userMessage, at: Date.now() });

  setTimeout(() => dismiss(notificationId), ERROR_DISMISS_MS);
}
