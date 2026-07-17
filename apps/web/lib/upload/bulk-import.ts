import { unzipSync } from 'fflate';

export const MAX_ZIP_COMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 100;
export const MAX_ZIP_ENTRY_BYTES = 10 * 1024 * 1024;
export const MAX_ZIP_EXPANDED_BYTES = 64 * 1024 * 1024;
export const MAX_ZIP_COMPRESSION_RATIO = 100;
export const MAX_TEXT_BUNDLE_BYTES = 5 * 1024 * 1024;
export const MAX_BOOKMARK_URLS = 100;

export class BulkImportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BulkImportLimitError';
  }
}

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

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function preflightZip(bytes: Uint8Array): void {
  const start = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (readU32(bytes, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new BulkImportLimitError('ZIP directory is missing or unsupported.');
  const entries = readU16(bytes, eocd + 10);
  const directorySize = readU32(bytes, eocd + 12);
  const directoryOffset = readU32(bytes, eocd + 16);
  if (entries > MAX_ZIP_ENTRIES || directoryOffset + directorySize > bytes.length) {
    throw new BulkImportLimitError(`ZIP exceeds the ${MAX_ZIP_ENTRIES}-entry safety bound.`);
  }
  let offset = directoryOffset;
  let expanded = 0;
  for (let index = 0; index < entries; index += 1) {
    if (readU32(bytes, offset) !== 0x02014b50) throw new BulkImportLimitError('ZIP directory entry is invalid.');
    const compressed = readU32(bytes, offset + 20);
    const uncompressed = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    if (uncompressed > MAX_ZIP_ENTRY_BYTES || (compressed === 0 && uncompressed > 0) || (compressed > 0 && uncompressed / compressed > MAX_ZIP_COMPRESSION_RATIO)) {
      throw new BulkImportLimitError('ZIP entry exceeds the expansion safety bound.');
    }
    expanded += uncompressed;
    if (expanded > MAX_ZIP_EXPANDED_BYTES) throw new BulkImportLimitError('ZIP expansion exceeds the memory safety bound.');
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

export async function extractZipImages(zip: File): Promise<File[]> {
  if (zip.size > MAX_ZIP_COMPRESSED_BYTES) throw new BulkImportLimitError('ZIP compressed size exceeds the safety bound.');
  const bytes = new Uint8Array(await zip.arrayBuffer());
  preflightZip(bytes);
  const entries = unzipSync(bytes);
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

export function extractImageUrls(text: string, maxUrls = MAX_BOOKMARK_URLS): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  if (matches.length > maxUrls * 4) throw new BulkImportLimitError(`Bookmark export exceeds the ${maxUrls}-URL safety bound.`);
  const urls = new Set<string>();
  for (const match of matches) {
    if (isImageUrl(match)) {
      urls.add(normalizeImageUrl(match));
      if (urls.size > maxUrls) throw new BulkImportLimitError(`Bookmark export exceeds the ${maxUrls}-URL safety bound.`);
    }
  }
  return [...urls];
}
