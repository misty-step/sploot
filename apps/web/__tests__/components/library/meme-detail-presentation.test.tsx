import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/lib/types';

vi.mock('next/image', () => ({
  default: ({ alt, src, className }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} className={className} />
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/components/library/image-grid', () => ({
  ImageGrid: ({ assets }: { assets: Asset[] }) => (
    <div>{assets.map((asset) => <span key={asset.id}>{asset.filename}</span>)}</div>
  ),
}));

vi.mock('@/components/library/share-button', () => ({
  ShareButton: () => <button aria-label="share meme">share</button>,
}));

import MemeDetailPage from '@/app/app/meme/[id]/page';

const asset: Asset = {
  id: 'detail-1',
  ownerUserId: 'user-1',
  blobUrl: 'https://example.com/tall.jpg',
  thumbnailUrl: 'https://example.com/tall-thumb.jpg',
  pathname: 'tall.jpg',
  filename: 'tall.jpg',
  mime: 'image/jpeg',
  size: 100_000,
  checksumSha256: 'checksum',
  width: 900,
  height: 1600,
  favorite: false,
  embeddingStatus: 'ready',
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
  deletedAt: null,
  tags: [{ id: 'tag-1', name: 'reaction' }],
};

describe('dedicated meme detail presentation', () => {
  it('presents full media, metadata, actions, and related memes as distinct page regions', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/similar')) {
        return new Response(JSON.stringify({ results: [{ ...asset, id: 'related-1', filename: 'related.jpg' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ asset }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    render(<MemeDetailPage params={Promise.resolve({ id: asset.id })} />);

    const page = await waitFor(() => screen.getByRole('main', { name: /meme detail/i }));
    const media = within(page).getByRole('group', { name: /full meme/i });
    const image = within(media).getByRole('img', { name: 'tall.jpg' });
    expect(image).toHaveClass('object-contain');
    expect(image).not.toHaveClass('object-cover');

    const actions = within(page).getByRole('group', { name: /meme actions/i });
    expect(within(actions).getByRole('button', { name: /banger/i })).toBeVisible();
    expect(within(actions).getByRole('button', { name: /share/i })).toBeVisible();
    expect(within(actions).getByRole('button', { name: /download/i })).toBeVisible();

    const metadata = within(page).getByRole('region', { name: /meme metadata/i });
    expect(within(metadata).getByText('900x1600')).toBeVisible();
    expect(within(metadata).getByText('reaction')).toBeVisible();

    const related = within(page).getByRole('region', { name: /related memes/i });
    expect(await within(related).findByText('related.jpg')).toBeVisible();
  });
});
