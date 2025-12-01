// Centralized navigation targets for auth flows.
// Hides chrome-extension URL quirks and keeps Clerk routing in one place.

const extensionId = chrome.runtime.id;
const popupPath = 'popup.html';

const popupUrl = `chrome-extension://${extensionId}/${popupPath}`;

export const authNavigation = {
  popupPath,
  popupUrl,
  afterSignInUrl: popupUrl,
  afterSignUpUrl: popupUrl,
  redirectUrl: popupUrl,
} as const;
