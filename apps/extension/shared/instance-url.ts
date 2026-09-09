export const DEFAULT_INSTANCE_URL = 'http://127.0.0.1:3001';

/** Credentials may only travel over HTTPS, except to the local machine. */
export function normalizeInstanceUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a complete instance URL, such as http://127.0.0.1:3001.');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Use HTTPS for a remote instance. HTTP is allowed only on localhost.');
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Enter only the instance origin, without a path, password, query, or fragment.');
  }
  return url.origin;
}
