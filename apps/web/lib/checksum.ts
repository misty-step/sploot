/**
 * Client-side checksum calculation utilities
 */

/**
 * Calculate SHA-256 checksum of a File or Blob
 * @param file - The file or blob to calculate checksum for
 * @returns The hex-encoded SHA-256 hash
 */
export async function calculateSHA256(file: File | Blob): Promise<string> {
  // Read file as ArrayBuffer
  const buffer = await file.arrayBuffer();

  // Calculate SHA-256 hash using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);

  // Convert hash to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Check if a file is a duplicate before uploading
 * @param file - The file to check
 * @returns Object with exists flag and asset data if duplicate
 */
export async function checkDuplicate(file: File): Promise<{
  exists: boolean;
  asset?: {
    id: string;
    blobUrl: string;
    thumbnailUrl?: string;
    pathname: string;
    mime: string;
    size: number;
    checksumSha256: string;
    hasEmbedding: boolean;
    createdAt: Date;
  };
}> {
  try {
    // Calculate checksum
    const checksum = await calculateSHA256(file);

    // Call preflight check API
    const response = await fetch('/api/upload/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        checksum,
        mime: file.type,
        size: file.size,
      }),
    });

    if (!response.ok) {
      console.error('Preflight check failed:', response.status);
      // On error, assume not duplicate and proceed with upload
      return { exists: false };
    }

    const data = await response.json();
    return {
      exists: data.exists,
      asset: data.asset,
    };
  } catch (error) {
    console.error('Error checking for duplicate:', error);
    // On error, assume not duplicate and proceed with upload
    return { exists: false };
  }
}

/**
 * Calculate checksum with progress callback
 * Useful for large files to show progress
 */
export async function calculateSHA256WithProgress(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const chunkSize = 1024 * 1024; // 1MB chunks
  const chunks = Math.ceil(file.size / chunkSize);
  let currentChunk = 0;

  // Process file in chunks to allow progress updates
  const hashChunks: ArrayBuffer[] = [];

  for (let start = 0; start < file.size; start += chunkSize) {
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    const buffer = await chunk.arrayBuffer();
    hashChunks.push(buffer);

    currentChunk++;
    if (onProgress) {
      onProgress((currentChunk / chunks) * 100);
    }
  }

  // Combine chunks and calculate hash
  const totalSize = hashChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
  const combined = new Uint8Array(totalSize);
  let offset = 0;

  for (const chunk of hashChunks) {
    combined.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}