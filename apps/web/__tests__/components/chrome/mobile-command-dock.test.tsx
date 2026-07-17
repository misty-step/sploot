import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

describe('MobileCommandDock stacking above the durable-upload-queue toast', () => {
  it('renders the dock root above the queue toast (z-50 > toast z-40) so a queued upload cannot intercept dock button clicks', async () => {
    const user = userEvent.setup();
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
    const { container } = render(<MobileCommandDock {...props} />);

    const dockRoot = container.firstElementChild;
    expect(dockRoot).not.toBeNull();
    // The durable-upload-queue toast (components/offline/upload-queue-display.tsx)
    // is a viewport-fixed z-40 overlay rendered globally by OfflineProvider,
    // after any page content, so it wins DOM-order ties at equal z-index.
    // The dock must clear that overlay's stacking context outright.
    expect(dockRoot?.className).toContain('z-50');
    expect(dockRoot?.className).not.toContain('z-40');

    // The Upload button (and every other dock control) must still be the
    // actionable element receiving the click -- not a coincidental pass
    // from missing overlay in this render.
    await user.click(screen.getByRole('button', { name: /UPLOAD/i }));
    expect(props.onUploadClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the durable-upload-queue toast at a strictly lower z-index than the dock', async () => {
    const toastSource = await readFile(
      join(process.cwd(), 'components/offline/upload-queue-display.tsx'),
      'utf8',
    );
    expect(toastSource).toContain('z-40');
    expect(toastSource).not.toContain('z-50');
  });
});
