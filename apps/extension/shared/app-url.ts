import { assertExtensionConfig, SPLOOT_API_BASE_URL } from './env';

export function getSplootAppUrl(path = '/app'): string {
  assertExtensionConfig();
  return new URL(path, SPLOOT_API_BASE_URL).toString();
}
