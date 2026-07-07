import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicMemePage, { generateMetadata } from '@/app/m/[id]/page';
import ShareSlugPage from '@/app/s/[slug]/page';
import { buildShareRedirectPath } from '@/lib/share-links';
import { resolveShareSlug } from '@/lib/slug-cache';

vi.mock('@/lib/db', () => ({ prisma: null }));
vi.mock('@/lib/slug-cache', () => ({ resolveShareSlug: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

describe('public share terminal states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('/m/<bad-id> renders the designed dead-link state instead of raw duplicated copy', async () => {
    const ui = await PublicMemePage({
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    });

    render(ui);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'this meme left the pile.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'open sploot' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/^Meme not found$/)).not.toBeInTheDocument();
  });

  it('/m/<bad-id> metadata does not repeat the body heading verbatim', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    });

    expect(metadata.title).toBe('dead meme link | sploot');
  });

  it('/s/<bad-slug> renders the same designed dead-link recovery path', async () => {
    vi.mocked(resolveShareSlug).mockResolvedValue(null);

    const ui = await ShareSlugPage({
      params: Promise.resolve({ slug: 'nonexistent-slug-xyz' }),
      searchParams: Promise.resolve({}),
    });

    render(ui);

    expect(screen.getByRole('heading', { name: 'this share link fell out of the pile.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'open sploot' })).toHaveAttribute('href', '/');
  });

  it('preserves query parameters when a share slug resolves to a meme', () => {
    expect(
      buildShareRedirectPath('asset-123', {
        ref: 'group-chat',
        empty: '',
        tag: ['cursed', 'goated'],
        missing: undefined,
      })
    ).toBe('/m/asset-123?ref=group-chat&empty=&tag=cursed&tag=goated');
  });
});
