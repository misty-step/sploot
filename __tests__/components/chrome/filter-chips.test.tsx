import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChips, FilterChip } from '@/components/chrome/filter-chips';
import React from 'react';

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
      // shadcn ToggleGroup sm size applies h-8
      expect(allButton).toHaveClass('h-8');
    });

    it('should apply medium size classes by default', () => {
      render(<FilterChips />);

      const allButton = screen.getByLabelText('all');
      // shadcn ToggleGroup default size applies h-9
      expect(allButton).toHaveClass('h-9');
    });

    it('should apply large size classes when size is "lg"', () => {
      render(<FilterChips size="lg" />);

      const allButton = screen.getByLabelText('all');
      // shadcn ToggleGroup lg size applies h-10
      expect(allButton).toHaveClass('h-10');
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

describe('FilterChip', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render chip with label', () => {
      render(<FilterChip label="Test Filter" />);

      expect(screen.getByText('Test Filter')).toBeInTheDocument();
    });

    it('should render with icon when provided', () => {
      const icon = <svg data-testid="test-icon" />;
      render(<FilterChip label="Test" icon={icon} />);

      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });

    it('should render without icon when not provided', () => {
      const { container } = render(<FilterChip label="Test" />);

      expect(container.querySelector('svg')).not.toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<FilterChip label="Test" className="custom-class" />);

      const group = container.querySelector('[data-slot="toggle-group"]');
      expect(group).toHaveClass('custom-class');
    });
  });

  describe('Active State', () => {
    it('should not be active by default', () => {
      const { container } = render(<FilterChip label="Test" />);

      const button = container.querySelector('[data-slot="toggle-group-item"]');
      expect(button).toHaveAttribute('data-state', 'off');
    });

    it('should show active state when isActive is true', () => {
      const { container } = render(<FilterChip label="Test" isActive={true} />);

      const button = container.querySelector('[data-slot="toggle-group-item"]');
      expect(button).toHaveAttribute('data-state', 'on');
    });
  });

  describe('Click Behavior', () => {
    it('should call onClick when clicked', async () => {
      const user = userEvent.setup();
      const { container } = render(<FilterChip label="Test" onClick={mockOnClick} />);

      const button = container.querySelector('[data-slot="toggle-group-item"]')!;
      await user.click(button);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should not error when onClick is not provided', async () => {
      const user = userEvent.setup();
      const { container } = render(<FilterChip label="Test" />);

      const button = container.querySelector('[data-slot="toggle-group-item"]')!;

      // Should not throw
      await expect(user.click(button)).resolves.not.toThrow();
    });
  });

  describe('Size Variants', () => {
    it('should apply small size classes when size is "sm"', () => {
      const { container } = render(<FilterChip label="Test" size="sm" />);

      const button = container.querySelector('[data-slot="toggle-group-item"]');
      // shadcn ToggleGroup sm size applies h-8
      expect(button).toHaveClass('h-8');
    });

    it('should apply medium size classes by default', () => {
      const { container } = render(<FilterChip label="Test" />);

      const button = container.querySelector('[data-slot="toggle-group-item"]');
      // shadcn ToggleGroup default size applies h-9
      expect(button).toHaveClass('h-9');
    });

    it('should apply large size classes when size is "lg"', () => {
      const { container } = render(<FilterChip label="Test" size="lg" />);

      const button = container.querySelector('[data-slot="toggle-group-item"]');
      // shadcn ToggleGroup lg size applies h-10
      expect(button).toHaveClass('h-10');
    });
  });
});
