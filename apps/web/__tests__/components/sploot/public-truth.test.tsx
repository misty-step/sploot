import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingStory } from '@/components/landing/landing-story';
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
  it('announces the same search action for typing, Enter, and Run search', async () => {
    const user = userEvent.setup();
    render(<SearchField enrollmentState={pausedEnrollment} />);

    const input = screen.getByRole('searchbox');
    const getLiveRegion = () => screen.getByTestId('search-announcement');

    await user.clear(input);
    await user.type(input, 'galaxy brain');
    const liveRegion = getLiveRegion();
    const typedAnnouncement = liveRegion.textContent;
    const typedRun = liveRegion.getAttribute('data-search-run');
    expect(typedAnnouncement).toMatch(/search complete/i);

    await user.keyboard('{Enter}');
    expect(getLiveRegion()).toHaveTextContent(typedAnnouncement ?? '');
    expect(getLiveRegion().getAttribute('data-search-run')).not.toBe(typedRun);

    await user.click(screen.getByRole('button', { name: 'run search' }));
    expect(getLiveRegion()).toHaveTextContent(typedAnnouncement ?? '');
    expect(getLiveRegion().getAttribute('data-search-run')).not.toBe(typedRun);
  });

  it('reorders the wall from both visible shuffle entry points', async () => {
    const user = userEvent.setup();
    render(<LandingHero enrollmentState={pausedEnrollment} />);

    const initial = tileOrder();
    await user.click(screen.getByRole('button', { name: 'shuffle the demo' }));
    const afterTowerShuffle = tileOrder();
    expect(afterTowerShuffle).not.toEqual(initial);

    await user.click(screen.getByRole('button', { name: 'shuffle the demo pile' }));
    expect(tileOrder()).not.toEqual(afterTowerShuffle);
  });

  it('does not render a home account-creation CTA while enrollment is paused', () => {
    render(<LandingStory enrollmentState={pausedEnrollment} />);

    expect(screen.queryByRole('link', { name: 'claim your library' })).not.toBeInTheDocument();
    expect(screen.getByText('new enrollment is paused')).toBeInTheDocument();
  });
});
