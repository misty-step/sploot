import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSortPreferences } from '@/hooks/use-sort-preferences';

describe('useSortPreferences', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('shuffleSeed generation', () => {
    it('should generate shuffleSeed between 0 and 1000000 when shuffle selected', () => {
      const { result } = renderHook(() => useSortPreferences());

      act(() => {
        result.current.handleSortChange('shuffle', 'desc');
      });

      expect(result.current.shuffleSeed).toBeDefined();
      expect(result.current.shuffleSeed).toBeGreaterThanOrEqual(0);
      expect(result.current.shuffleSeed).toBeLessThanOrEqual(1000000);
    });

    it('should generate different seeds on multiple shuffle activations', () => {
      const { result } = renderHook(() => useSortPreferences());
      const seeds = new Set<number>();

      // Generate 10 seeds
      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.handleSortChange('shuffle', 'desc');
        });
        if (result.current.shuffleSeed !== undefined) {
          seeds.add(result.current.shuffleSeed);
        }
      }

      // Should have multiple unique seeds (statistically very likely)
      expect(seeds.size).toBeGreaterThan(5);
    });

    it('should clear shuffleSeed when switching to other sort options', () => {
      const { result } = renderHook(() => useSortPreferences());

      // First activate shuffle
      act(() => {
        result.current.handleSortChange('shuffle', 'desc');
      });
      expect(result.current.shuffleSeed).toBeDefined();

      // Then switch to 'recent'
      act(() => {
        result.current.handleSortChange('recent', 'desc');
      });
      expect(result.current.shuffleSeed).toBeUndefined();
    });

    it('should clear shuffleSeed when switching to name sort', () => {
      const { result } = renderHook(() => useSortPreferences());

      act(() => {
        result.current.handleSortChange('shuffle', 'desc');
      });
      expect(result.current.shuffleSeed).toBeDefined();

      act(() => {
        result.current.handleSortChange('name', 'asc');
      });
      expect(result.current.shuffleSeed).toBeUndefined();
    });

    it('should clear shuffleSeed when switching to date sort', () => {
      const { result } = renderHook(() => useSortPreferences());

      act(() => {
        result.current.handleSortChange('shuffle', 'desc');
      });
      expect(result.current.shuffleSeed).toBeDefined();

      act(() => {
        result.current.handleSortChange('date', 'desc');
      });
      expect(result.current.shuffleSeed).toBeUndefined();
    });
  });

  describe('localStorage persistence', () => {
    it('should persist shuffleSeed to localStorage', async () => {
      const { result } = renderHook(() => useSortPreferences());

      act(() => {
        result.current.handleSortChange('shuffle', 'desc');
      });

      const seed = result.current.shuffleSeed;
      expect(seed).toBeDefined();

      // Wait for debounced save
      await new Promise(resolve => setTimeout(resolve, 150));

      const stored = localStorage.getItem('sploot-sort-preferences');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.shuffleSeed).toBe(seed);
      expect(parsed.sortBy).toBe('shuffle');
    });

    it('should restore shuffleSeed from localStorage on mount', () => {
      // Set up localStorage with shuffle preferences
      const testSeed = 500000;
      localStorage.setItem('sploot-sort-preferences', JSON.stringify({
        sortBy: 'shuffle',
        direction: 'desc',
        shuffleSeed: testSeed,
      }));

      const { result } = renderHook(() => useSortPreferences());

      // Wait for useEffect to run
      expect(result.current.sortBy).toBe('shuffle');
      expect(result.current.shuffleSeed).toBe(testSeed);
    });

    it('should persist seed cleared state when switching away from shuffle', async () => {
      const { result } = renderHook(() => useSortPreferences());

      // Activate shuffle
      act(() => {
        result.current.handleSortChange('shuffle', 'desc');
      });
      await new Promise(resolve => setTimeout(resolve, 150));

      // Switch away from shuffle
      act(() => {
        result.current.handleSortChange('recent', 'desc');
      });
      await new Promise(resolve => setTimeout(resolve, 150));

      const stored = localStorage.getItem('sploot-sort-preferences');
      const parsed = JSON.parse(stored!);
      expect(parsed.sortBy).toBe('recent');
      expect(parsed.shuffleSeed).toBeUndefined();
    });
  });

  describe('integration with other sort preferences', () => {
    it('should maintain sortBy and direction along with shuffleSeed', () => {
      const { result } = renderHook(() => useSortPreferences());

      act(() => {
        result.current.handleSortChange('shuffle', 'desc');
      });

      expect(result.current.sortBy).toBe('shuffle');
      expect(result.current.direction).toBe('desc');
      expect(result.current.shuffleSeed).toBeDefined();
    });

    it('should handle shuffle with asc direction', () => {
      const { result } = renderHook(() => useSortPreferences());

      act(() => {
        result.current.handleSortChange('shuffle', 'asc');
      });

      expect(result.current.sortBy).toBe('shuffle');
      expect(result.current.direction).toBe('asc');
      expect(result.current.shuffleSeed).toBeDefined();
    });
  });
});
