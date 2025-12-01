import { SPLOOT_API_BASE_URL } from './env';

const HEALTH_PATH = '/api/health';
const HEALTH_TIMEOUT_MS = 3_000;

/**
 * Check if the API is reachable. Returns true/false; logs details on failure.
 * Used at startup to prevent broken context menu actions.
 */
export async function checkApiHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const res = await fetch(`${SPLOOT_API_BASE_URL}${HEALTH_PATH}`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.error('[Health] API health check failed', {
        status: res.status,
        url: `${SPLOOT_API_BASE_URL}${HEALTH_PATH}`,
      });
      return false;
    }
    return true;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[Health] API health check error', {
      message: error instanceof Error ? error.message : String(error),
      url: `${SPLOOT_API_BASE_URL}${HEALTH_PATH}`,
    });
    return false;
  }
}
