import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlobCircuitBreakerProvider } from '@/contexts/blob-circuit-breaker-context';
import { ImageTile } from '@/components/library/image-tile';
import {
  IMAGE_GRID_BREAKPOINT_COLS,
  IMAGE_GRID_SCROLL_CLASS,
  getMobileFeedDockPaddingClass,
} from '@/components/library/image-grid-layout';
import type { Asset } from '@/lib/types';

vi.mock('next/image', () => ({
  default: ({ alt, src, sizes, className }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} sizes={sizes} className={className} />
  ),
}));

const asset: Asset = {
  id: 'asset-mobile-feed',
  ownerUserId: 'user-1',
  blobUrl: 'https://example.com/meme.jpg',
  thumbnailUrl: 'https://example.com/meme-thumb.jpg',
  pathname: 'meme.jpg',
  filename: 'meme.jpg',
  mime: 'image/jpeg',
  size: 29_000,
  checksumSha256: 'checksum',
  width: 601,
  height: 178,
  favorite: false,
  relevance: 87,
  embeddingStatus: 'processing',
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z',
  deletedAt: null,
  tags: [],
};

describe('mobile meme feed layout contract', () => {
  it('uses a two-up image-first contact sheet on phones while preserving denser larger breakpoints', () => {
    expect(IMAGE_GRID_BREAKPOINT_COLS).toEqual({
      default: 4,
      1280: 4,
      1024: 3,
      768: 2,
      640: 2,
    });
  });

  it('reserves mobile scroll space for the bottom command rail', () => {
    expect(IMAGE_GRID_SCROLL_CLASS).toContain('pb-[calc(6rem+env(safe-area-inset-bottom))]');
    expect(IMAGE_GRID_SCROLL_CLASS).toContain('sm:p-2');
    expect(IMAGE_GRID_SCROLL_CLASS).toContain('md:p-6');
  });

  it('lifts the mobile feed above the retry row only when retry is visible', () => {
    expect(getMobileFeedDockPaddingClass(0)).toBeUndefined();
    expect(getMobileFeedDockPaddingClass(2)).toBe('pb-[calc(9rem+env(safe-area-inset-bottom))]');
  });

  it('keeps mobile tile actions thumb-sized and hides technical metadata', () => {
    render(
      <BlobCircuitBreakerProvider>
        <ImageTile asset={asset} />
      </BlobCircuitBreakerProvider>
    );

    const image = screen.getByAltText('meme.jpg');
    expect(image).toHaveAttribute('sizes', expect.stringContaining('(max-width: 640px) 100vw'));

    // The 44px mobile touch-target contract: rail controls grow to
    // --sploot-touch-target below the sm breakpoint (WCAG target size).
    const favorite = screen.getByRole('button', { name: /mark as banger/i });
    expect(favorite).toHaveClass('sploot-ctl');
    expect(favorite).toHaveClass('max-sm:size-[var(--sploot-touch-target)]');

    const deleteButton = screen.getByRole('button', { name: /delete meme/i });
    expect(deleteButton).toHaveClass('sploot-ctl');
    expect(deleteButton).toHaveClass('max-sm:size-[var(--sploot-touch-target)]');

    expect(screen.queryByRole('button', { name: /more meme actions/i })).not.toBeInTheDocument();

    expect(screen.getByText('601×178 28.3 KB')).toHaveClass('hidden', 'sm:inline');
    expect(screen.getByText('87%')).toHaveClass('hidden', 'sm:inline');
    expect(screen.getByText('processing')).toHaveClass('hidden', 'sm:inline');
  });
});
