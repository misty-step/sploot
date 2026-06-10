import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AtlasLandingHero } from '@/components/sploot';

describe('AtlasLandingHero', () => {
  it('renders the No Folders Just Vibes mechanism in the first viewport', () => {
    render(<AtlasLandingHero />);

    expect(screen.getByText('no folders just vibes')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'type the vibe. summon the meme.' })).toBeInTheDocument();
    expect(screen.getByText('messy import pile')).toBeInTheDocument();
    // Feature-true: sploot does not auto-cluster yet, so piles are framed as
    // search results, never "automatic piles".
    expect(screen.getByText('piles on demand')).toBeInTheDocument();
    expect(screen.queryByText('automatic piles')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'start your pile' })).toHaveAttribute('href', '/sign-up');
  });

  it('frames pile previews as typed queries with banger state', () => {
    render(<AtlasLandingHero />);

    expect(screen.getByLabelText('“dramatic reactions”, 128 saves')).toBeInTheDocument();
    expect(screen.getByLabelText('“tiny wins”, 74 saves')).toBeInTheDocument();
    expect(screen.getByLabelText('“unhinged office”, 46 saves')).toBeInTheDocument();
    expect(screen.getByLabelText('17 bangers')).toBeInTheDocument();
  });

  it('renders command stats without fabricating feature claims', () => {
    render(<AtlasLandingHero />);

    expect(screen.getByText('memes')).toBeInTheDocument();
    expect(screen.getByText('bangers')).toBeInTheDocument();
    expect(screen.getByText('brainrot')).toBeInTheDocument();
    expect(screen.getByText('1,312')).toBeInTheDocument();
    expect(screen.getByText('91')).toBeInTheDocument();
    expect(screen.getByText('∞')).toBeInTheDocument();
    // The old strip claimed a fake search latency and a pile count for a
    // clustering feature that does not exist.
    expect(screen.queryByText('0.18s')).not.toBeInTheDocument();
    expect(screen.queryByText('piles')).not.toBeInTheDocument();
  });
});
