'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from './use-debounce';
import type { SortOption, SortDirection } from '@/components/chrome/sort-dropdown';
import { isAssetSortBy, isAssetSortDirection } from '@sploot/common';

const STORAGE_KEY = 'sploot-sort-preferences';
const DEBOUNCE_DELAY = 100; // 100ms as specified
// Shuffle seed range: 0-1000000 for user-friendly integer values
// Normalized to 0.0-1.0 for PostgreSQL setseed() in API/DB layer
const MAX_SHUFFLE_SEED = 1000000;

function createShuffleSeed(): number {
  return Math.floor(Math.random() * MAX_SHUFFLE_SEED);
}

function normalizeStoredSort(value: unknown): SortOption | null {
  if (typeof value !== 'string') return null;
  if (value === 'recent' || value === 'date') return 'createdAt';
  if (value === 'name') return 'pathname';
  return isAssetSortBy(value) ? value : null;
}

function normalizeStoredDirection(value: unknown): SortDirection | null {
  return typeof value === 'string' && isAssetSortDirection(value) ? value : null;
}

interface SortPreferences {
  sortBy: SortOption;
  direction: SortDirection;
  shuffleSeed?: number;
}

interface InitialSortPreferences extends SortPreferences {
  shouldClearStoredPreferences: boolean;
}

function createDefaultSortPreferences(): InitialSortPreferences {
  return {
    sortBy: 'shuffle',
    direction: 'desc',
    shuffleSeed: createShuffleSeed(),
    shouldClearStoredPreferences: false,
  };
}

function readInitialSortPreferences(): InitialSortPreferences {
  const defaults = createDefaultSortPreferences();

  if (typeof window === 'undefined') return defaults;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaults;

    const parsed = JSON.parse(stored) as Partial<SortPreferences>;
    const normalizedSort = normalizeStoredSort(parsed.sortBy);
    const normalizedDirection = normalizeStoredDirection(parsed.direction);

    if (!normalizedSort || !normalizedDirection) {
      return {
        ...defaults,
        shouldClearStoredPreferences: true,
      };
    }

    const storedSeed =
      normalizedSort === 'shuffle' && typeof parsed.shuffleSeed === 'number'
        ? parsed.shuffleSeed
        : undefined;

    return {
      sortBy: normalizedSort,
      direction: normalizedDirection,
      shuffleSeed: normalizedSort === 'shuffle' ? storedSeed ?? createShuffleSeed() : undefined,
      shouldClearStoredPreferences: false,
    };
  } catch (error) {
    console.error('Failed to load sort preferences:', error);
    return {
      ...defaults,
      shouldClearStoredPreferences: true,
    };
  }
}

/**
 * Hook to manage sort preferences with localStorage persistence
 * Includes 100ms debounced writes to avoid excessive localStorage updates
 */
export function useSortPreferences() {
  const [initialPreferences] = useState(() => readInitialSortPreferences());
  const [sortBy, setSortBy] = useState<SortOption>(initialPreferences.sortBy);
  const [direction, setDirection] = useState<SortDirection>(initialPreferences.direction);
  const [shuffleSeed, setShuffleSeed] = useState<number | undefined>(
    initialPreferences.shuffleSeed
  );
  const isMountedRef = useRef(false);
  const isLoading = false;

  // Debounce the preferences for localStorage writes
  const debouncedPreferences = useDebounce(
    { sortBy, direction, shuffleSeed },
    DEBOUNCE_DELAY
  );

  useEffect(() => {
    if (initialPreferences.shouldClearStoredPreferences && typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [initialPreferences.shouldClearStoredPreferences]);

  // Save debounced preferences to localStorage
  useEffect(() => {
    // Skip saving on initial mount to avoid overwriting loaded preferences
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }

    if (typeof window === 'undefined') return;

    try {
      const preferences: SortPreferences = {
        sortBy: debouncedPreferences.sortBy,
        direction: debouncedPreferences.direction,
        shuffleSeed: debouncedPreferences.shuffleSeed,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error('Failed to save sort preferences:', error);
    }
  }, [debouncedPreferences]);

  /**
   * Update sort preferences and generate new shuffle seed if needed.
   *
   * When switching to 'shuffle' mode, generates a random seed in range [0, MAX_SHUFFLE_SEED].
   * For all other sort modes, clears the shuffle seed to undefined.
   *
   * @param newSortBy - The sort option to apply ('createdAt', 'updatedAt', 'size', 'pathname', 'shuffle')
   * @param newDirection - The sort direction ('asc' or 'desc')
   */
  const handleSortChange = useCallback(
    (newSortBy: SortOption, newDirection: SortDirection) => {
      setSortBy(newSortBy);
      setDirection(newDirection);

      // Generate new seed when shuffle activated
      if (newSortBy === 'shuffle') {
        setShuffleSeed(createShuffleSeed());
      } else {
        setShuffleSeed(undefined); // Clear seed for other sorts
      }
    },
    []
  );

  /**
   * Reset all sort preferences to default values.
   *
   * Clears localStorage and resets to uniform seeded shuffle.
   */
  const resetPreferences = useCallback(() => {
    setSortBy('shuffle');
    setDirection('desc');
    setShuffleSeed(createShuffleSeed());
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  /**
   * Return the canonical API sort option.
   */
  const getSortColumn = useCallback((option: SortOption): string => {
    return option;
  }, []);

  return {
    sortBy,
    direction,
    shuffleSeed,
    isLoading,
    handleSortChange,
    resetPreferences,
    getSortColumn,
  };
}

/**
 * Type-safe sort preferences hook with default values
 * Use this when you need guaranteed non-null values
 */
export function useSortPreferencesWithDefaults() {
  const preferences = useSortPreferences();

  return {
    ...preferences,
    sortBy: preferences.sortBy || 'shuffle',
    direction: preferences.direction || 'desc',
  };
}
