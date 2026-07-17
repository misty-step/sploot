/**
 * Derive a stable, non-sensitive IndexedDB partition key from the Clerk
 * account identity. The raw Clerk identifier never enters durable upload
 * records or queue logs.
 */
export async function deriveUploadOwnerKey(clerkUserId: string): Promise<string> {
  if (!clerkUserId) throw new Error('Upload queue requires an authenticated account.');
  if (!globalThis.crypto?.subtle) throw new Error('Secure upload account partitioning is unavailable.');

  const input = new TextEncoder().encode(`sploot-upload-owner:v1:${clerkUserId}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  return `account-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
