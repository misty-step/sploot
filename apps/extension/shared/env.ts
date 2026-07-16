const RAW_PUBLISHABLE_KEY = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '').trim();
const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');
const RAW_SYNC_HOST = (import.meta.env.VITE_CLERK_SYNC_HOST ?? '').trim().replace(/\/$/, '');

const keyEnvironment = RAW_PUBLISHABLE_KEY.startsWith('pk_live_')
  ? 'production'
  : RAW_PUBLISHABLE_KEY.startsWith('pk_test_')
    ? 'development'
    : 'unknown';

const configErrors: string[] = [];

let parsedApiBase: URL | null = null;
let parsedSyncHost: URL | null = null;
if (!RAW_PUBLISHABLE_KEY) {
  configErrors.push('VITE_CLERK_PUBLISHABLE_KEY not configured');
}

if (!RAW_SYNC_HOST) {
  configErrors.push('VITE_CLERK_SYNC_HOST not configured');
} else {
  try {
    parsedSyncHost = new URL(RAW_SYNC_HOST);
    if (!['http:', 'https:'].includes(parsedSyncHost.protocol)) {
      configErrors.push('VITE_CLERK_SYNC_HOST must use http or https');
    }
  } catch {
    configErrors.push(`VITE_CLERK_SYNC_HOST is not a valid URL: ${RAW_SYNC_HOST}`);
  }
}

// Enforce explicit API base; inference was causing silent misroutes.
if (!RAW_API_BASE_URL) {
  configErrors.push(
    'VITE_API_BASE_URL not configured. Set to your API origin (e.g., https://sploot.app or http://localhost:3001).'
  );
} else {
  try {
    parsedApiBase = new URL(RAW_API_BASE_URL);
    if (!['http:', 'https:'].includes(parsedApiBase.protocol)) {
      configErrors.push('VITE_API_BASE_URL must use http or https');
    }
  } catch {
    configErrors.push(`VITE_API_BASE_URL is not a valid URL: ${RAW_API_BASE_URL}`);
  }
}

export const CLERK_PUBLISHABLE_KEY = RAW_PUBLISHABLE_KEY;
/** Only enabled by the real Chromium lifecycle harness; never set in release builds. */
export const E2E_AUTH_MODE = import.meta.env.VITE_E2E_AUTH_MODE === 'true';
export const CLERK_ENVIRONMENT = keyEnvironment === 'production' ? 'production' : 'development';
export const CLERK_SYNC_HOST = parsedSyncHost?.origin ?? '';
export const SPLOOT_API_BASE_URL = parsedApiBase?.origin ?? '';
export const EXTENSION_CONFIG_ERROR = configErrors.length > 0 ? configErrors.join('; ') : null;

export function assertExtensionConfig(): void {
  if (EXTENSION_CONFIG_ERROR) {
    throw new Error(EXTENSION_CONFIG_ERROR);
  }
}
