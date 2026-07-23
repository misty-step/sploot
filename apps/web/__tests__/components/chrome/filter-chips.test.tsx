import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChips } from '@/components/chrome/filter-chips';

describe('FilterChips', () => {
  const mockOnFilterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render all filter buttons', () => {
      render(<FilterChips />);

      expect(screen.getByLabelText('all')).toBeInTheDocument();
      expect(screen.getByLabelText('bangers')).toBeInTheDocument();
    });

    it('should render with labels by default', () => {
      render(<FilterChips />);

      expect(screen.getByText('ALL')).toBeInTheDocument();
      expect(screen.getByText('BANGERS')).toBeInTheDocument();
    });

    it('should render without labels when showLabels is false', () => {
      render(<FilterChips showLabels={false} />);

      expect(screen.queryByText('ALL')).not.toBeInTheDocument();
      expect(screen.queryByText('BANGERS')).not.toBeInTheDocument();

      // Labels should still exist in aria-label
      expect(screen.getByLabelText('all')).toBeInTheDocument();
      expect(screen.getByLabelText('bangers')).toBeInTheDocument();
    });

    it('should render filter group with correct attributes', () => {
      const { container } = render(<FilterChips />);

      // ToggleGroup renders as a div with data-slot
      const group = container.querySelector('[data-slot="toggle-group"]');
      expect(group).toBeInTheDocument();
    });

    it('should render icon for bangers filter', () => {
      const { container } = render(<FilterChips />);

      // Should have 1 SVG icon (bangers only, not all)
      const icons = container.querySelectorAll('svg');
      expect(icons.length).toBe(1);
    });

    it('should apply custom className', () => {
      const { container } = render(<FilterChips className="custom-class" />);

      const group = container.querySelector('[data-slot="toggle-group"]');
      expect(group).toHaveClass('custom-class');
    });
  });

  describe('Active State', () => {
    it('should mark "all" as active by default', () => {
      render(<FilterChips />);

      const allButton = screen.getByLabelText('all');
      expect(allButton).toHaveAttribute('data-state', 'on');
    });

    it('should mark bangers as active when activeFilter is "bangers"', () => {
      render(<FilterChips activeFilter="bangers" />);

      const bangersButton = screen.getByLabelText('bangers');
      expect(bangersButton).toHaveAttribute('data-state', 'on');

      const allButton = screen.getByLabelText('all');
      expect(allButton).toHaveAttribute('data-state', 'off');
    });

    it('uses semantic selected fills for each filter family', () => {
      const { rerender } = render(<FilterChips activeFilter="all" />);
      expect(screen.getByLabelText('all')).toHaveClass('data-[state=on]:bg-sploot-cyan');

      rerender(<FilterChips activeFilter="bangers" />);
      expect(screen.getByLabelText('bangers')).toHaveClass('data-[state=on]:bg-sploot-magenta');
    });

    it('should fill bangers icon when active', () => {
      const { container } = render(<FilterChips activeFilter="bangers" />);

      const bangersButton = screen.getByLabelText('bangers');
      const icon = bangersButton.querySelector('svg');

      expect(icon).toHaveAttribute('fill', 'currentColor');
    });

    it('should not fill bangers icon when inactive', () => {
      const { container } = render(<FilterChips activeFilter="all" />);

      const bangersButton = screen.getByLabelText('bangers');
      const icon = bangersButton.querySelector('svg');

      expect(icon).toHaveAttribute('fill', 'none');
    });
  });

  describe('Click Behavior', () => {
    it('should call onFilterChange with "bangers" when bangers is clicked from all', async () => {
      const user = userEvent.setup();
      render(<FilterChips activeFilter="all" onFilterChange={mockOnFilterChange} />);

      const bangersButton = screen.getByLabelText('bangers');
      await user.click(bangersButton);

      expect(mockOnFilterChange).toHaveBeenCalledWith('bangers');
    });

    it('should call onFilterChange with "bangers" when bangers is clicked', async () => {
      const user = userEvent.setup();
      render(<FilterChips onFilterChange={mockOnFilterChange} />);

      const bangersButton = screen.getByLabelText('bangers');
      await user.click(bangersButton);

      expect(mockOnFilterChange).toHaveBeenCalledWith('bangers');
    });

    it('should not error when onFilterChange is not provided', async () => {
      const user = userEvent.setup();
      render(<FilterChips />);

      const allButton = screen.getByLabelText('all');

      // Should not throw
      await expect(user.click(allButton)).resolves.not.toThrow();
    });
  });

  describe('Size Variants', () => {
    it('should apply small size classes when size is "sm"', () => {
      render(<FilterChips size="sm" />);

      const allButton = screen.getByLabelText('all');
      expect(allButton).toHaveClass('h-[var(--sploot-control-height-sm)]');
    });

    it('should apply the default control height token', () => {
      render(<FilterChips />);

      const allButton = screen.getByLabelText('all');
      expect(allButton).toHaveClass('h-[var(--sploot-control-height)]');
    });

    it('should apply the large control height token', () => {
      render(<FilterChips size="lg" />);

      const allButton = screen.getByLabelText('all');
      expect(allButton).toHaveClass('h-[var(--sploot-control-height-lg)]');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible labels for all filters', () => {
      render(<FilterChips />);

      expect(screen.getByLabelText('all')).toHaveAccessibleName('all');
      expect(screen.getByLabelText('bangers')).toHaveAccessibleName('bangers');
    });

    it('should have correct data-state attributes', () => {
      render(<FilterChips activeFilter="bangers" />);

      expect(screen.getByLabelText('all')).toHaveAttribute('data-state', 'off');
      expect(screen.getByLabelText('bangers')).toHaveAttribute('data-state', 'on');
    });

    it('should have title attributes for tooltips', () => {
      render(<FilterChips />);

      expect(screen.getByLabelText('all')).toHaveAttribute('title', 'all');
      expect(screen.getByLabelText('bangers')).toHaveAttribute('title', 'bangers');
    });
  });
});

