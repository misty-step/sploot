/**
 * Auth Client
 *
 * Client-side interface for auth operations.
 * Communicates with background service worker's auth-manager.
 */

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({ type: 'IS_AUTHENTICATED' });
  if (response.error) {
    console.error('[AuthClient] isAuthenticated error:', response.error);
    return false;
  }
  return response.authenticated;
}

/**
 * Get current auth token
 */
export async function getAuthToken(): Promise<string | null> {
  const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN' });
  if (response.error) {
    console.error('[AuthClient] getAuthToken error:', response.error);
    return null;
  }
  return response.token;
}

/**
 * Get current user ID
 */
export async function getUserId(): Promise<string | null> {
  const response = await chrome.runtime.sendMessage({ type: 'GET_USER_ID' });
  if (response.error) {
    console.error('[AuthClient] getUserId error:', response.error);
    return null;
  }
  return response.userId;
}

/**
 * Logout current user
 */
export async function logout(): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: 'LOGOUT' });
  if (response.error) {
    throw new Error(response.error);
  }
}
