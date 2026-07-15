import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlobCircuitBreakerProvider } from '@/contexts/blob-circuit-breaker-context';
import { ImageTile } from '@/components/library/image-tile';
import type { Asset } from '@/lib/types';

vi.mock('next/image', () => ({
  default: ({ alt, src, ...props }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={alt} src={src} />
  ),
}));

const asset: Asset = {
  id: 'a11y-tile',
  ownerUserId: 'user-1',
  blobUrl: 'https://example.com/meme.jpg',
  thumbnailUrl: 'https://example.com/meme-thumb.jpg',
  pathname: 'meme.jpg',
  filename: 'meme.jpg',
  mime: 'image/jpeg',
  size: 1024,
  width: 640,
  height: 480,
  favorite: false,
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
  deletedAt: null,
  tags: [],
};

describe('ImageTile interaction semantics', () => {
  it('uses a sibling open button instead of nesting action buttons in a button role', () => {
    render(
      <BlobCircuitBreakerProvider>
        <ImageTile asset={asset} />
      </BlobCircuitBreakerProvider>
    );

    expect(screen.queryByRole('button', { name: /open meme\.jpg/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark as banger/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /share meme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete meme/i })).toBeInTheDocument();
    expect(screen.getByRole('article')).not.toHaveAttribute('role', 'button');
  });

  it('activates the accessible open button with the supplied selection callback', () => {
    const onSelect = vi.fn();
    render(
      <BlobCircuitBreakerProvider>
        <ImageTile asset={asset} onSelect={onSelect} />
      </BlobCircuitBreakerProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /open meme\.jpg/i }));
    expect(onSelect).toHaveBeenCalledWith(asset);
  });
});
