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

const inferredApiBaseUrl = keyEnvironment === 'production' ? 'https://sploot.app' : 'http://localhost:3000';
const API_BASE_URL = RAW_API_BASE_URL || inferredApiBaseUrl;

export const CLERK_PUBLISHABLE_KEY = RAW_PUBLISHABLE_KEY;
export const CLERK_ENVIRONMENT = keyEnvironment === 'production' ? 'production' : 'development';
export const SPLOOT_API_BASE_URL = API_BASE_URL;
