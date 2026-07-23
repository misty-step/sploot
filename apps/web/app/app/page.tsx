'use client';
import { SEARCH_DEFAULT_LIMIT, SEARCH_SIMILARITY_FLOOR } from '@/lib/search-config';

import { Suspense } from 'react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Image from 'next/image';
import { useAssets, useSearchAssets } from '@/hooks/use-assets';
import { useDebounce } from '@/hooks/use-debounce';
import { useAutomaticPiles } from '@/hooks/use-piles';
import { useAuthActions } from '@/lib/auth/client';
import { ImageGrid } from '@/components/library/image-grid';
import { getMobileFeedDockPaddingClass } from '@/components/library/image-grid-layout';
import { ImageGridErrorBoundary } from '@/components/library/image-grid-error-boundary';
import { MobileCommandDock } from '@/components/chrome/mobile-command-dock';
import { AssetIntegrityBanner } from '@/components/library/asset-integrity-banner';
import { SearchBar, SimilarityScoreLegend } from '@/components/search';
import { cn } from '@/lib/utils';
import { UploadZone } from '@/components/upload/upload-zone';
import { Heart } from 'lucide-react';
import { showToast } from '@/components/ui/toast';
import { getEmbeddingQueueManager } from '@/lib/embedding-queue';
import { ShareButton } from '@/components/library/share-button';
import { error as logError } from '@/lib/logger';
import type { EmbeddingQueueItem } from '@/lib/embedding-queue';
import { useSearchShortcut, useSlashSearchShortcut } from '@/hooks/use-keyboard-shortcut';
import { CommandPalette, useCommandPalette } from '@/components/chrome/command-palette';
import { useSortPreferences } from '@/hooks/use-sort-preferences';
import { useFilter } from '@/contexts/filter-context';
import { type FilterType } from '@/components/chrome/filter-chips';
import { Button } from '@/components/ui/button';
import {
  PileFilterRail,
  GalleryMobileStatusline,
  GallerySpine,
  IconButton,
  QueryTokenHighlight,
} from '@/components/sploot';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { X, Trash2 } from 'lucide-react';
import { DeleteConfirmationModal, useDeleteConfirmation } from '@/components/ui/delete-confirmation-modal';
import { track } from '@/lib/analytics';
import { logger } from '@/lib/observability-logger';
import { haveFiltersChanged, type LibraryFilterSnapshot } from '@/lib/filter-change';
import { isAnimatedImageMimeType, isVideoMimeType } from '@sploot/common';
import { resolveQaSeedSrc } from '@/lib/qa/qa-image-loader';

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

  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);

  // Command palette state
  const { isOpen: isCommandPaletteOpen, openPalette, closePalette } = useCommandPalette();

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
  const {
    sortBy,
    direction: sortOrder,
    shuffleSeed,
    isLoading: sortPreferencesLoading,
    handleSortChange,
    getSortColumn,
  } = useSortPreferences();
  const [failedEmbeddings, setFailedEmbeddings] = useState<EmbeddingQueueItem[]>([]);
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [retryProgress, setRetryProgress] = useState({ current: 0, total: 0, processing: false });

  // Local state for search query (separate from URL to prevent remounts)
  const [localSearchQuery, setLocalSearchQuery] = useState<string>(queryParam);
  const [isTyping, setIsTyping] = useState(false);
  const isTypingRef = useRef<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Use local state for search, URL for persistence/sharing
  const libraryQuery = localSearchQuery;
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(Boolean(queryParam));
  const [selectedPileId, setSelectedPileId] = useState<string | null>(null);
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
  const consumedUploadParamRef = useRef(false);

  useEffect(() => {
    if (uploadParam !== '1' || consumedUploadParamRef.current) return;
    consumedUploadParamRef.current = true;
    setShowUploadPanel(true);
    updateUrlParams({ upload: null });
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
    autoLoad: !sortPreferencesLoading,
    filterFavorites: bangersOnly ? true : undefined,
    tagId: tagIdParam ?? undefined,
    shuffleSeed,
  });

  const debouncedLibraryQuery = useDebounce(libraryQuery, 300);

  const {
    assets: searchAssets,
    loading: searchLoading,
    error: searchError,
    updateAsset: updateSearchAsset,
    deleteAsset: deleteSearchAsset,
    search: runInlineSearch,
    hasMore: searchHasMore,
    loadMore: loadMoreSearch,
    metadata: searchMetadata,
    total: searchTotal,
    resultQuery: searchResultQuery,
  } = useSearchAssets(debouncedLibraryQuery, {
    limit: SEARCH_DEFAULT_LIMIT,
    threshold: SEARCH_SIMILARITY_FLOOR,
    favoriteOnly: bangersOnly,
    tagId: tagIdParam,
  });

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

  // Monitor failed embeddings for the retry action.
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
      checkFailedEmbeddings();
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

  // Semantic search applies favorite/tag filters in SQL before pagination and
  // total computation. Keeping the server page intact preserves global count
  // and empty-state truthfulness.
  const filteredSearchAssets = searchAssets;

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
    setIsTyping(true);
    setTimeout(() => {
      isTypingRef.current = false;
      setIsTyping(false);
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

  const scrollGridToTop = useCallback(() => {
    const behavior = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    gridScrollRef.current?.scrollTo({ top: 0, behavior });
  }, []);

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
  const searchResultIsCurrent = searchResultQuery === trimmedLibraryQuery;
  const searchHitCount = searchResultIsCurrent ? searchTotal : 0;
  const searchVisibleCount = filteredSearchAssets.length;
  const currentSearchMetadata = searchResultIsCurrent ? searchMetadata : null;
  const showMobileSearch = isMobileSearchOpen || isSearching;
  const {
    piles: automaticPiles,
    embeddedAssetCount: pileEmbeddedAssetCount,
    reload: reloadPiles,
  } = useAutomaticPiles({
    enabled: !isSearching && !bangersOnly && !tagIdParam,
    limit: 6,
    minAssets: 50,
  });

  const gallerySearchState = searchError
    ? 'error' as const
    : searchLoading || (isSearching && !searchResultIsCurrent)
      ? 'loading' as const
      : isSearching
        ? 'ready' as const
        : 'idle' as const;

  const selectedPile = useMemo(
    () => automaticPiles.find((pile) => pile.id === selectedPileId) ?? null,
    [automaticPiles, selectedPileId]
  );

  const selectedPileAssetIds = useMemo(
    () => new Set(selectedPile?.assetIds ?? []),
    [selectedPile]
  );

  // Listen for asset upload events and refresh library-derived views.
  useEffect(() => {
    const handleAssetUploaded = (event: CustomEvent) => {
      logger.logInfo('library.asset-uploaded-refresh', {
        detail: event.detail,
      });

      refresh();
      void reloadPiles();
    };

    window.addEventListener('assetUploaded', handleAssetUploaded as EventListener);

    return () => {
      window.removeEventListener('assetUploaded', handleAssetUploaded as EventListener);
    };
  }, [refresh, reloadPiles]);

  const activeAssets = useMemo(() => {
    if (isSearching) {
      return filteredSearchAssets;
    }
    if (selectedPile && selectedPileAssetIds.size > 0) {
      return sortedAssets.filter((asset) => selectedPileAssetIds.has(asset.id));
    }
    return sortedAssets;
  }, [isSearching, filteredSearchAssets, selectedPile, selectedPileAssetIds, sortedAssets]);

  const activeLoading = isSearching ? searchLoading : loading;
  const activeHasMore = isSearching ? searchHasMore : hasMore;

  const handleLoadMore = useCallback(() => {
    if (isSearching) {
      loadMoreSearch();
      return;
    }
    loadAssets();
  }, [isSearching, loadAssets, loadMoreSearch]);

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

    if (searchResultIsCurrent && filteredSearchAssets.length > 0) {
      const key = `${query}|${filteredSearchAssets.map((asset) => asset.id).join(',')}`;
      if (lastResultsTrackedRef.current !== key) {
        track({
          name: 'search_results_shown',
          properties: {
            count: filteredSearchAssets.length,
            latency: currentSearchMetadata?.latencyMs ?? 0,
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
            queryLength: query.length,
            hasFilters,
          },
        });
        lastNoResultsTrackedRef.current = query;
        lastResultsTrackedRef.current = null;
      }
    }
  }, [
    isSearching,
    searchResultIsCurrent,
    searchLoading,
    searchError,
    filteredSearchAssets,
    trimmedLibraryQuery,
    currentSearchMetadata?.latencyMs,
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
          },
        });
      }

      detailReturnFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setSelectedAsset(asset);
    },
    [filteredSearchAssets, isSearching]
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
    if (isSearching || bangersOnly || tagIdParam) {
      queueMicrotask(() => setSelectedPileId(null));
    }
  }, [bangersOnly, isSearching, tagIdParam]);

  useEffect(() => {
    if (selectedPileId && automaticPiles.length > 0 && !automaticPiles.some((pile) => pile.id === selectedPileId)) {
      queueMicrotask(() => setSelectedPileId(null));
    }
  }, [automaticPiles, selectedPileId]);

  useEffect(() => {
    if (!trimmedLibraryQuery) {
      return;
    }
    queueMicrotask(() => setSelectedAsset(null));
  }, [trimmedLibraryQuery]);

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col bg-sploot-workbench md:h-[calc(100vh-56px)]">
      <GalleryMobileStatusline
        total={total}
        query={trimmedLibraryQuery}
        loading={searchLoading || (isSearching && !searchResultIsCurrent)}
        error={searchError}
        resultCount={searchHitCount}
        latencyMs={currentSearchMetadata?.latencyMs}
        className="md:hidden"
      />
      <div className="flex min-h-0 flex-1">
        <GallerySpine
          query={libraryQuery}
          searchState={gallerySearchState}
          searchResultCount={searchHitCount}
          searchLatencyMs={currentSearchMetadata?.latencyMs}
          searchModel={currentSearchMetadata?.model}
          searchCached={currentSearchMetadata?.cached}
          searchError={searchError}
          piles={automaticPiles}
          activeFilter={bangersOnly ? 'bangers' : 'all'}
          onFilterChange={handleBangersFilterChange}
          total={total}
          embeddedAssetCount={pileEmbeddedAssetCount}
          selectedPileId={selectedPileId}
          onSearch={handleInlineSearch}
          onSelectPile={(pileId) => {
            setSelectedPileId(pileId);
            requestAnimationFrame(scrollGridToTop);
          }}
          onUpload={() => setShowUploadPanel((previous) => !previous)}
          onShuffle={() => handleSortChange('shuffle', 'desc')}
          onRetry={handleBulkRetry}
          retryCount={failedEmbeddings.length}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="border-b-[3px] border-sploot-ink bg-sploot-paper px-3 py-2 md:hidden">
            <div className={cn(showMobileSearch ? 'block' : 'hidden')}>
              <SearchBar
                onSearch={handleInlineSearch}
                inline
                initialQuery={queryParam}
                searchState={searchLoading || (isSearching && !searchResultIsCurrent) ? 'loading' : searchError ? 'error' : isSearching ? 'success' : 'idle'}
                resultCount={searchHitCount}
                className="w-full"
                placeholder="type words. get the picture."
                autoFocus={showMobileSearch && !isSearching}
              />
              <QueryTokenHighlight query={libraryQuery} />
            </div>
            {!isSearching && !bangersOnly && !tagIdParam && (
              <PileFilterRail
                piles={automaticPiles}
                total={total}
                embeddedAssetCount={pileEmbeddedAssetCount}
                selectedPileId={selectedPileId}
                onSelectPile={setSelectedPileId}
                className="mt-2"
              />
            )}
          </div>

          <div className="hidden items-center gap-3 border-b-[3px] border-sploot-ink bg-sploot-paper px-5 py-3 md:flex">
            <span className="font-mono text-[0.65rem] lowercase">{isSearching ? `matches for “${trimmedLibraryQuery}”` : 'the shelf'}</span>
            <span className="h-px flex-1 bg-sploot-ink" />
            <span aria-live="polite" className="font-mono text-[0.65rem] lowercase tabular-nums">
              {isSearching ? `${searchHitCount.toLocaleString()} matches` : `${total.toLocaleString()} in the pile`}
              {currentSearchMetadata?.latencyMs !== undefined ? ` · ${currentSearchMetadata.latencyMs} ms` : ''}
            </span>
          </div>

          {showUploadPanel && (
            <div className="animate-sploot-slide-up border-b-[3px] border-sploot-ink bg-sploot-paper-warm p-3 md:p-5">
              <UploadZone
                isOnDashboard
                onUploadComplete={(stats) => {
                  refresh();
                  void reloadPiles();
                  if (stats.uploaded > 0) showToast(`✓ ${stats.uploaded} ${stats.uploaded === 1 ? 'file' : 'files'} uploaded`, 'success', 2000);
                  setTimeout(() => setShowUploadPanel(false), 2000);
                }}
              />
            </div>
          )}

          {isSearching && searchResultIsCurrent && !searchError && !searchLoading && searchHitCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-dashed border-sploot-ink px-4 py-2">
              <span className="font-mono text-xs lowercase">
                showing {searchVisibleCount} of {searchHitCount} matches · scores are human match percentages
              </span>
              <SimilarityScoreLegend />
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            <ImageGridErrorBoundary
              onRetry={isSearching ? () => runInlineSearch() : () => loadAssets()}
            >
              <ImageGrid
                assets={activeAssets}
                loading={activeLoading}
                error={isSearching ? searchError : libraryError}
                onRetry={isSearching ? () => runInlineSearch() : () => loadAssets()}
                hasMore={activeHasMore}
                dimmed={isSearching && (!searchResultIsCurrent || searchLoading)}
                onLoadMore={handleLoadMore}
                onAssetUpdate={handleAssetUpdate}
                onAssetDelete={handleAssetDelete}
                onAssetSelect={handleAssetSelect}
                containerClassName={cn(gridContainerClassName, 'w-full')}
                onScrollContainerReady={handleScrollContainerReady}
                onUploadClick={() => setShowUploadPanel(true)}
                showSimilarityScores={isSearching}
                emptyStateVariant={isSearching && (bangersOnly || tagIdParam) ? 'filtered' : isSearching ? 'search' : (bangersOnly || tagIdParam || selectedPile) ? 'filtered' : 'first-use'}
                emptyStateSearchQuery={isSearching ? trimmedLibraryQuery : undefined}
              />
            </ImageGridErrorBoundary>
          </div>
        </main>
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
            scrollGridToTop();
          });
        }}
        onSortChange={handleSortChange}
        onUploadClick={() => setShowUploadPanel((prev) => !prev)}
        sortBy={sortBy}
        sortOrder={sortOrder}
      />

      <Dialog open={Boolean(selectedAsset)} onOpenChange={(open) => !open && setSelectedAsset(null)}>
        {selectedAsset && (
          <DialogContent
            showCloseButton={false}
            role="dialog"
            aria-modal="true"
            overlayClassName="bg-sploot-void/90"
            onEscapeKeyDown={() => setSelectedAsset(null)}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              detailReturnFocusRef.current?.focus();
            }}
            className="relative max-h-[calc(100vh-2rem)] max-w-6xl overflow-auto bg-sploot-panel p-0 sm:rounded-[var(--sploot-radius)]"
          >
            <DialogTitle className="sr-only">{selectedAsset.filename}</DialogTitle>
            <DialogDescription className="sr-only">Meme detail and actions</DialogDescription>
            <div className="flex w-full min-w-0 flex-col">
              <div className="flex items-center justify-between gap-3 border-b-[3px] border-sploot-ink px-4 py-3 pr-16">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-normal lowercase">{selectedAsset.filename}</p>
                  <p className="font-mono text-[0.65rem] lowercase text-muted-foreground">detail · esc closes</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-[var(--sploot-touch-target)] min-w-[var(--sploot-touch-target)]"
                    onClick={async () => {
                      try {
                        const favorite = !selectedAsset.favorite;
                        const res = await fetch(`/api/assets/${selectedAsset.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ favorite }),
                        });
                        if (res.ok) {
                          setSelectedAsset({ ...selectedAsset, favorite });
                          handleAssetUpdate(selectedAsset.id, { favorite });
                        }
                      } catch (error) {
                        logError('Failed to toggle favorite:', error);
                      }
                    }}
                    aria-label={selectedAsset.favorite ? 'Remove from bangers' : 'Add to bangers'}
                  >
                    <Heart className={cn('h-5 w-5', selectedAsset.favorite && 'fill-current text-sploot-magenta')} />
                  </Button>
                  <ShareButton
                    assetId={selectedAsset.id}
                    blobUrl={selectedAsset.blobUrl}
                    filename={selectedAsset.filename}
                    mimeType={selectedAsset.mime}
                    variant="ghost"
                    size="icon"
                    className="min-h-[var(--sploot-touch-target)] min-w-[var(--sploot-touch-target)]"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="min-h-[var(--sploot-touch-target)] min-w-[var(--sploot-touch-target)] hover:bg-sploot-red"
                    onClick={() => {
                      const shouldSkip = openDeleteConfirmation({
                        id: selectedAsset.id,
                        imageUrl: selectedAsset.thumbnailUrl || selectedAsset.blobUrl,
                        imageName: selectedAsset.filename,
                      });
                      if (shouldSkip) handleDeleteAsset(selectedAsset.id);
                    }}
                    aria-label="Delete meme"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              <div className="grid w-full min-w-0 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="relative flex min-h-[min(60vh,38rem)] min-w-0 w-full max-w-full items-center justify-center overflow-hidden rounded-[var(--sploot-radius-inner)] border-2 border-sploot-ink bg-sploot-paper-warm p-3">
                  {isVideoMimeType(selectedAsset.mime) ? (
                    <video
                      src={resolveQaSeedSrc(selectedAsset.blobUrl)}
                      poster={selectedAsset.thumbnailUrl ? resolveQaSeedSrc(selectedAsset.thumbnailUrl) : undefined}
                      controls
                      autoPlay
                      loop
                      playsInline
                      className="block h-auto w-auto max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Image
                      src={resolveQaSeedSrc(selectedAsset.blobUrl)}
                      alt={selectedAsset.filename}
                      fill
                      sizes="(max-width: 768px) 100vw, 70vw"
                      className="object-contain p-3"
                      priority
                      unoptimized={isAnimatedImageMimeType(selectedAsset.mime)}
                    />
                  )}
                </div>
                <dl aria-label="meme metadata" className="min-w-0 max-w-full self-start overflow-hidden rounded-[var(--sploot-radius-inner)] border-2 border-dashed border-sploot-ink p-3 font-mono text-xs lowercase">
                  <div className="flex justify-between gap-3 border-b border-dashed border-sploot-ink/50 py-2"><dt>index</dt><dd>—</dd></div>
                  <div className="flex justify-between gap-3 border-b border-dashed border-sploot-ink/50 py-2"><dt>match</dt><dd>{typeof selectedAsset.relevance === 'number' ? `${Math.round(selectedAsset.relevance)}%` : '—'}</dd></div>
                  <div className="flex justify-between gap-3 border-b border-dashed border-sploot-ink/50 py-2"><dt>cosine</dt><dd>{typeof selectedAsset.similarity === 'number' ? selectedAsset.similarity.toFixed(2) : '—'}</dd></div>
                  <div className="flex justify-between gap-3 border-b border-dashed border-sploot-ink/50 py-2"><dt>size</dt><dd>{selectedAsset.width && selectedAsset.height ? `${selectedAsset.width}×${selectedAsset.height}` : '—'}</dd></div>
                  <div className="flex justify-between gap-3 py-2"><dt>mime</dt><dd>{selectedAsset.mime}</dd></div>
                </dl>
              </div>
              {/* Keep the visible close control last in DOM order so the dialog's
                  native media controls remain keyboard reachable without stealing
                  the reverse-tab boundary from the primary dismissal action. */}
              <IconButton
                label="Close preview"
                size="dock"
                className="absolute right-4 top-3 z-10 min-h-[var(--sploot-touch-target)] min-w-[var(--sploot-touch-target)]"
                onClick={() => setSelectedAsset(null)}
              >
                <X className="h-5 w-5" />
              </IconButton>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Retry Progress Modal */}
      <Dialog open={showRetryModal} onOpenChange={(open) => !open && setShowRetryModal(false)}>
        {showRetryModal && (
          <DialogContent className="max-w-sm bg-sploot-panel p-6" showCloseButton={false}>
            <DialogTitle className="text-lg font-semibold lowercase">regenerating embeddings</DialogTitle>
            <DialogDescription className="sr-only">Embedding retry progress</DialogDescription>

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
                <div className="w-full bg-muted h-2 overflow-hidden rounded-[var(--sploot-radius-pill)] border-2 border-sploot-ink">
                  <div
                    className="bg-sploot-lime h-full transition-all duration-500 ease-out"
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
                <p className="text-sm text-sploot-lime text-center font-medium">
                  ✓ all embeddings regenerated
                </p>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={closePalette}
        onUpload={() => setShowUploadPanel(true)}
        onSignOut={async () => {
          await signOut();
          router.push('/');
        }}
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
      <div className="flex h-[calc(100vh-56px)] flex-col items-center justify-center bg-sploot-workbench">
        <div className="sploot-shadow-sm border-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-paper px-5 py-4 font-mono text-sm font-bold lowercase tracking-normal text-sploot-ink">
          loading the pile...
        </div>
      </div>
    }>
      <AppPageClient />
    </Suspense>
  );
}
