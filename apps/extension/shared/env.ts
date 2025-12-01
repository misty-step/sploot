const RAW_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');

if (!RAW_PUBLISHABLE_KEY) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY not configured');
}

const keyEnvironment = RAW_PUBLISHABLE_KEY.startsWith('pk_live_')
  ? 'production'
  : RAW_PUBLISHABLE_KEY.startsWith('pk_test_')
    ? 'development'
    : 'unknown';

// Enforce explicit API base; inference was causing silent misroutes.
if (!RAW_API_BASE_URL) {
  throw new Error(
    'VITE_API_BASE_URL not configured. Set to your API origin (e.g., https://sploot.app or http://localhost:3001).'
  );
}

let parsedApiBase: URL;
try {
  parsedApiBase = new URL(RAW_API_BASE_URL);
} catch {
  throw new Error(`VITE_API_BASE_URL is not a valid URL: ${RAW_API_BASE_URL}`);
}

if (!['http:', 'https:'].includes(parsedApiBase.protocol)) {
  throw new Error('VITE_API_BASE_URL must use http or https');
}

export const CLERK_PUBLISHABLE_KEY = RAW_PUBLISHABLE_KEY;
export const CLERK_ENVIRONMENT = keyEnvironment === 'production' ? 'production' : 'development';
export const SPLOOT_API_BASE_URL = parsedApiBase.origin;
