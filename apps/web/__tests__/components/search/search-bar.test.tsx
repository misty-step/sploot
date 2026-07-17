import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchBar } from '@/components/search/search-bar';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('SearchBar search history accessibility', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('exposes a named combobox and keyboard-operable history options', async () => {
    localStorage.setItem('sploot_search_history', JSON.stringify([
      { query: 'cats', timestamp: 2 },
      { query: 'dogs', timestamp: 1 },
    ]));
    const onSearch = vi.fn();
    const user = userEvent.setup();

    render(<SearchBar inline onSearch={onSearch} />);

    const input = await screen.findByRole('combobox', { name: 'Search your memes' });
    await user.click(input);
    const listbox = await screen.findByRole('listbox', { name: 'Recent searches' });
    expect(listbox).toHaveAttribute('id', 'search-history-listbox');
    const catsOption = screen.getByRole('option', { name: /cats/ });
    expect(catsOption).toHaveAttribute('aria-selected', 'false');
    expect(catsOption.querySelector('button')).toBeNull();
    expect(catsOption.contains(screen.getByRole('button', { name: 'Remove “cats” from search history' }))).toBe(false);

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', 'search-history-option-0');
    expect(screen.getByRole('option', { name: /cats/ })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Enter}');
    expect(onSearch).toHaveBeenCalledWith(expect.objectContaining({ query: 'cats', updateUrl: true }));
  });

  it('removes a query with a sibling control and keeps active descendant valid', async () => {
    localStorage.setItem('sploot_search_history', JSON.stringify([
      { query: 'cats', timestamp: 2 },
      { query: 'dogs', timestamp: 1 },
    ]));
    const user = userEvent.setup();

    render(<SearchBar inline onSearch={vi.fn()} />);

    const input = await screen.findByRole('combobox', { name: 'Search your memes' });
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', 'search-history-option-0');

    const catsOption = screen.getByRole('option', { name: /cats/ });
    const removeCats = screen.getByRole('button', { name: 'Remove “cats” from search history' });
    expect(removeCats.closest('[role="option"]')).toBeNull();
    await user.tab(); // clear history
    await user.tab(); // remove cats
    expect(removeCats).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('option', { name: /cats/ })).not.toBeInTheDocument());
    expect(screen.getByRole('option', { name: /dogs/ })).toHaveAttribute('id', 'search-history-option-0');
    expect(input).not.toHaveAttribute('aria-activedescendant', 'search-history-option-0');
    expect(catsOption).not.toBeInTheDocument();
  });
});
