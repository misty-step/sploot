/**
 * Action badge feedback.
 *
 * A glanceable confirmation on the toolbar icon that complements the OS
 * notification — notifications get suppressed by Do-Not-Disturb or simply
 * missed, but the badge is always visible. It auto-clears so it never lingers.
 */

const BADGE_CLEAR_MS = 3000;

function flashBadge(text: string, color: string): void {
  try {
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeText({ text });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, BADGE_CLEAR_MS);
  } catch (error) {
    // Badge is non-essential feedback; never let it break a save.
    console.error('[Badge] Failed to set action badge', error);
  }
}

// Toybox palette (apps/web/app/globals.css): the badge API needs concrete
// colors, so these are the light-theme --sploot-lime / --sploot-red values.
const SPLOOT_LIME = '#138a50';
const SPLOOT_RED = '#e52347';

export function flashSuccessBadge(): void {
  flashBadge('✓', SPLOOT_LIME);
}

export function flashErrorBadge(): void {
  flashBadge('!', SPLOOT_RED);
}
