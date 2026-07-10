import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TileActionRail } from '@/components/sploot/tile-action-rail';

describe('TileActionRail', () => {
  it('renders a banger as a bright magenta filled heart without changing generic IconButton', () => {
    render(<TileActionRail banger />);

    const button = screen.getByRole('button', { name: 'remove banger' });
    expect(button).toHaveClass('!text-sploot-magenta');
    expect(button.querySelector('svg')).toHaveAttribute('fill', 'currentColor');
  });
});
