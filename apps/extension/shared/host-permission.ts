/** Normalize an environment-provided host into a safe HTTP(S) match pattern. */
export function normalizeHttpHostPermission(rawHost: string, label: string): string {
  const normalized = rawHost.trim().replace(/\/+$/, '')
  let url: URL

  try {
    url = new URL(normalized)
  } catch {
    throw new Error(`${label} must be a valid HTTP(S) origin`)
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must use http or https`)
  }

  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${label} must be an origin without credentials, path, query, or hash`)
  }

  return `${url.origin}/*`
}
