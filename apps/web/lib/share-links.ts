export type ShareSearchParams = Record<string, string | string[] | undefined>;

export function buildShareRedirectPath(
  assetId: string,
  searchParams: ShareSearchParams = {}
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'undefined') continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
      continue;
    }

    params.append(key, value);
  }

  const query = params.toString();
  return `/m/${encodeURIComponent(assetId)}${query ? `?${query}` : ''}`;
}
