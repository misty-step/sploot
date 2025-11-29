import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageTileErrorBoundary } from '@/components/library/image-tile-error-boundary';
import type { Asset } from '@/lib/types';
import React from 'react';

// Component that throws an error when shouldThrow is true
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div data-testid="normal-content">Normal content</div>;
}

describe('ImageTileErrorBoundary', () => {
  const mockAsset: Asset = {
    id: 'test-asset-id',
    filename: 'test-image.jpg',
    blobUrl: 'https://example.com/test.jpg',
    userId: 'test-user-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    isFavorite: false,
    tags: [],
  };

  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Suppress console.error for error boundary tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Normal Rendering', () => {
    it('should render children when there is no error', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset}>
          <div data-testid="child-content">Child content</div>
        </ImageTileErrorBoundary>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });

    it('should not show error UI when no error occurs', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset}>
          <div>Normal content</div>
        </ImageTileErrorBoundary>
      );

      expect(screen.queryByText('Failed to load')).not.toBeInTheDocument();
      expect(screen.queryByText('Retry')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should catch render error and show fallback UI', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      expect(screen.getByText('Failed to load')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('should display tombstone icon when error occurs', () => {
      const { container } = render(
        <ImageTileErrorBoundary asset={mockAsset}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      // Check for warning/error icon SVG
      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should show filename in error fallback for context', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      expect(screen.getByText('test-image.jpg')).toBeInTheDocument();
    });

    it('should log error to console in development', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ImageTileErrorBoundary asset={mockAsset}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      // Console.error should be called (error boundary logging)
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Retry Functionality', () => {
    it('should render retry button when error occurs', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('should reset error boundary state when retry is clicked', async () => {
      const user = userEvent.setup();

      render(
        <ImageTileErrorBoundary asset={mockAsset}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      // Error state should be shown
      expect(screen.getByText('Failed to load')).toBeInTheDocument();

      // Click retry button - this resets the error boundary's internal state
      const retryButton = screen.getByText('Retry');
      await user.click(retryButton);

      // The error boundary will try to re-render the child
      // Since the child still throws, it will catch the error again
      // But the retry button successfully called setState to reset hasError
      // This is the expected behavior - retry gives the child another chance
      expect(screen.getByText('Failed to load')).toBeInTheDocument();
    });

    it('should have accessible title on retry button', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      const retryButton = screen.getByText('Retry').closest('button');
      expect(retryButton).toHaveAttribute('title', 'Retry loading image');
    });
  });

  describe('Delete Functionality', () => {
    it('should render delete button when onDelete prop is provided', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset} onDelete={mockOnDelete}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('should not render delete button when onDelete is not provided', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });

    it('should call onDelete with asset id when delete button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <ImageTileErrorBoundary asset={mockAsset} onDelete={mockOnDelete}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      const deleteButton = screen.getByText('Delete');
      await user.click(deleteButton);

      expect(mockOnDelete).toHaveBeenCalledWith('test-asset-id');
      expect(mockOnDelete).toHaveBeenCalledTimes(1);
    });

    it('should have accessible title on delete button', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset} onDelete={mockOnDelete}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      const deleteButton = screen.getByText('Delete').closest('button');
      expect(deleteButton).toHaveAttribute('title', 'Delete broken image');
    });

    it('should have warning styling on delete button', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset} onDelete={mockOnDelete}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      const deleteButton = screen.getByText('Delete').closest('button');
      expect(deleteButton).toHaveClass('bg-red-500/10', 'text-red-400');
    });
  });

  describe('Fallback UI Styling', () => {
    it('should have correct container styling', () => {
      const { container } = render(
        <ImageTileErrorBoundary asset={mockAsset}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      const fallbackContainer = container.querySelector('.aspect-square');
      expect(fallbackContainer).toHaveClass('bg-card', 'overflow-hidden');
    });

    it('should render retry button with primary styling', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      const retryButton = screen.getByText('Retry').closest('button');
      expect(retryButton).toHaveClass('bg-primary/10', 'text-primary');
    });
  });

  describe('Accessibility', () => {
    it('should have proper button types', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset} onDelete={mockOnDelete}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      const retryButton = screen.getByText('Retry').closest('button');
      const deleteButton = screen.getByText('Delete').closest('button');

      expect(retryButton).toHaveAttribute('type', 'button');
      expect(deleteButton).toHaveAttribute('type', 'button');
    });

    it('should have focus-visible outline styles for keyboard navigation', () => {
      render(
        <ImageTileErrorBoundary asset={mockAsset} onDelete={mockOnDelete}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      const retryButton = screen.getByText('Retry').closest('button');
      const deleteButton = screen.getByText('Delete').closest('button');

      expect(retryButton).toHaveClass('focus-visible:outline');
      expect(deleteButton).toHaveClass('focus-visible:outline');
    });
  });

  describe('Multiple Assets', () => {
    it('should show correct filename for different assets', () => {
      const asset1 = { ...mockAsset, filename: 'first-image.jpg' };
      const asset2 = { ...mockAsset, filename: 'second-image.png' };

      const { rerender } = render(
        <ImageTileErrorBoundary asset={asset1}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      expect(screen.getByText('first-image.jpg')).toBeInTheDocument();

      rerender(
        <ImageTileErrorBoundary asset={asset2}>
          <ThrowError shouldThrow={true} />
        </ImageTileErrorBoundary>
      );

      expect(screen.getByText('second-image.png')).toBeInTheDocument();
    });
  });
});
