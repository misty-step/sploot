import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ImgHTMLAttributes } from 'react';
import { BlobCircuitBreakerProvider } from '@/contexts/blob-circuit-breaker-context';
import { ImageTile } from '@/components/library/image-tile';
import type { Asset } from '@/lib/types';

type MockImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  sizes?: string;
  unoptimized?: boolean;
};

vi.mock('next/image', () => ({
  default: ({ fill: _fill, sizes: _sizes, unoptimized: _unoptimized, ...props }: MockImageProps) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt ?? ''} />
  ),
}));

const landscapeAsset: Asset = {
  id: 'asset-landscape',
  ownerUserId: 'user-1',
  blobUrl: 'https://example.com/original-landscape.jpg',
  thumbnailUrl: 'https://example.com/cropped-landscape-thumb.jpg',
  pathname: 'landscape.jpg',
  filename: 'landscape.jpg',
  mime: 'image/jpeg',
  size: 42_000,
  checksumSha256: 'checksum-landscape',
  width: 1600,
  height: 900,
  favorite: false,
  createdAt: '2026-06-11T00:00:00.000Z',
  updatedAt: '2026-06-11T00:00:00.000Z',
  deletedAt: null,
  tags: [],
};

describe('uncropped gallery media contract', () => {
  it('falls back to the original when a stored thumbnail has the wrong aspect ratio', () => {
    render(
      <BlobCircuitBreakerProvider>
        <ImageTile asset={landscapeAsset} />
      </BlobCircuitBreakerProvider>
    );

    const image = screen.getByAltText('landscape.jpg');
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 256 },
      naturalHeight: { configurable: true, value: 256 },
    });

    fireEvent.load(image);

    expect(screen.getByAltText('landscape.jpg')).toHaveAttribute(
      'src',
      landscapeAsset.blobUrl
    );
  });

  it('keeps a thumbnail when its natural aspect matches the source', () => {
    render(
      <BlobCircuitBreakerProvider>
        <ImageTile asset={landscapeAsset} />
      </BlobCircuitBreakerProvider>
    );

    const image = screen.getByAltText('landscape.jpg');
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 900 },
    });

    fireEvent.load(image);

    expect(screen.getByAltText('landscape.jpg')).toHaveAttribute(
      'src',
      landscapeAsset.thumbnailUrl
    );
  });

  it('uses the original blob when source dimensions are unavailable', () => {
    const assetWithoutDimensions = { ...landscapeAsset, width: null, height: null };

    render(
      <BlobCircuitBreakerProvider>
        <ImageTile asset={assetWithoutDimensions} />
      </BlobCircuitBreakerProvider>
    );

    expect(screen.getByAltText('landscape.jpg')).toHaveAttribute(
      'src',
      assetWithoutDimensions.blobUrl
    );
  });
});
