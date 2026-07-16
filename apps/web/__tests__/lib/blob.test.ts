import { describe, expect, it } from 'vitest';
import { generateUniqueFilename } from '@/lib/blob';

describe('generateUniqueFilename', () => {
  it('derives safe extensions from validated MIME instead of user names', () => {
    expect(generateUniqueFilename('user', 'photo.🔥', 'image/jpeg')).toMatch(/^user\/\d+-[a-z0-9]+\.jpg$/);
    expect(generateUniqueFilename('user', 'photo', 'image/png')).toMatch(/\.png$/);
    expect(generateUniqueFilename('user', 'photo.exe', 'image/webp')).toMatch(/\.webp$/);
  });
});
