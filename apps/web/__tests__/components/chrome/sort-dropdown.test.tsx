import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SortDropdown } from '@/components/chrome/sort-dropdown';

describe('SortDropdown', () => {
  it('does not include shuffle because shuffle is a distinct command', async () => {
    const user = userEvent.setup();
    render(<SortDropdown value="createdAt" direction="desc" onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /sort options/i }));

    expect(screen.getByRole('menuitemradio', { name: /recent/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /updated/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /size/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /name/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: /shuffle/i })).not.toBeInTheDocument();
  });
});
