import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageTile } from '@/components/library/image-tile';
import { BlobCircuitBreakerProvider } from '@/contexts/blob-circuit-breaker-context';
import type { Asset } from '@/lib/types';

vi.mock('next/image', () => ({
  default: ({ alt, src, className }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} className={className} />
  ),
}));

const portraitBanger = {
  id: 'portrait-banger',
  ownerUserId: 'user-1',
  blobUrl: 'https://example.com/portrait.jpg',
  thumbnailUrl: 'https://example.com/portrait-thumb.jpg',
  pathname: 'portrait.jpg',
  filename: 'portrait.jpg',
  mime: 'image/jpeg',
  size: 42_000,
  checksumSha256: 'checksum',
  width: 720,
  height: 1280,
  favorite: true,
  similarity: 0.91,
  embeddingStatus: 'ready',
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
  deletedAt: null,
  tags: [],
} satisfies Asset & { similarity: number };

function renderTile() {
  return render(
    <BlobCircuitBreakerProvider>
      <ImageTile asset={portraitBanger} showSimilarityScore />
    </BlobCircuitBreakerProvider>
  );
}

describe('meme tile presentation contract', () => {
  it('shows the whole non-square meme without cropping it', () => {
    renderTile();

    const media = screen.getByRole('group', { name: /meme media/i });
    const image = within(media).getByRole('img', { name: 'portrait.jpg' });

    expect(media).toHaveStyle({ aspectRatio: '720 / 1280' });
    expect(image).toHaveClass('object-contain');
    expect(image).not.toHaveClass('object-cover');
  });

  it('keeps banger and search-confidence metadata outside the artwork', () => {
    renderTile();

    const media = screen.getByRole('group', { name: /meme media/i });
    const metadata = screen.getByRole('group', { name: /meme metadata/i });

    expect(within(media).queryByText(/banger/i)).not.toBeInTheDocument();
    expect(within(media).queryByText('91%')).not.toBeInTheDocument();
    expect(within(metadata).getByText(/banger/i)).toBeVisible();
    expect(within(metadata).getByText('91%')).toBeVisible();
  });

  it('renders tile actions as compact controls without the heavy action-button treatment', () => {
    renderTile();

    const tile = screen.getByRole('article');
    const openControl = screen.getByRole('button', { name: /open portrait\.jpg/i });

    for (const control of [
      screen.getByRole('button', { name: /remove banger/i }),
      screen.getByRole('button', { name: /share/i }),
      screen.getByRole('button', { name: /delete meme/i }),
    ]) {
      expect(control).toHaveAttribute('data-variant', 'compact');
      expect(control).not.toHaveClass('sploot-press', 'sploot-shadow-sm');
      expect(openControl).not.toContainElement(control);
    }

    expect(tile).toContainElement(openControl);
  });
});
