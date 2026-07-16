import { describe, expect, it } from 'vitest';
import { inventoryLogicalKey, manifestSha256, renditionMime } from '../../scripts/storage-portability';

describe('storage portability CLI contracts', () => {
  it('maps legacy keys deterministically without mutating source identity', () => {
    const first = inventoryLogicalKey('asset-1', 'photos/été image.jpg', 'original');
    expect(first).toMatch(/^legacy\/asset-1\/original-[a-f0-9]{24}$/);
    expect(inventoryLogicalKey('asset-1', 'photos/été image.jpg', 'original')).toBe(first);
    expect(inventoryLogicalKey('asset-1', 'photos/été image.jpg', 'thumbnail')).not.toBe(first);
    expect(inventoryLogicalKey('asset-1', 'photos/valid.jpg', 'original')).toBe('photos/valid.jpg');
  });

  it('derives thumbnail MIME from bytes before source fallback', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    expect(renditionMime('thumb.jpg', jpeg, 'video/mp4', 'video/mp4')).toBe('image/jpeg');
    expect(renditionMime('thumb.webp', Buffer.from('RIFFxxxxWEBP'), undefined)).toBe('image/webp');
  });

  it('binds manifest digest to exact serialized entries', () => {
    const entries = [{ logicalKey: 'a', sourceKey: 'b', size: 1, sha256: '0'.repeat(64) }, { logicalKey: 'c', sourceKey: 'd', size: 2, sha256: '1'.repeat(64) }];
    expect(manifestSha256(entries)).toMatch(/^[a-f0-9]{64}$/);
    expect(manifestSha256([...entries].reverse())).not.toBe(manifestSha256(entries));
  });
});
