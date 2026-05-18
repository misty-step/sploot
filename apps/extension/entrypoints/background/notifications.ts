/**
 * Notifications
 *
 * Shows browser notifications for upload success/errors.
 */

import { getSplootAppUrl } from '../../shared/app-url';

/**
 * Show success notification
 *
 * Note: Chrome MV3 doesn't support remote URLs for notification icons.
 * Always use local extension icon.
 */
export function showSuccessNotification(
  filename: string,
  _thumbnailUrl?: string // Kept for API compatibility but unused
): void {
  const notificationId = `success-${Date.now()}`;

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon-128.png'), // Always use local icon
    title: 'Saved to Sploot',
    message: filename,
    priority: 1,
    isClickable: true,
  });

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    chrome.notifications.clear(notificationId);
  }, 5000);

  // Handle notification click - open library
  const clickHandler = (clickedId: string) => {
    if (clickedId === notificationId) {
      chrome.tabs.create({ url: getSplootAppUrl() });
      chrome.notifications.clear(notificationId);
      chrome.notifications.onClicked.removeListener(clickHandler);
    }
  };

  chrome.notifications.onClicked.addListener(clickHandler);
}

/**
 * Convert internal upload/auth/network errors into short user-facing copy.
 */
export function toErrorNotificationMessage(errorMessage: string): string {
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
 * Show error notification
 */
export function showErrorNotification(errorMessage: string): void {
  const notificationId = `error-${Date.now()}`;
  const userMessage = toErrorNotificationMessage(errorMessage);

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon-128.png'),
    title: 'Save Failed',
    message: userMessage,
    priority: 2,
    isClickable: false,
  });

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    chrome.notifications.clear(notificationId);
  }, 10000);
}
