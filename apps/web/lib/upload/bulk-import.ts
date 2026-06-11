import { unzipSync } from 'fflate';

/**
 * Client-side bundle expansion for bulk import.
 *
 * A "bundle" is a non-image file the upload zone knows how to unpack:
 * - .zip → image entries become Files and ride the normal upload pipeline
 *   (progress, dedupe, persistence come for free).
 * - .json / .csv / .txt (e.g. Twitter/X bookmark exports per ADR 0003) →
 *   image URLs are extracted and imported through /api/upload/url.
 */

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

const TEXT_BUNDLE_EXTENSIONS = ['json', 'csv', 'txt'];

function extension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function isZipFile(file: File): boolean {
  return extension(file.name) === 'zip' || file.type === 'application/zip';
}

export function isTextBundleFile(file: File): boolean {
  return TEXT_BUNDLE_EXTENSIONS.includes(extension(file.name));
}

export function isBundleFile(file: File): boolean {
  return isZipFile(file) || isTextBundleFile(file);
}

export async function extractZipImages(zip: File): Promise<File[]> {
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  const files: File[] = [];

  for (const [path, bytes] of Object.entries(entries)) {
    const basename = path.split('/').pop() ?? '';
    // Skip directories, hidden files, and macOS resource-fork noise.
    if (!basename || basename.startsWith('.') || path.startsWith('__MACOSX/')) {
      continue;
    }
    const mime = IMAGE_EXTENSIONS[extension(basename)];
    if (!mime || bytes.length === 0) {
      continue;
    }
    files.push(new File([new Uint8Array(bytes)], basename, { type: mime }));
  }

  return files;
}

const URL_PATTERN = /https?:\/\/[^\s"'<>\\,)\]}]+/g;

function isImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'pbs.twimg.com' && parsed.pathname.startsWith('/media/')) {
      return true;
    }
    return extension(parsed.pathname) in IMAGE_EXTENSIONS;
  } catch {
    return false;
  }
}

/** Twitter media URLs default to downscaled variants; ask for the original. */
function normalizeImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'pbs.twimg.com' && parsed.searchParams.has('name')) {
      parsed.searchParams.set('name', 'orig');
      return parsed.toString();
    }
  } catch {
    // keep as-is
  }
  return url;
}

export function extractImageUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  const urls = new Set<string>();
  for (const match of matches) {
    if (isImageUrl(match)) {
      urls.add(normalizeImageUrl(match));
    }
  }
  return [...urls];
}
