import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AtlasLandingHero } from '@/components/sploot';

describe('AtlasLandingHero', () => {
  it('renders the No Folders Just Vibes mechanism in the first viewport', () => {
    render(<AtlasLandingHero />);

    expect(screen.getByText('no folders just vibes')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'your saves sort themselves.' })).toBeInTheDocument();
    expect(screen.getByText('messy import pile')).toBeInTheDocument();
    expect(screen.getByText('automatic piles')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'start your pile' })).toHaveAttribute('href', '/sign-up');
  });

  it('exposes semantic pile previews and banger state', () => {
    render(<AtlasLandingHero />);

    expect(screen.getByLabelText('dramatic reactions, 128 saves')).toBeInTheDocument();
    expect(screen.getByLabelText('tiny wins, 74 saves')).toBeInTheDocument();
    expect(screen.getByLabelText('unhinged office, 46 saves')).toBeInTheDocument();
    expect(screen.getByLabelText('17 bangers')).toBeInTheDocument();
  });

  it('renders stable command stats for search, piles, and bangers', () => {
    render(<AtlasLandingHero />);

    expect(screen.getByText('search')).toBeInTheDocument();
    expect(screen.getByText('piles')).toBeInTheDocument();
    expect(screen.getByText('bangers')).toBeInTheDocument();
    expect(screen.getByText('0.18s')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('91')).toBeInTheDocument();
  });
});
