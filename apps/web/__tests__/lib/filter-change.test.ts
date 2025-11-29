import { describe, it, expect } from 'vitest';
import {
  haveFiltersChanged,
  type LibraryFilterSnapshot,
} from '@/lib/filter-change';

const baseSnapshot: LibraryFilterSnapshot = {
  tagId: null,
  favorites: false,
  sortBy: 'createdAt',
  sortDirection: 'desc',
  uiSortBy: 'recent',
  shuffleSeed: undefined,
};

describe('haveFiltersChanged', () => {
  it('returns false when snapshots match', () => {
    expect(haveFiltersChanged(baseSnapshot, { ...baseSnapshot })).toBe(false);
  });

  it('detects shuffle activation even when DB column stays createdAt', () => {
    const prev = { ...baseSnapshot };
    const current: LibraryFilterSnapshot = {
      ...baseSnapshot,
      uiSortBy: 'shuffle',
      shuffleSeed: 42,
    };

    expect(haveFiltersChanged(prev, current)).toBe(true);
  });

  it('detects shuffle reseed while keeping same direction', () => {
    const prev: LibraryFilterSnapshot = {
      ...baseSnapshot,
      uiSortBy: 'shuffle',
      shuffleSeed: 100,
    };
    const current: LibraryFilterSnapshot = {
      ...prev,
      shuffleSeed: 101,
    };

    expect(haveFiltersChanged(prev, current)).toBe(true);
  });

  it('detects direction flips', () => {
    const prev = { ...baseSnapshot };
    const current = { ...baseSnapshot, sortDirection: 'asc' as const };

    expect(haveFiltersChanged(prev, current)).toBe(true);
  });
});

