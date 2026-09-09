import { assertExtensionConfig, SPLOOT_API_BASE_URL } from './env';

export function getTrustedSplootAppUrl(path = '/app', instanceUrl = SPLOOT_API_BASE_URL): string | undefined {
  assertExtensionConfig();

  try {
    const baseUrl = new URL(instanceUrl);
    const resolved = new URL(path, baseUrl);
    if (
      !['http:', 'https:'].includes(resolved.protocol)
      || resolved.origin !== baseUrl.origin
    ) {
      return undefined;
    }
    return resolved.toString();
  } catch {
    return undefined;
  }
}

export function getSplootAppUrl(path = '/app', instanceUrl = SPLOOT_API_BASE_URL): string {
  const url = getTrustedSplootAppUrl(path, instanceUrl);
  if (!url) {
    throw new Error('URL must use the configured Sploot origin');
  }
  return url;
}

