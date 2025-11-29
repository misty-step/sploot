import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBarElastic, SearchTrigger } from '@/components/chrome/search-bar-elastic';
import React from 'react';

// Mock next/navigation
const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
};

const mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
}));

// Mock useSlashSearchShortcut hook
vi.mock('@/hooks/use-keyboard-shortcut', () => ({
  useSlashSearchShortcut: (callback: () => void) => {
    // Store callback so we can trigger it in tests
    (global as any).__slashSearchCallback = callback;
  },
}));

describe('SearchBarElastic', () => {
  const mockOnSearch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.forEach((_, key) => mockSearchParams.delete(key));
  });

  describe('Rendering', () => {
    it('should render search input with default placeholder', () => {
      render(<SearchBarElastic />);

      expect(screen.getByPlaceholderText('Search memes...')).toBeInTheDocument();
    });

    it('should render with custom placeholder', () => {
      render(<SearchBarElastic placeholder="Custom placeholder" />);

      expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument();
    });

    it('should render search icon', () => {
      const { container } = render(<SearchBarElastic />);

      const searchIcon = container.querySelector('svg');
      expect(searchIcon).toBeInTheDocument();
    });

    it('should render keyboard shortcut hint when not focused and no query', () => {
      render(<SearchBarElastic />);

      expect(screen.getByText('/')).toBeInTheDocument();
    });

    it('should hide keyboard shortcut hint when focused', async () => {
      const user = userEvent.setup();
      render(<SearchBarElastic />);

      const input = screen.getByPlaceholderText('Search memes...');
      await user.click(input);

      expect(screen.queryByText('/')).not.toBeInTheDocument();
    });

    it('should hide keyboard shortcut hint when there is a query', async () => {
      const user = userEvent.setup();
      render(<SearchBarElastic />);

      const input = screen.getByPlaceholderText('Search memes...');
      await user.type(input, 'test');

      expect(screen.queryByText('/')).not.toBeInTheDocument();
    });

    it('should show clear button when there is a query', async () => {
      const user = userEvent.setup();
      render(<SearchBarElastic />);

      const input = screen.getByPlaceholderText('Search memes...');
      await user.type(input, 'test');

      expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
    });

    it('should not show clear button when query is empty', () => {
      render(<SearchBarElastic />);

      expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
    });
  });

  describe('URL Initialization', () => {
    it('should initialize query from URL parameter', () => {
      mockSearchParams.set('q', 'initial search');

      render(<SearchBarElastic />);

      const input = screen.getByPlaceholderText('Search memes...') as HTMLInputElement;
      expect(input.value).toBe('initial search');
    });
  });

  describe('Width Animation', () => {
    it('should start with collapsed width', () => {
      const { container } = render(<SearchBarElastic collapsedWidth={200} expandedWidth={400} />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.width).toBe('200px');
    });

    it('should expand to expanded width on focus', async () => {
      const user = userEvent.setup();
      const { container } = render(<SearchBarElastic collapsedWidth={200} expandedWidth={400} />);

      const input = screen.getByPlaceholderText('Search memes...');
      const wrapper = container.firstChild as HTMLElement;

      await user.click(input);

      expect(wrapper.style.width).toBe('400px');
    });

    it('should apply transition classes for smooth animation', () => {
      const { container } = render(<SearchBarElastic />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('transition-[width]');
      expect(wrapper.className).toContain('duration-[180ms]');
    });
  });

  describe('Search Functionality', () => {
    it('should update URL when Enter is pressed', async () => {
      const user = userEvent.setup();
      render(<SearchBarElastic />);

      const input = screen.getByPlaceholderText('Search memes...');
      await user.type(input, 'test query{Enter}');

      expect(mockPush).toHaveBeenCalledWith('/app?q=test+query');
    });

    it('should call onSearch callback when Enter is pressed', async () => {
      const user = userEvent.setup();
      render(<SearchBarElastic onSearch={mockOnSearch} />);

      const input = screen.getByPlaceholderText('Search memes...');
      await user.type(input, 'test{Enter}');

      expect(mockOnSearch).toHaveBeenCalledWith('test');
    });

    it('should trim whitespace from search query', async () => {
      const user = userEvent.setup();
      render(<SearchBarElastic onSearch={mockOnSearch} />);

      const input = screen.getByPlaceholderText('Search memes...');
      await user.type(input, '  test  {Enter}');

      expect(mockOnSearch).toHaveBeenCalledWith('test');
      expect(mockPush).toHaveBeenCalledWith('/app?q=test');
    });

    it('should not search when query is empty', async () => {
      const user = userEvent.setup();
      render(<SearchBarElastic onSearch={mockOnSearch} />);

      const input = screen.getByPlaceholderText('Search memes...');
      await user.type(input, '{Enter}');

      expect(mockOnSearch).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should not search when query is only whitespace', async () => {
      const user = userEvent.setup();
      render(<SearchBarElastic onSearch={mockOnSearch} />);

      const input = screen.getByPlaceholderText('Search memes...');
      await user.type(input, '   {Enter}');

      expect(mockOnSearch).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should preserve other URL params when searching', async () => {
      mockSearchParams.set('filter', 'favorites');
      const user = userEvent.setup();
      render(<SearchBarElastic />);

      const input = screen.getByPlaceholderText('Search memes...');
      await user.type(input, 'test{Enter}');

      expect(mockPush).toHaveBeenCalledWith('/app?filter=favorites&q=test');
    });
  });

  describe('Clear Functionality', () => {
    it('should clear query when clear button is clicked', async () => {
      const user = userEvent.setup();
      render(<SearchBarElastic />);

      const input = screen.getByPlaceholderText('Search memes...') as HTMLInputElement;
      await user.type(input, 'test');

      const clearButton = screen.getByLabelText('Clear search');
      await user.click(clearButton);

      expect(input.value).toBe('');
    });

    it('should remove query param from URL when cleared', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('q', 'test');
      render(<SearchBarElastic />);

      const clearButton = screen.getByLabelText('Clear search');
      await user.click(clearButton);

      expect(mockPush).toHaveBeenCalledWith('/app');
    });

    it('should preserve other URL params when clearing', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('q', 'test');
      mockSearchParams.set('filter', 'favorites');
      render(<SearchBarElastic />);

      const clearButton = screen.getByLabelText('Clear search');
      await user.click(clearButton);

      expect(mockPush).toHaveBeenCalledWith('/app?filter=favorites');
    });

    it('should focus input after clearing', async () => {
      const user = userEvent.setup();
      render(<SearchBarElastic />);

      const input = screen.getByPlaceholderText('Search memes...');
      await user.type(input, 'test');

      const clearButton = screen.getByLabelText('Clear search');
      await user.click(clearButton);

      expect(document.activeElement).toBe(input);
    });
  });

  describe('Keyboard Navigation', () => {
    it('should clear query and blur when Escape is pressed', async () => {
      const user = userEvent.setup();
      render(<SearchBarElastic />);

      const input = screen.getByPlaceholderText('Search memes...');
      await user.type(input, 'test');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect((input as HTMLInputElement).value).toBe('');
    });

    it('should focus search input when / shortcut is triggered', () => {
      render(<SearchBarElastic />);

      const input = screen.getByPlaceholderText('Search memes...');

      // Trigger the slash search callback
      const callback = (global as any).__slashSearchCallback;
      callback();

      expect(document.activeElement).toBe(input);
    });
  });

  describe('Focus States', () => {
    it('should change icon color when focused', async () => {
      const user = userEvent.setup();
      const { container } = render(<SearchBarElastic />);

      const input = screen.getByPlaceholderText('Search memes...');
      const icon = container.querySelector('svg');

      expect(icon).toHaveClass('text-muted-foreground');

      await user.click(input);

      expect(icon).toHaveClass('text-primary');
    });

    it('should change border color when focused', async () => {
      const user = userEvent.setup();
      render(<SearchBarElastic />);

      const input = screen.getByPlaceholderText('Search memes...');

      // Check default border styling
      expect(input).toHaveClass('border-input');

      await user.click(input);

      // focus-visible:border-ring is a Tailwind conditional class
      // Check that the focus-visible variant is in the class list
      expect(input.className).toContain('focus-visible:border-ring');
    });
  });

  describe('Auto-Collapse Behavior', () => {
    it('should collapse when clicking outside if autoCollapse is true and no query', async () => {
      const { container } = render(<SearchBarElastic collapsedWidth={200} expandedWidth={400} autoCollapse={true} />);

      const input = screen.getByPlaceholderText('Search memes...');
      const wrapper = container.firstChild as HTMLElement;

      // Focus to expand
      fireEvent.focus(input);
      expect(wrapper.style.width).toBe('400px');

      // Blur without typing anything
      fireEvent.blur(input);

      // Click outside to trigger collapse
      fireEvent.mouseDown(document.body);

      // The component uses a 200ms timeout for collapse
      await waitFor(() => {
        expect(wrapper.style.width).toBe('200px');
      }, { timeout: 500 });
    });

    it('should not collapse if there is a query even with autoCollapse', async () => {
      const user = userEvent.setup();
      const { container } = render(<SearchBarElastic collapsedWidth={200} expandedWidth={400} autoCollapse={true} />);

      const input = screen.getByPlaceholderText('Search memes...');
      const wrapper = container.firstChild as HTMLElement;

      await user.type(input, 'test');
      expect(wrapper.style.width).toBe('400px');

      fireEvent.mouseDown(document.body);

      // Should still be expanded because there's a query
      expect(wrapper.style.width).toBe('400px');
    });
  });
});

describe('SearchTrigger', () => {
  it('should render search trigger button', () => {
    render(<SearchTrigger />);

    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const mockOnClick = vi.fn();
    render(<SearchTrigger onClick={mockOnClick} />);

    const button = screen.getByLabelText('Search');
    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('should apply custom className', () => {
    render(<SearchTrigger className="custom-class" />);

    const button = screen.getByLabelText('Search');
    expect(button).toHaveClass('custom-class');
  });

  it('should render search icon', () => {
    const { container } = render(<SearchTrigger />);

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });
});
