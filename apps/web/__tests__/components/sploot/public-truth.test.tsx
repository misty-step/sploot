import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LandingHero } from '@/components/landing/landing-hero';
import { SearchField } from '@/components/sploot/search-field';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const pausedEnrollment = {
  status: 'paused' as const,
  mode: 'closed' as const,
  configuration: 'valid' as const,
};

function tileOrder(): string[] {
  return screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
}

describe('signed-out landing demo truth', () => {
  it('keeps typing visual-only and commits exactly once for Enter and Run search', async () => {
    const user = userEvent.setup();
    render(<SearchField enrollmentState={pausedEnrollment} />);

    const input = screen.getByRole('searchbox');
    const getLiveRegion = () => screen.getByTestId('search-announcement');

    const liveRegion = getLiveRegion();
    expect(liveRegion).toHaveTextContent('');
    expect(liveRegion.getAttribute('data-search-run')).toBe('0');

    await user.clear(input);
    await user.type(input, 'galaxy brain');
    expect(getLiveRegion()).toHaveTextContent('');
    expect(getLiveRegion().getAttribute('data-search-run')).toBe('0');

    await user.keyboard('{Enter}');
    expect(getLiveRegion()).toHaveTextContent(/search complete/i);
    expect(getLiveRegion().getAttribute('data-search-run')).toBe('1');

    await user.click(screen.getByRole('button', { name: 'run search' }));
    expect(getLiveRegion()).toHaveTextContent(/search complete/i);
    expect(getLiveRegion().getAttribute('data-search-run')).toBe('2');
  }, 15_000);

  it('reorders the wall from both visible shuffle entry points', async () => {
    const user = userEvent.setup();
    render(<LandingHero enrollmentState={pausedEnrollment} />);

    const initial = tileOrder();
    await user.click(screen.getByRole('button', { name: 'shuffle the demo' }));
    const afterTowerShuffle = tileOrder();
    expect(afterTowerShuffle).not.toEqual(initial);
    expect(screen.getByTestId('search-announcement')).toHaveTextContent('demo pile shuffled');
    expect(screen.getByTestId('search-announcement')).toHaveAttribute('data-search-run', '1');

    await user.click(screen.getByRole('button', { name: 'shuffle the demo pile' }));
    expect(tileOrder()).not.toEqual(afterTowerShuffle);
    expect(screen.getByTestId('search-announcement')).toHaveAttribute('data-search-run', '2');
  });

  it('does not render a home account-creation CTA while enrollment is paused', () => {
    render(<LandingHero enrollmentState={pausedEnrollment} />);

    expect(screen.queryByRole('link', { name: 'claim your library' })).not.toBeInTheDocument();
    expect(screen.getAllByText('new enrollment is paused')).toHaveLength(1);
  });
});
