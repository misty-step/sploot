import { assertExtensionConfig, SPLOOT_API_BASE_URL } from './env';

export function getTrustedSplootAppUrl(path = '/app'): string | undefined {
  assertExtensionConfig();

  try {
    const baseUrl = new URL(SPLOOT_API_BASE_URL);
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

export function getSplootAppUrl(path = '/app'): string {
  const url = getTrustedSplootAppUrl(path);
  if (!url) {
    throw new Error('URL must use the configured Sploot origin');
  }
  return url;
}

export function getSplootSignInUrl(): string {
  return getSplootAppUrl('/sign-in');
}

export function getSplootEnrollmentUrl(): string {
  return getSplootAppUrl('/api/health/enrollment');
}
