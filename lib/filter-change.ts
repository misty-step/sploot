export type SortDirectionValue = 'asc' | 'desc';
export type SortOptionValue = 'recent' | 'date' | 'size' | 'name' | 'shuffle';

export interface LibraryFilterSnapshot {
  tagId: string | null;
  favorites: boolean;
  sortBy: string;
  sortDirection: SortDirectionValue;
  uiSortBy: SortOptionValue;
  shuffleSeed?: number;
}

/**
 * Determine whether library filters changed enough to justify a refresh.
 * Includes the raw UI sort option + shuffle seed so shuffle reacts instantly.
 */
export function haveFiltersChanged(
  prev: LibraryFilterSnapshot | undefined,
  current: LibraryFilterSnapshot
): boolean {
  if (!prev) {
    return true;
  }

  return (
    prev.tagId !== current.tagId ||
    prev.favorites !== current.favorites ||
    prev.sortBy !== current.sortBy ||
    prev.sortDirection !== current.sortDirection ||
    prev.uiSortBy !== current.uiSortBy ||
    prev.shuffleSeed !== current.shuffleSeed
  );
}

