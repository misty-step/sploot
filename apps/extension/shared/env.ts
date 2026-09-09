import { DEFAULT_INSTANCE_URL, normalizeInstanceUrl } from './instance-url';
export const CONNECTION_STORAGE_KEY = 'sploot:connection';


let configuredInstanceUrl = DEFAULT_INSTANCE_URL;
let configError: string | null = null;
try {
  configuredInstanceUrl = normalizeInstanceUrl(import.meta.env.VITE_API_BASE_URL || DEFAULT_INSTANCE_URL);
} catch (error) {
  configError = error instanceof Error ? error.message : 'Invalid default instance URL.';
}
export const SPLOOT_API_BASE_URL = configuredInstanceUrl;
export const EXTENSION_CONFIG_ERROR = configError;

export function assertExtensionConfig(): void {
  if (EXTENSION_CONFIG_ERROR) throw new Error(EXTENSION_CONFIG_ERROR);
}

export async function getInstanceUrl(): Promise<string> {
  assertExtensionConfig();
  const stored = await chrome.storage.local.get(CONNECTION_STORAGE_KEY);
  const connection = stored[CONNECTION_STORAGE_KEY];
  const value = connection && typeof connection === 'object' && 'instanceUrl' in connection ? connection.instanceUrl : undefined;
  return typeof value === 'string' ? normalizeInstanceUrl(value) : SPLOOT_API_BASE_URL;
}
