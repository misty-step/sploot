import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryTokenHighlight } from '@/components/sploot/query-token-highlight';

describe('QueryTokenHighlight', () => {
  it('renders the literal query tokens as non-interactive highlights', () => {
    render(<QueryTokenHighlight query="cats yelling at table" />);

    expect(screen.getByRole('list', { name: 'search query tokens' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'cats',
      'yelling',
      'at',
      'table',
    ]);
  });
});
