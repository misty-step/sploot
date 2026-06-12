import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PileFilterRail, visiblePileFilters } from '@/components/sploot/pile-filter-rail';
import type { SemanticPile } from '@/lib/types';

function pile(overrides: Partial<SemanticPile> = {}): SemanticPile {
  return {
    id: 'reaction-faces',
    label: 'reaction faces',
    count: 12,
    bangers: 2,
    confidence: 0.78,
    assetIds: ['asset-1', 'asset-2'],
    thumbnailAssets: [],
    ...overrides,
  };
}

describe('PileFilterRail', () => {
  it('shows all memes as the selected default with the true total', () => {
    render(
      <PileFilterRail
        piles={[pile()]}
        total={62}
        embeddedAssetCount={60}
        selectedPileId={null}
        onSelectPile={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /all memes/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('62 total')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reaction faces/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/12 in pile/)).toBeInTheDocument();
  });

  it('selects and clears a pile without changing the all-memes control', async () => {
    const user = userEvent.setup();
    const onSelectPile = vi.fn();
    render(
      <PileFilterRail
        piles={[pile()]}
        total={62}
        embeddedAssetCount={60}
        selectedPileId={null}
        onSelectPile={onSelectPile}
      />
    );

    await user.click(screen.getByRole('button', { name: /reaction faces/i }));
    expect(onSelectPile).toHaveBeenCalledWith('reaction-faces');

    await user.click(screen.getByRole('button', { name: /all memes/i }));
    expect(onSelectPile).toHaveBeenCalledWith(null);
  });

  it('demotes weak labels and hides very low confidence piles', () => {
    const weak = pile({ id: 'weak', label: 'sports', confidence: 0.44 });
    const tooLow = pile({ id: 'low', label: 'charts', confidence: 0.12 });

    render(
      <PileFilterRail
        piles={[weak, tooLow]}
        total={62}
        embeddedAssetCount={60}
        selectedPileId={null}
        onSelectPile={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /maybe sports/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /charts/i })).not.toBeInTheDocument();
    expect(visiblePileFilters([weak, tooLow]).map((item) => item.id)).toEqual(['weak']);
  });
});
