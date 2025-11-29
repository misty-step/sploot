/**
 * Notifications
 *
 * Shows browser notifications for upload success/errors.
 */

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
      chrome.tabs.create({ url: 'https://sploot.app/app' });
      chrome.notifications.clear(notificationId);
      chrome.notifications.onClicked.removeListener(clickHandler);
    }
  };

  chrome.notifications.onClicked.addListener(clickHandler);
}

/**
 * Show error notification
 */
export function showErrorNotification(errorMessage: string): void {
  const notificationId = `error-${Date.now()}`;

  // Simplify error messages for users
  let userMessage = errorMessage;

  if (errorMessage.includes('Authentication required')) {
    userMessage = 'Please login to sploot.app first';
  } else if (errorMessage.includes('Session expired')) {
    userMessage = 'Session expired. Please login again.';
  } else if (errorMessage.includes('too large')) {
    userMessage = 'Image too large (max 10MB)';
  } else if (errorMessage.includes('timeout')) {
    userMessage = 'Upload timeout. Please try again.';
  } else if (errorMessage.includes('Network error')) {
    userMessage = 'Network error. Check your connection.';
  }

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
