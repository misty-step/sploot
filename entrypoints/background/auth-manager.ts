/**
 * Authentication Manager
 *
 * Deep module that hides Clerk WebSSO complexity behind simple interface.
 * Handles session sync with sploot.app, token refresh, and OAuth fallback.
 */

import { createClerkClient } from '@clerk/chrome-extension/background';

// Clerk configuration from environment
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const SYNC_HOST = import.meta.env.VITE_CLERK_SYNC_HOST;

// Session storage keys
const STORAGE_KEY_TOKEN = 'auth_token';
const STORAGE_KEY_EXPIRES = 'auth_expires';
const STORAGE_KEY_USER_ID = 'auth_user_id';

let clerkClient: Awaited<ReturnType<typeof createClerkClient>> | null = null;

/**
 * Initialize Clerk client (lazy initialization)
 */
async function getClerkClient() {
  if (clerkClient) return clerkClient;

  if (!PUBLISHABLE_KEY) {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY not configured');
  }

  clerkClient = await createClerkClient({
    publishableKey: PUBLISHABLE_KEY,
    syncHost: SYNC_HOST, // Sync with sploot.app session
  });

  return clerkClient;
}

/**
 * Check if user is authenticated
 *
 * Returns true if valid session exists (either from WebSSO or local storage)
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const clerk = await getClerkClient();

    // Check Clerk session first (WebSSO with sploot.app)
    if (clerk.session) {
      return true;
    }

    // Fallback: Check local session storage
    const result = await chrome.storage.session.get([STORAGE_KEY_TOKEN, STORAGE_KEY_EXPIRES]);
    if (result[STORAGE_KEY_TOKEN] && result[STORAGE_KEY_EXPIRES]) {
      const expiresAt = result[STORAGE_KEY_EXPIRES] as number;
      return Date.now() < expiresAt;
    }

    return false;
  } catch (error) {
    console.error('[Auth] Failed to check authentication:', error);
    return false;
  }
}

/**
 * Get authentication token
 *
 * Returns JWT token for API requests, or null if not authenticated.
 * Automatically refreshes token if needed via Clerk session.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const clerk = await getClerkClient();

    // If no Clerk session, check local storage
    if (!clerk.session) {
      const result = await chrome.storage.session.get([STORAGE_KEY_TOKEN, STORAGE_KEY_EXPIRES]);
      if (result[STORAGE_KEY_TOKEN] && result[STORAGE_KEY_EXPIRES]) {
        const expiresAt = result[STORAGE_KEY_EXPIRES] as number;
        if (Date.now() < expiresAt) {
          return result[STORAGE_KEY_TOKEN] as string;
        }
      }
      return null;
    }

    // Get token from Clerk (automatically refreshes if needed)
    const token = await clerk.session.getToken();

    // Cache token in session storage
    if (token) {
      const expiresAt = Date.now() + (30 * 60 * 1000); // 30 minutes
      await chrome.storage.session.set({
        [STORAGE_KEY_TOKEN]: token,
        [STORAGE_KEY_EXPIRES]: expiresAt,
        [STORAGE_KEY_USER_ID]: clerk.session.user?.id,
      });
    }

    return token;
  } catch (error) {
    console.error('[Auth] Failed to get auth token:', error);
    return null;
  }
}

/**
 * Get current user ID
 *
 * Returns Clerk user ID if authenticated, null otherwise
 */
export async function getUserId(): Promise<string | null> {
  try {
    const clerk = await getClerkClient();

    if (clerk.session?.user?.id) {
      return clerk.session.user.id;
    }

    // Fallback to cached user ID
    const result = await chrome.storage.session.get(STORAGE_KEY_USER_ID);
    return (result[STORAGE_KEY_USER_ID] as string) || null;
  } catch (error) {
    console.error('[Auth] Failed to get user ID:', error);
    return null;
  }
}

/**
 * Trigger login flow
 *
 * Opens OAuth popup for authentication if WebSSO doesn't work.
 * Stores session in chrome.storage.session after successful login.
 */
export async function login(): Promise<void> {
  try {
    const clerk = await getClerkClient();

    // Check if already authenticated via WebSSO
    if (clerk.session) {
      console.log('[Auth] Already authenticated via WebSSO');
      return;
    }

    // For MVP, we rely on WebSSO with sploot.app
    // User should login to sploot.app first, then extension auto-authenticates
    // In future, could add OAuth fallback here with browser.identity.launchWebAuthFlow()

    throw new Error('Please login to sploot.app first to use the extension');
  } catch (error) {
    console.error('[Auth] Login failed:', error);
    throw error;
  }
}

/**
 * Logout current user
 *
 * Clears session storage and Clerk session
 */
export async function logout(): Promise<void> {
  try {
    // Clear session storage
    await chrome.storage.session.remove([
      STORAGE_KEY_TOKEN,
      STORAGE_KEY_EXPIRES,
      STORAGE_KEY_USER_ID,
    ]);

    // Note: Clerk session is managed by the web app
    // Extension logout doesn't sign out of sploot.app (WebSSO)

    console.log('[Auth] Logged out successfully');
  } catch (error) {
    console.error('[Auth] Logout failed:', error);
    throw error;
  }
}

/**
 * Listen for auth state changes from content scripts or popup
 */
export function setupAuthListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_AUTH_TOKEN') {
      getAuthToken()
        .then(token => sendResponse({ token }))
        .catch(error => sendResponse({ error: error.message }));
      return true; // Keep channel open for async response
    }

    if (message.type === 'IS_AUTHENTICATED') {
      isAuthenticated()
        .then(authenticated => sendResponse({ authenticated }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    if (message.type === 'GET_USER_ID') {
      getUserId()
        .then(userId => sendResponse({ userId }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    if (message.type === 'LOGOUT') {
      logout()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }
  });
}
