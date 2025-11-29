import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { FilterProvider, useFilter, useFilterState, useFilterActions } from '@/contexts/filter-context';
import React from 'react';

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
};

const mockSearchParams = new URLSearchParams();
const mockPathname = '/library';

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
  usePathname: () => mockPathname,
}));

describe('FilterContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset search params
    Array.from(mockSearchParams.keys()).forEach((key) => mockSearchParams.delete(key));
  });

  describe('useFilter hook', () => {
    it('should throw error when used outside FilterProvider', () => {
      // Suppress console.error for this test
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useFilter());
      }).toThrow('useFilter must be used within a FilterProvider');

      consoleErrorSpy.mockRestore();
    });

    it('should provide context when used within FilterProvider', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      expect(result.current).toBeDefined();
      expect(result.current.filterType).toBeDefined();
      expect(result.current.setFilterType).toBeDefined();
    });
  });

  describe('Initial State', () => {
    it('should initialize with filterType "all" when no URL params', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      expect(result.current.filterType).toBe('all');
      expect(result.current.tagId).toBeNull();
      expect(result.current.tagName).toBeNull();
      expect(result.current.isBangersOnly).toBe(false);
      expect(result.current.hasActiveFilters).toBe(false);
    });

    it('should initialize with filterType "bangers" when bangers=true in URL', () => {
      mockSearchParams.set('bangers', 'true');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      expect(result.current.filterType).toBe('bangers');
      expect(result.current.isBangersOnly).toBe(true);
      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('should initialize with tagId when tagId in URL', () => {
      mockSearchParams.set('tagId', 'tag-123');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      expect(result.current.tagId).toBe('tag-123');
      expect(result.current.hasActiveFilters).toBe(true);
    });
  });

  describe('setFilterType', () => {
    it('should update filterType and URL when set to "bangers"', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      act(() => {
        result.current.setFilterType('bangers');
      });

      expect(result.current.filterType).toBe('bangers');
      expect(result.current.isBangersOnly).toBe(true);

      // Verify router.replace called with correct URL
      expect(mockReplace).toHaveBeenCalledWith('/library?bangers=true', { scroll: false });
    });

    it('should clear URL params when set to "all"', () => {
      mockSearchParams.set('bangers', 'true');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      expect(result.current.filterType).toBe('bangers');

      act(() => {
        result.current.setFilterType('all');
      });

      expect(result.current.filterType).toBe('all');
      expect(result.current.isBangersOnly).toBe(false);
      expect(result.current.hasActiveFilters).toBe(false);

      // Verify router.replace called with URL without params
      expect(mockReplace).toHaveBeenCalledWith('/library', { scroll: false });
    });
  });

  describe('setTagFilter', () => {
    it('should update tagId and URL when tag is set', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      act(() => {
        result.current.setTagFilter('tag-456', 'memes');
      });

      expect(result.current.tagId).toBe('tag-456');
      expect(result.current.tagName).toBe('memes');
      expect(result.current.hasActiveFilters).toBe(true);

      // Verify router.replace called with correct URL
      expect(mockReplace).toHaveBeenCalledWith('/library?tagId=tag-456', { scroll: false });
    });

    it('should clear tagId when set to null', () => {
      mockSearchParams.set('tagId', 'tag-123');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      expect(result.current.tagId).toBe('tag-123');

      act(() => {
        result.current.setTagFilter(null);
      });

      expect(result.current.tagId).toBeNull();
      expect(result.current.tagName).toBeNull();

      // Verify router.replace called with URL without tagId
      expect(mockReplace).toHaveBeenCalledWith('/library', { scroll: false });
    });

    it('should preserve other URL params when setting tag', () => {
      mockSearchParams.set('bangers', 'true');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      act(() => {
        result.current.setTagFilter('tag-789', 'funny');
      });

      // Should preserve bangers param
      const callArg = mockReplace.mock.calls[0][0];
      expect(callArg).toContain('bangers=true');
      expect(callArg).toContain('tagId=tag-789');
    });
  });

  describe('toggleBangers', () => {
    it('should toggle from "all" to "bangers"', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      expect(result.current.filterType).toBe('all');

      act(() => {
        result.current.toggleBangers();
      });

      expect(result.current.filterType).toBe('bangers');
      expect(result.current.isBangersOnly).toBe(true);
    });

    it('should toggle from "bangers" to "all"', () => {
      mockSearchParams.set('bangers', 'true');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      expect(result.current.filterType).toBe('bangers');

      act(() => {
        result.current.toggleBangers();
      });

      expect(result.current.filterType).toBe('all');
      expect(result.current.isBangersOnly).toBe(false);
    });
  });

  describe('clearTagFilter', () => {
    it('should clear tag filter', () => {
      mockSearchParams.set('tagId', 'tag-999');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      expect(result.current.tagId).toBe('tag-999');

      act(() => {
        result.current.clearTagFilter();
      });

      expect(result.current.tagId).toBeNull();
      expect(result.current.tagName).toBeNull();
    });
  });

  describe('clearAllFilters', () => {
    it('should reset all filters to defaults', () => {
      mockSearchParams.set('bangers', 'true');
      mockSearchParams.set('tagId', 'tag-123');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      expect(result.current.filterType).toBe('bangers');
      expect(result.current.tagId).toBe('tag-123');
      expect(result.current.hasActiveFilters).toBe(true);

      act(() => {
        result.current.clearAllFilters();
      });

      expect(result.current.filterType).toBe('all');
      expect(result.current.tagId).toBeNull();
      expect(result.current.tagName).toBeNull();
      expect(result.current.isBangersOnly).toBe(false);
      expect(result.current.hasActiveFilters).toBe(false);

      // Verify router.replace was called (clearAllFilters calls setFilterType and setTagFilter)
      expect(mockReplace).toHaveBeenCalled();
      // State should be cleared even if URL calls are separate
      expect(result.current.filterType).toBe('all');
      expect(result.current.tagId).toBeNull();
    });
  });

  describe('Derived States', () => {
    it('should correctly compute hasActiveFilters', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      // No filters active
      expect(result.current.hasActiveFilters).toBe(false);

      // Bangers active
      act(() => {
        result.current.setFilterType('bangers');
      });
      expect(result.current.hasActiveFilters).toBe(true);

      // Back to all but with tag
      act(() => {
        result.current.setFilterType('all');
        result.current.setTagFilter('tag-1', 'test');
      });
      expect(result.current.hasActiveFilters).toBe(true);

      // Clear tag
      act(() => {
        result.current.clearTagFilter();
      });
      expect(result.current.hasActiveFilters).toBe(false);
    });
  });

  describe('useFilterState hook', () => {
    it('should provide read-only filter state', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilterState(), { wrapper });

      expect(result.current.filterType).toBeDefined();
      expect(result.current.isBangersOnly).toBeDefined();
      expect(result.current.hasActiveFilters).toBeDefined();

      // Should not include actions
      expect((result.current as any).setFilterType).toBeUndefined();
      expect((result.current as any).toggleBangers).toBeUndefined();
    });
  });

  describe('useFilterActions hook', () => {
    it('should provide filter actions', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilterActions(), { wrapper });

      expect(result.current.setFilterType).toBeDefined();
      expect(result.current.setTagFilter).toBeDefined();
      expect(result.current.toggleBangers).toBeDefined();
      expect(result.current.clearAllFilters).toBeDefined();
      expect(result.current.clearTagFilter).toBeDefined();

      // Should not include state
      expect((result.current as any).filterType).toBeUndefined();
      expect((result.current as any).isBangersOnly).toBeUndefined();
    });
  });

  describe('URL Synchronization', () => {
    it('should not scroll when updating URL params', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      act(() => {
        result.current.setFilterType('bangers');
      });

      // Verify scroll: false option
      expect(mockReplace).toHaveBeenCalledWith(expect.any(String), { scroll: false });
    });

    it('should build correct query string with multiple params', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <FilterProvider>{children}</FilterProvider>
      );

      const { result } = renderHook(() => useFilter(), { wrapper });

      act(() => {
        result.current.setFilterType('bangers');
      });

      act(() => {
        result.current.setTagFilter('tag-abc', 'category');
      });

      // Should have made multiple calls
      expect(mockReplace).toHaveBeenCalledTimes(2);

      // First call for bangers
      expect(mockReplace.mock.calls[0][0]).toContain('bangers=true');

      // Second call for tag (also preserves bangers from searchParams)
      const secondCall = mockReplace.mock.calls[1][0];
      expect(secondCall).toContain('tagId=tag-abc');
    });
  });
});
