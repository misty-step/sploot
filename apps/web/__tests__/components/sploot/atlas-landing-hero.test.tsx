import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { AtlasLandingHero } from '@/components/sploot';

describe('AtlasLandingHero', () => {
  it('renders the search-box pitch above the fold', () => {
    render(<AtlasLandingHero />);

    expect(screen.getByText(/a search box\. for memes/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'type words. get the picture.' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /describe what is in the meme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run search/i })).toBeInTheDocument();
    expect(screen.getByText(/no social feed.*no ads.*export stays yours/i)).toBeInTheDocument();
  });

  it('shows the pile and drops the old summon/SaaS copy', () => {
    render(<AtlasLandingHero />);

    // The console renders real meme cells from the pile. The matching file can
    // also appear in the machinery readout (hit: ...), so assert on a cell that
    // is not the current hit to prove the grid itself rendered.
    expect(screen.getByText('IMG_9013.png')).toBeInTheDocument();
    expect(screen.getByText('8 in the demo pile')).toBeInTheDocument();
    expect(screen.getByText('demo vectors')).toBeInTheDocument();
    expect(screen.queryByText('12,408 in the pile')).not.toBeInTheDocument();
    expect(screen.queryByText(/summon/i)).not.toBeInTheDocument();
    expect(screen.queryByText('piles on demand')).not.toBeInTheDocument();
  });

  it('lights up the match live as the query changes', () => {
    render(<AtlasLandingHero />);

    const input = screen.getByRole('searchbox', { name: /describe what is in the meme/i });

    // A query with no overlap leaves nothing matched.
    fireEvent.change(input, { target: { value: 'zzzzz nonsense xyzzy' } });
    expect(screen.queryByText('match')).not.toBeInTheDocument();

    // The literal query lights up the matching cell with the match badge.
    fireEvent.change(input, { target: { value: 'two cats arguing at a table' } });
    expect(screen.getByText('match')).toBeInTheDocument();
  });
});
