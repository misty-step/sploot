'use client';

import { Suspense } from 'react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Image from 'next/image';
import { useAssets, useSearchAssets } from '@/hooks/use-assets';
import { useAuthActions } from '@/lib/auth/client';
import { ImageGrid } from '@/components/library/image-grid';
import { getMobileFeedDockPaddingClass } from '@/components/library/image-grid-layout';
import { ImageGridErrorBoundary } from '@/components/library/image-grid-error-boundary';
import { MobileCommandDock } from '@/components/chrome/mobile-command-dock';
import { AssetIntegrityBanner } from '@/components/library/asset-integrity-banner';
import { SearchBar, SearchLoadingScreen, SimilarityScoreLegend, QuerySyntaxIndicator } from '@/components/search';
import { cn } from '@/lib/utils';
import { UploadZone } from '@/components/upload/upload-zone';
import { Heart } from 'lucide-react';
import { showToast } from '@/components/ui/toast';
import { getEmbeddingQueueManager } from '@/lib/embedding-queue';
import { ShareButton } from '@/components/library/share-button';
import { error as logError } from '@/lib/logger';
import type { EmbeddingQueueItem } from '@/lib/embedding-queue';
import { useKeyboardShortcut, useSearchShortcut, useSlashSearchShortcut } from '@/hooks/use-keyboard-shortcut';
import { CommandPalette, useCommandPalette } from '@/components/chrome/command-palette';
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from '@/components/chrome/keyboard-shortcuts-help';
import { useSortPreferences } from '@/hooks/use-sort-preferences';
import { useFilter } from '@/contexts/filter-context';
import { UploadButton } from '@/components/chrome/upload-button';
import { FilterChips, type FilterType } from '@/components/chrome/filter-chips';
import { SortDropdown } from '@/components/chrome/sort-dropdown';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StickerTab } from '@/components/sploot';
import { RotateCcw, Shuffle, X, Trash2 } from 'lucide-react';
import { DeleteConfirmationModal, useDeleteConfirmation } from '@/components/ui/delete-confirmation-modal';
import { track } from '@/lib/analytics';
import { logger } from '@/lib/observability-logger';
import { haveFiltersChanged, type LibraryFilterSnapshot } from '@/lib/filter-change';

function AppPageClient() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryParam = searchParams.get('q') ?? '';

  // Use filter context for centralized filter state
  const {
    filterType,
    tagId: tagIdParam,
    tagName: contextTagName,
    isBangersOnly: bangersOnly,
    toggleBangers,
    clearTagFilter,
    setTagFilter,
  } = useFilter();

  const [isClient, setIsClient] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [showMetadata, setShowMetadata] = useState(false);

  // Command palette state
  const { isOpen: isCommandPaletteOpen, openPalette, closePalette } = useCommandPalette();

  // Keyboard shortcuts help state
  const { isOpen: isHelpOpen, openHelp, closeHelp } = useKeyboardShortcutsHelp();

  // Delete confirmation modal state
  const {
    isOpen: isDeleteModalOpen,
    targetAsset: deleteTargetAsset,
    loading: isDeleting,
    setLoading: setIsDeleting,
    openConfirmation: openDeleteConfirmation,
    closeConfirmation: closeDeleteConfirmation,
  } = useDeleteConfirmation();

  // Use sort preferences hook with localStorage persistence and debouncing
  const { sortBy, direction: sortOrder, shuffleSeed, handleSortChange, getSortColumn } = useSortPreferences();
  const [failedEmbeddings, setFailedEmbeddings] = useState<EmbeddingQueueItem[]>([]);
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [retryProgress, setRetryProgress] = useState({ current: 0, total: 0, processing: false });

  // Local state for search query (separate from URL to prevent remounts)
  const [localSearchQuery, setLocalSearchQuery] = useState<string>(queryParam);
  const isTypingRef = useRef<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Use local state for search, URL for persistence/sharing
  const libraryQuery = localSearchQuery;
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(Boolean(queryParam));
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const filtersRef = useRef<LibraryFilterSnapshot | undefined>(undefined);
  const pendingRefreshRef = useRef<boolean>(false);

  // Get the actual database column for sorting
  const actualSortBy = getSortColumn(sortBy);
  const actualSortOrder = sortOrder;

  // Sync URL parameter to local state (for browser navigation)
  // but NOT during typing to prevent sync loops
  useEffect(() => {
    if (!isTypingRef.current) {
      setLocalSearchQuery(queryParam);
    }
  }, [queryParam]);

  // Removed useEffect that was causing circular updates - URL params are now the single source of truth
  const updateUrlParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      const target = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      router.replace(target, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const uploadParam = searchParams.get('upload');

  useEffect(() => {
    if (uploadParam === '1') {
      setShowUploadPanel(true);
      updateUrlParams({ upload: null });
    }
  }, [uploadParam, updateUrlParams]);

  const {
    assets,
    loading,
    hasMore,
    total,
    integrityIssue,
    error: libraryError,
    loadAssets,
    updateAsset,
    deleteAsset,
    refresh,
  } = useAssets({
    initialLimit: 100,
    sortBy: sortBy,
    sortOrder: sortOrder,
    autoLoad: true,
    filterFavorites: bangersOnly ? true : undefined,
    tagId: tagIdParam ?? undefined,
    shuffleSeed,
  });

  // Listen for asset upload events and refresh the library
  useEffect(() => {
    const handleAssetUploaded = (event: CustomEvent) => {
      logger.logInfo('library.asset-uploaded-refresh', {
        detail: event.detail,
      });

      // Refresh the asset list
      refresh();

      // Note: Toast removed to avoid duplicates - onUploadComplete shows summary toast
    };

    // Listen for the custom event from upload zone
    window.addEventListener('assetUploaded', handleAssetUploaded as EventListener);

    return () => {
      window.removeEventListener('assetUploaded', handleAssetUploaded as EventListener);
    };
  }, [refresh]);

  const {
    assets: searchAssets,
    loading: searchLoading,
    error: searchError,
    updateAsset: updateSearchAsset,
    deleteAsset: deleteSearchAsset,
    search: runInlineSearch,
    metadata: searchMetadata,
  } = useSearchAssets(libraryQuery, { limit: 50, threshold: 0.2, shuffleSeed });

  // Set isClient flag once mounted
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Global keyboard shortcut to focus search (Cmd+K / Ctrl+K)
  const focusSearchBar = useCallback(() => {
    // Focus the search input using a query selector since we can't easily pass refs through all components
    const searchInput = document.querySelector('[data-search-bar] input') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
      searchInput.select(); // Select all text for quick replacement
    }
  }, []);

  // Replace search shortcut with command palette
  useSearchShortcut(openPalette);

  // Also add "/" key shortcut to focus search
  useSlashSearchShortcut(focusSearchBar);

  // Monitor failed embeddings
  useEffect(() => {
    const checkFailedEmbeddings = () => {
      const manager = getEmbeddingQueueManager();
      const failed = manager.getFailedItems();
      setFailedEmbeddings(failed);
    };

    // Check immediately
    checkFailedEmbeddings();

    // Check periodically
    const interval = setInterval(checkFailedEmbeddings, 5000);

    // Subscribe to queue events
    const unsubscribe = getEmbeddingQueueManager().subscribe((event) => {
      if (event.type === 'failed' || event.type === 'completed') {
        checkFailedEmbeddings();
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // Handle bulk retry
  const handleBulkRetry = useCallback(() => {
    const manager = getEmbeddingQueueManager();
    const failedItems = manager.getFailedItems();

    if (failedItems.length === 0) return;

    setShowRetryModal(true);
    setRetryProgress({ current: 0, total: failedItems.length, processing: true });

    // Track progress
    const unsubscribe = manager.subscribe((event) => {
      if (event.type === 'completed' || event.type === 'failed') {
        const failed = manager.getFailedItems();
        const completed = failedItems.length - failed.length;
        setRetryProgress((prev) => ({ ...prev, current: completed }));

        // Close modal when all done
        if (completed >= failedItems.length || failed.length === 0) {
          setTimeout(() => {
            setShowRetryModal(false);
            setRetryProgress({ current: 0, total: 0, processing: false });
            showToast(
              `[COMPLETE] Retried ${completed} ${completed === 1 ? 'meme' : 'memes'}`,
              'complete',
              3000
            );
          }, 1000);
        }
      }
    });

    // Trigger retry
    manager.retryFailed();

    // Cleanup after 30 seconds (safety timeout)
    const timeout = setTimeout(() => {
      unsubscribe();
      setShowRetryModal(false);
      setRetryProgress({ current: 0, total: 0, processing: false });
    }, 30000);

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  // Calculate stats
  const stats = useMemo(() => {
    const favoriteCount = assets.filter(a => a.favorite).length;
    const totalSize = assets.reduce((sum, asset) => sum + (asset.size || 0), 0);

    // Format file size
    const formatSize = (bytes: number) => {
      if (bytes === 0) return '0 B';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    };

    return {
      total,
      favorites: favoriteCount,
      sizeFormatted: formatSize(totalSize)
    };
  }, [assets, total]);

  const filteredSearchAssets = useMemo(() => {
    let results = searchAssets;
    if (bangersOnly) {
      results = results.filter((asset) => asset.favorite);
    }
    if (tagIdParam) {
      results = results.filter((asset) => asset.tags?.some((tag) => tag.id === tagIdParam));
    }
    return results;
  }, [searchAssets, bangersOnly, tagIdParam]);

  const searchHitCount = filteredSearchAssets.length;

  // Update tag name when we have the asset data
  useEffect(() => {
    if (!tagIdParam || contextTagName) return;
    const fromAssets = [...assets, ...searchAssets].find((asset) =>
      asset.tags?.some((tag) => tag.id === tagIdParam)
    );
    const tagName = fromAssets?.tags?.find((tag) => tag.id === tagIdParam)?.name ?? null;
    if (tagName && tagName !== contextTagName) {
      setTagFilter(tagIdParam, tagName);
    }
  }, [assets, searchAssets, tagIdParam, contextTagName, setTagFilter]);

  const activeTagName = contextTagName;

  const lastResultsTrackedRef = useRef<string | null>(null);
  const lastNoResultsTrackedRef = useRef<string | null>(null);

  const handleInlineSearch = useCallback((searchCommand: { query: string; timestamp: number; updateUrl?: boolean }) => {
    const query = searchCommand.query;

    // Always update local state immediately for instant search
    setLocalSearchQuery(query);

    // Set typing flag and clear it after delay
    isTypingRef.current = true;
    setTimeout(() => {
      isTypingRef.current = false;
    }, 1000);

    // Update URL only when explicitly requested (on Enter key)
    if (searchCommand.updateUrl === true) {
      updateUrlParams({ q: query ? query : null });
      const trimmed = query.trim();
      if (trimmed.length > 0) {
        track({
          name: 'search_query_submitted',
          properties: {
            queryLength: trimmed.length,
            hasFilters: Boolean(bangersOnly || tagIdParam),
          },
        });
      }
    }
  }, [updateUrlParams, bangersOnly, tagIdParam]);

  // Use filter actions from context (they handle URL updates internally)
  const toggleBangersOnly = toggleBangers;

  const handleScrollContainerReady = useCallback((node: HTMLDivElement | null) => {
    gridScrollRef.current = node;
  }, []);

  const captureScrollPosition = useCallback(() => {
    if (gridScrollRef.current) {
      pendingScrollTopRef.current = gridScrollRef.current.scrollTop;
      return;
    }

    if (typeof document !== 'undefined' && document.scrollingElement) {
      pendingScrollTopRef.current = (document.scrollingElement as HTMLElement).scrollTop;
      return;
    }

    if (typeof window !== 'undefined') {
      pendingScrollTopRef.current = window.scrollY;
    }
  }, []);

  const restoreScrollPosition = useCallback(() => {
    if (pendingScrollTopRef.current == null) return;

    const docScrollElement =
      typeof document !== 'undefined' ? (document.scrollingElement as HTMLElement | null) : null;
    const target = gridScrollRef.current || docScrollElement;

    const desiredTop = pendingScrollTopRef.current;
    pendingScrollTopRef.current = null;

    if (target) {
      target.scrollTo({ top: desiredTop });
      return;
    }

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: desiredTop });
    }
  }, []);

  // ? for keyboard shortcuts help
  useKeyboardShortcut({
    key: '?',
    callback: openHelp,
    enabled: true,
  });

  const gridContainerClassName = cn(
    'h-full overflow-y-auto overflow-x-hidden',
    getMobileFeedDockPaddingClass(failedEmbeddings.length)
  );
  const handleBangersFilterChange = useCallback((filter: FilterType) => {
    if (filter === 'bangers') {
      if (!bangersOnly) toggleBangers();
    } else if (filter === 'all') {
      if (bangersOnly) toggleBangers();
    }
  }, [bangersOnly, toggleBangers]);

  // Sort assets by filename if needed (shuffle now handled server-side)
  const sortedAssets = useMemo(() => {
    // Shuffle: handled server-side via API
    if (sortBy === 'shuffle') {
      return assets; // Use server-provided order
    }

    // Name sorting: client-side since DB doesn't support it
    if (sortBy === 'pathname') {
      const sorted = [...assets].sort((a, b) => {
        const nameA = a.filename.toLowerCase();
        const nameB = b.filename.toLowerCase();

        if (actualSortOrder === 'asc') {
          return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
        } else {
          return nameA > nameB ? -1 : nameA < nameB ? 1 : 0;
        }
      });
      return sorted;
    }

    // All other sorts handled by API
    return assets;
  }, [assets, sortBy, actualSortOrder]);

  const trimmedLibraryQuery = libraryQuery.trim();
  const isSearching = trimmedLibraryQuery.length > 0;
  const showMobileSearch = isMobileSearchOpen || isSearching;

  const activeAssets = useMemo(() => {
    if (isSearching) {
      return filteredSearchAssets;
    }
    return sortedAssets;
  }, [isSearching, filteredSearchAssets, sortedAssets]);

  const activeLoading = isSearching ? searchLoading : loading;
  const activeHasMore = hasMore;

  const handleLoadMore = useCallback(() => {
    loadAssets();
  }, [loadAssets]);

  const handleAssetUpdate = useCallback(
    (id: string, updates: Partial<(typeof assets)[number]>) => {
      updateAsset(id, updates);
      updateSearchAsset(id, updates);
    },
    [updateAsset, updateSearchAsset]
  );

  const handleAssetDelete = useCallback(
    (id: string) => {
      deleteAsset(id);
      deleteSearchAsset(id);
    },
    [deleteAsset, deleteSearchAsset]
  );

  useEffect(() => {
    if (!isSearching) {
      lastResultsTrackedRef.current = null;
      lastNoResultsTrackedRef.current = null;
      return;
    }

    if (searchLoading || searchError) {
      return;
    }

    const query = trimmedLibraryQuery;
    if (!query) {
      return;
    }

    const hasFilters = Boolean(bangersOnly || tagIdParam);

    if (filteredSearchAssets.length > 0) {
      const key = `${query}|${filteredSearchAssets.map((asset) => asset.id).join(',')}`;
      if (lastResultsTrackedRef.current !== key) {
        track({
          name: 'search_results_shown',
          properties: {
            count: filteredSearchAssets.length,
            latency: searchMetadata?.latencyMs ?? 0,
            hasFilters,
          },
        });
        lastResultsTrackedRef.current = key;
        lastNoResultsTrackedRef.current = null;
      }
    } else {
      if (lastNoResultsTrackedRef.current !== query) {
        track({
          name: 'search_no_results',
          properties: {
            query,
          },
        });
        lastNoResultsTrackedRef.current = query;
        lastResultsTrackedRef.current = null;
      }
    }
  }, [
    isSearching,
    searchLoading,
    searchError,
    filteredSearchAssets,
    trimmedLibraryQuery,
    searchMetadata?.latencyMs,
    bangersOnly,
    tagIdParam,
  ]);

  const handleAssetSelect = useCallback(
    (asset: any) => {
      if (isSearching) {
        const index = filteredSearchAssets.findIndex((candidate) => candidate.id === asset.id);
        const score =
          Number(
            (asset as any)?.similarity ??
              (index >= 0 ? filteredSearchAssets[index]?.similarity : 0)
          ) || 0;
        track({
          name: 'search_result_clicked',
          properties: {
            position: index >= 0 ? index + 1 : 0,
            score,
            assetId: asset.id,
          },
        });
      }

      router.push(`/app/meme/${asset.id}`);
    },
    [filteredSearchAssets, isSearching, router]
  );

  // Handler for performing the actual delete with modal integration
  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      setIsDeleting(true);
      try {
        const res = await fetch(`/api/assets/${assetId}`, {
          method: 'DELETE',
        });

        if (res.ok) {
          // Close lightbox modal if open
          if (selectedAsset?.id === assetId) {
            setSelectedAsset(null);
          }
          // Close delete confirmation modal
          closeDeleteConfirmation();
          // Update grid state
          handleAssetDelete(assetId);
          showToast('Asset deleted', 'success');
        } else {
          throw new Error('Delete request failed');
        }
      } catch (error) {
        logError('Failed to delete asset:', error);
        showToast('Failed to delete asset', 'error');
      } finally {
        setIsDeleting(false);
      }
    },
    [selectedAsset, setIsDeleting, closeDeleteConfirmation, handleAssetDelete]
  );

  // Trigger refresh when filters or sort preferences change
  useEffect(() => {
    const prev = filtersRef.current;
    const current: LibraryFilterSnapshot = {
      tagId: tagIdParam ?? null,
      favorites: bangersOnly,
      sortBy: actualSortBy,
      sortDirection: actualSortOrder,
      uiSortBy: sortBy,
      shuffleSeed: sortBy === 'shuffle' ? shuffleSeed : undefined,
    };

    if (!prev) {
      filtersRef.current = current;
      return;
    }

    const filtersChanged = haveFiltersChanged(prev, current);

    if (filtersChanged) {
      if (isSearching) {
        pendingRefreshRef.current = true;
      } else {
        refresh();
        pendingRefreshRef.current = false;
      }
    } else if (!isSearching && pendingRefreshRef.current) {
      refresh();
      pendingRefreshRef.current = false;
    }

    filtersRef.current = current;
  }, [tagIdParam, bangersOnly, actualSortBy, actualSortOrder, sortBy, shuffleSeed, isSearching, refresh]);

  useEffect(() => {
    if (!trimmedLibraryQuery) {
      return;
    }
    setSelectedAsset(null);
  }, [trimmedLibraryQuery]);

  // Reset metadata visibility when modal opens/closes
  useEffect(() => {
    setShowMetadata(false);
  }, [selectedAsset]);

  return (
    <div className="flex h-[calc(100vh-48px)] md:h-[calc(100vh-56px)] flex-col">
      {/* Container with ultra-wide support - max-width at 1920px+ */}
      <div className="border-b-[3px] border-sploot-cyan px-3 pb-3 pt-3 md:border-b-[6px] md:px-10 md:pb-8 md:pt-8 2xl:px-12">
        <div className="mx-auto w-full max-w-7xl 2xl:max-w-[1920px]">
          <header className="flex flex-col gap-2 md:gap-6">
            {/* Terminal-style status bar */}
            {stats.total > 0 && (
              <div className="hidden md:flex font-mono text-sm brutalist-border border-border bg-card p-3 items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground uppercase">MEMES:</span>
                  <span className="font-bold text-sploot-cyan">{stats.total.toLocaleString()}</span>
                </div>
                {stats.favorites > 0 && (
                  <>
                    <span className="text-border">|</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground uppercase">BANGERS:</span>
                      <span className="font-bold text-sploot-coral">{stats.favorites.toLocaleString()}</span>
                    </div>
                  </>
                )}
                <span className="text-border">|</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground uppercase">SIZE:</span>
                  <span className="font-bold text-sploot-violet">{stats.sizeFormatted}</span>
                </div>
              </div>
            )}

            <div className={cn('md:block', showMobileSearch ? 'block' : 'hidden')}>
              <SearchBar
                onSearch={handleInlineSearch}
                inline
                initialQuery={queryParam}
                searchState={
                  searchLoading ? 'loading' :
                    isTypingRef.current ? 'typing' :
                      libraryQuery && searchAssets.length > 0 ? 'success' :
                        libraryQuery && searchAssets.length === 0 ? 'no-results' :
                          searchError ? 'error' :
                            'idle'
                }
                resultCount={searchAssets.length}
                className="w-full"
                placeholder="search your memes..."
                autoFocus={showMobileSearch && !isSearching}
              />
            </div>

            {/* Action toolbar */}
            <div className="hidden flex-wrap items-center justify-between gap-2 md:flex md:gap-3">
              {/* Left group: Primary actions */}
              <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                <UploadButton
                  onClick={() => setShowUploadPanel((prev) => !prev)}
                  isActive={showUploadPanel}
                  size="sm"
                  showLabel={false}
                  className="md:hidden"
                />
                <UploadButton
                  onClick={() => setShowUploadPanel((prev) => !prev)}
                  isActive={showUploadPanel}
                  size="lg"
                  showLabel={true}
                  className="hidden md:inline-flex"
                />
                {failedEmbeddings.length > 0 && (
                  <Button
                    variant="accent"
                    size="lg"
                    onClick={handleBulkRetry}
                    className="gap-2 uppercase tracking-wider font-mono"
                  >
                    <RotateCcw className="h-4 w-4" />
                    RETRY ({failedEmbeddings.length})
                  </Button>
                )}
                <FilterChips
                  activeFilter={bangersOnly ? 'bangers' : 'all'}
                  onFilterChange={handleBangersFilterChange}
                  size="lg"
                  showLabels={true}
                  className="hidden md:flex"
                />
              </div>

              {/* Right group: View controls */}
              <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                <SortDropdown
                  value={sortBy}
                  direction={sortOrder}
                  onChange={handleSortChange}
                  className="hidden md:inline-flex"
                />

                <Button
                  variant={sortBy === 'shuffle' ? 'accent' : 'outline'}
                  size="lg"
                  onClick={() => {
                    handleSortChange('shuffle', 'desc');
                    requestAnimationFrame(() => {
                      gridScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    });
                  }}
                  className="hidden gap-2 font-mono uppercase tracking-wider md:inline-flex"
                  aria-pressed={sortBy === 'shuffle'}
                >
                  <Shuffle className="h-4 w-4" />
                  shuffle
                </Button>

                {tagIdParam && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={clearTagFilter}
                    className="gap-1"
                  >
                    <X className="h-4 w-4" />
                    <span className="hidden sm:inline">clear</span>
                    <span>#{activeTagName ?? 'tag'}</span>
                  </Button>
                )}
              </div>

            </div>

            {(!isSearching && tagIdParam) && (
              <div className="flex flex-wrap items-center gap-2">
                <StickerTab tone="violet">
                  filtering tag #{activeTagName ?? tagIdParam.slice(0, 6)}
                </StickerTab>
              </div>
            )}

            {showUploadPanel && (
              <div className="border border-dashed border-border bg-muted p-3 md:p-5">
                <UploadZone
                  isOnDashboard={true}
                  onUploadComplete={(stats) => {
                    // Refresh the gallery
                    refresh();

                    // Show brief success toast
                    if (stats.uploaded > 0) {
                      showToast(
                        `✓ ${stats.uploaded} ${stats.uploaded === 1 ? 'file' : 'files'} uploaded`,
                        'success',
                        2000
                      );
                    }

                    // Auto-close upload panel after brief delay
                    setTimeout(() => setShowUploadPanel(false), 2000);
                  }}
                />
              </div>
            )}

            {isSearching && (
              <div className="space-y-3">
                {/* Query Syntax Indicator */}
                {!searchError && !searchLoading && (
                  <QuerySyntaxIndicator
                    query={trimmedLibraryQuery}
                    resultCount={searchHitCount}
                    filters={{
                      favorites: bangersOnly || undefined,
                      tagName: activeTagName || undefined,
                    }}
                    latencyMs={searchMetadata?.latencyMs}
                  />
                )}

                {searchError && (
                  <Alert variant="destructive">
                    <AlertDescription>{searchError}</AlertDescription>
                  </Alert>
                )}

                {!searchError && !searchLoading && filteredSearchAssets.length > 0 && (
                  <>
                    <Alert>
                      <AlertDescription className="flex flex-col gap-1">
                        <span>
                          showing <span className="font-semibold">{searchHitCount}</span> matches for &quot;<span className="font-medium">{trimmedLibraryQuery}</span>&quot;
                        </span>
                        {searchMetadata?.thresholdFallback && (
                          <span className="text-xs text-muted-foreground">
                            pulled a few low-similarity results to avoid empty results.
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                    <SimilarityScoreLegend />
                  </>
                )}

                {!searchError && !searchLoading && searchHitCount === 0 && (
                  <Alert>
                    <AlertDescription>
                      no matches yet for &quot;<span className="font-medium">{trimmedLibraryQuery}</span>&quot;. try adjusting your search.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {!isSearching && libraryError && (
              <Alert variant="destructive">
                <AlertDescription>{libraryError}</AlertDescription>
              </Alert>
            )}
          </header>
        </div>
      </div>

      {/* Asset integrity warning banner */}
      {integrityIssue && !libraryQuery && (
        <AssetIntegrityBanner
          onAudit={() => {
            // Open audit endpoint in new tab
            window.open('/api/assets/audit', '_blank');
          }}
        />
      )}

      {/* Show loading screen when search is executing */}
      {searchLoading && libraryQuery ? (
        <SearchLoadingScreen query={libraryQuery} />
      ) : (
        <div className="flex-1 overflow-hidden">
          <div className="mx-auto flex h-full w-full flex-col overflow-hidden 2xl:max-w-[1920px]">
            <div className="h-full flex-1 overflow-hidden">
              <ImageGridErrorBoundary
                onRetry={isSearching ? () => runInlineSearch() : () => loadAssets()}
              >
                <ImageGrid
                  assets={activeAssets}
                  loading={activeLoading}
                  hasMore={activeHasMore}
                  onLoadMore={handleLoadMore}
                  onAssetUpdate={handleAssetUpdate}
                  onAssetDelete={handleAssetDelete}
                  onAssetSelect={handleAssetSelect}
                  containerClassName={cn(gridContainerClassName, 'w-full')}
                  onScrollContainerReady={handleScrollContainerReady}
                  onUploadClick={() => setShowUploadPanel(true)}
                  showSimilarityScores={isSearching}
                />
              </ImageGridErrorBoundary>
            </div>
          </div>
        </div>
      )}

      <MobileCommandDock
        activeFilter={bangersOnly ? 'bangers' : 'all'}
        failedEmbeddingsCount={failedEmbeddings.length}
        isSearchOpen={showMobileSearch}
        isShuffleActive={sortBy === 'shuffle'}
        isUploadOpen={showUploadPanel}
        onFilterChange={handleBangersFilterChange}
        onRetryFailed={failedEmbeddings.length > 0 ? handleBulkRetry : undefined}
        onSearchToggle={() => {
          if (showMobileSearch && !isSearching) {
            setIsMobileSearchOpen(false);
            return;
          }
          setIsMobileSearchOpen(true);
          requestAnimationFrame(focusSearchBar);
        }}
        onShuffle={() => {
          handleSortChange('shuffle', 'desc');
          requestAnimationFrame(() => {
            gridScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          });
        }}
        onSortChange={handleSortChange}
        onUploadClick={() => setShowUploadPanel((prev) => !prev)}
        sortBy={sortBy}
        sortOrder={sortOrder}
      />

      {/* Image Preview Modal */}
      {selectedAsset && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedAsset(null)}
        >
          {/* Top action bar - all controls in one row */}
          <div className="fixed top-[calc(1rem+env(safe-area-inset-top))] left-[calc(1rem+env(safe-area-inset-left))] right-[calc(1rem+env(safe-area-inset-right))] flex items-center justify-between z-[60]">
            {/* Left side: empty for now, could add image counter later */}
            <div />

            {/* Right side: Action buttons + Close */}
            <div className="flex items-center gap-2">
              {/* Favorite button */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-10 w-10 bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 hover:text-sploot-coral',
                  selectedAsset.favorite && 'text-sploot-coral hover:text-sploot-coral'
                )}
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const res = await fetch(`/api/assets/${selectedAsset.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ favorite: !selectedAsset.favorite }),
                    });

                    if (res.ok) {
                      // Update modal state
                      setSelectedAsset({ ...selectedAsset, favorite: !selectedAsset.favorite });
                      // Update grid state
                      handleAssetUpdate(selectedAsset.id, { favorite: !selectedAsset.favorite });
                    }
                  } catch (error) {
                    logError('Failed to toggle favorite:', error);
                  }
                }}
                aria-label={selectedAsset.favorite ? 'Remove from bangers' : 'Add to bangers'}
              >
                <Heart className={cn('h-5 w-5', selectedAsset.favorite && 'fill-current')} />
              </Button>

              {/* Share button */}
              <ShareButton
                assetId={selectedAsset.id}
                blobUrl={selectedAsset.blobUrl}
                filename={selectedAsset.filename}
                mimeType={selectedAsset.mime}
                variant="ghost"
                size="icon"
                className="h-10 w-10 bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 hover:text-sploot-cyan"
              />

              {/* Delete button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 hover:text-red-500"
                onClick={(e) => {
                  e.stopPropagation();
                  // Check if skip confirmation preference is set
                  const shouldSkip = openDeleteConfirmation({
                    id: selectedAsset.id,
                    imageUrl: selectedAsset.thumbnailUrl || selectedAsset.blobUrl,
                    imageName: selectedAsset.filename,
                  });

                  // If skip preference is set, delete immediately
                  if (shouldSkip) {
                    handleDeleteAsset(selectedAsset.id);
                  }
                }}
                aria-label="Delete meme"
              >
                <Trash2 className="h-5 w-5" />
              </Button>

              {/* Close button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedAsset(null);
                }}
                className="h-10 w-10 bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 hover:text-white"
                aria-label="Close preview"
              >
                <X className="w-6 h-6" />
              </Button>
            </div>
          </div>

          <div
            className="max-w-4xl max-h-[90vh] relative"
            onClick={(e) => e.stopPropagation()}
            onMouseMove={() => setShowMetadata(true)}
            onMouseLeave={() => setShowMetadata(false)}
          >
            <div className="relative w-full h-full">
              <Image
                src={selectedAsset.blobUrl}
                alt={selectedAsset.filename}
                width={1920}
                height={1080}
                className="max-w-full max-h-[90vh] object-contain"
                priority
              />
            </div>

            {/* Metadata overlay - shows on hover */}
            <div className={cn(
              "absolute bottom-4 left-4 right-4 bg-black/50 backdrop-blur-sm p-4 transition-opacity duration-300",
              showMetadata ? 'opacity-100' : 'opacity-0'
            )}>
              <p className="text-white font-medium">{selectedAsset.filename}</p>
              <p className="text-white/80 text-sm mt-1">
                {selectedAsset.width}×{selectedAsset.height} • {selectedAsset.mime.split('/')[1].toUpperCase()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Retry Progress Modal */}
      {showRetryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              regenerating embeddings
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="relative w-24 h-24">
                  <svg className="w-24 h-24 transform -rotate-90">
                    <circle
                      cx="48"
                      cy="48"
                      r="36"
                      className="stroke-border"
                      strokeWidth="8"
                      fill="none"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="36"
                      className="stroke-primary"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={226}
                      strokeDashoffset={226 - (226 * retryProgress.current) / retryProgress.total}
                      style={{ transition: 'stroke-dashoffset 500ms ease-out' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-foreground">
                      {retryProgress.current}/{retryProgress.total}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">progress</span>
                  <span className="text-foreground font-medium">
                    {Math.round((retryProgress.current / retryProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-muted h-2 overflow-hidden">
                  <div
                    className="bg-green-600 h-full transition-all duration-500 ease-out"
                    style={{ width: `${(retryProgress.current / retryProgress.total) * 100}%` }}
                  />
                </div>
              </div>

              {retryProgress.processing && (
                <p className="text-sm text-muted-foreground text-center animate-pulse">
                  processing embeddings...
                </p>
              )}

              {!retryProgress.processing && retryProgress.current === retryProgress.total && (
                <p className="text-sm text-green-600 text-center font-medium">
                  ✓ all embeddings regenerated
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={closePalette}
        onUpload={() => router.push('/app/upload')}
        onSignOut={async () => {
          await signOut();
          router.push('/');
        }}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp
        isOpen={isHelpOpen}
        onClose={closeHelp}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteConfirmation}
        onConfirm={() => {
          if (deleteTargetAsset) {
            handleDeleteAsset(deleteTargetAsset.id);
          }
        }}
        title="Delete Image"
        description="Are you sure you want to delete this image? This action cannot be undone."
        imageUrl={deleteTargetAsset?.imageUrl}
        imageName={deleteTargetAsset?.imageName}
        loading={isDeleting}
        showDontAskAgain={true}
      />
    </div>
  );
}

export default function AppPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[calc(100vh-56px)] flex-col items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    }>
      <AppPageClient />
    </Suspense>
  );
}
