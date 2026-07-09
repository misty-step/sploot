import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlobCircuitBreakerProvider } from '@/contexts/blob-circuit-breaker-context';
import { ImageTile } from '@/components/library/image-tile';
import type { Asset } from '@/lib/types';

vi.mock('next/image', () => ({
  default: ({ alt, src, className }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} className={className} />
  ),
}));

const baseAsset: Asset = {
  id: 'asset-animated',
  blobUrl: 'https://example.com/original.jpg',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  pathname: 'original.jpg',
  filename: 'original.jpg',
  mime: 'image/jpeg',
  size: 42_000,
  width: 640,
  height: 480,
  favorite: false,
  createdAt: '2026-06-11T00:00:00.000Z',
  updatedAt: '2026-06-11T00:00:00.000Z',
  tags: [],
};

function renderTile(asset: Asset) {
  return render(
    <BlobCircuitBreakerProvider>
      <ImageTile asset={asset} />
    </BlobCircuitBreakerProvider>
  );
}

describe('animated media tile rendering', () => {
  it('renders animated gifs from the original blob instead of the static thumbnail', () => {
    renderTile({
      ...baseAsset,
      blobUrl: 'https://example.com/reaction.gif',
      thumbnailUrl: 'https://example.com/reaction-thumb.jpg',
      filename: 'reaction.gif',
      pathname: 'reaction.gif',
      mime: 'image/gif',
    });

    expect(screen.getByAltText('reaction.gif')).toHaveAttribute(
      'src',
      'https://example.com/reaction.gif'
    );
  });

  it('omits legacy cropped posters for non-square videos so the first frame can render uncropped', () => {
    renderTile({
      ...baseAsset,
      blobUrl: 'https://example.com/reaction.mp4',
      thumbnailUrl: 'https://example.com/reaction-poster.jpg',
      filename: 'reaction.mp4',
      pathname: 'reaction.mp4',
      mime: 'video/mp4',
    });

    const video = screen.getByLabelText('play reaction.mp4');
    expect(video.tagName).toBe('VIDEO');
    expect(video).not.toHaveAttribute('poster');
    expect(video.querySelector('source')).toHaveAttribute('src', 'https://example.com/reaction.mp4');
    expect(video.querySelector('source')).toHaveAttribute('type', 'video/mp4');
  });

  it('uses an aspect-safe v2 poster for non-square videos', () => {
    renderTile({
      ...baseAsset,
      blobUrl: 'https://example.com/reaction.mp4',
      thumbnailUrl: 'https://example.com/reaction-preview-v2.jpg',
      filename: 'reaction.mp4',
      pathname: 'reaction.mp4',
      mime: 'video/mp4',
    });

    expect(screen.getByLabelText('play reaction.mp4')).toHaveAttribute(
      'poster',
      'https://example.com/reaction-preview-v2.jpg'
    );
  });
});
