import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileCommandDock } from '@/components/chrome/mobile-command-dock';

describe('MobileCommandDock', () => {
  const props = {
    activeFilter: 'all' as const,
    failedEmbeddingsCount: 0,
    isSearchOpen: false,
    isShuffleActive: false,
    isUploadOpen: false,
    onFilterChange: vi.fn(),
    onRetryFailed: vi.fn(),
    onSearchToggle: vi.fn(),
    onShuffle: vi.fn(),
    onSortChange: vi.fn(),
    onUploadClick: vi.fn(),
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('puts upload, search, filter, sort, and shuffle in one mobile command bar', async () => {
    const user = userEvent.setup();
    render(<MobileCommandDock {...props} />);

    await user.click(screen.getByRole('button', { name: /UPLOAD/i }));
    await user.click(screen.getByRole('button', { name: /search memes/i }));
    await user.click(screen.getByRole('button', { name: /shuffle memes/i }));

    expect(props.onUploadClick).toHaveBeenCalledTimes(1);
    expect(props.onSearchToggle).toHaveBeenCalledTimes(1);
    expect(props.onShuffle).toHaveBeenCalledTimes(1);
  });

  it('collapses filter and sort options into menus', async () => {
    const user = userEvent.setup();
    render(<MobileCommandDock {...props} />);

    await user.click(screen.getByRole('button', { name: /filter memes/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /bangers/i }));
    expect(props.onFilterChange).toHaveBeenCalledWith('bangers');

    await user.click(screen.getByRole('button', { name: /sort memes by recent/i }));
    expect(screen.queryByRole('menuitemradio', { name: /shuffle/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitemradio', { name: /name/i }));
    expect(props.onSortChange).toHaveBeenCalledWith('pathname', 'asc');
  });

  it('shows retry only when failed embeddings exist', () => {
    const { rerender } = render(<MobileCommandDock {...props} />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();

    rerender(<MobileCommandDock {...props} failedEmbeddingsCount={2} />);
    expect(screen.getByRole('button', { name: /retry 2/i })).toBeInTheDocument();
  });
});
