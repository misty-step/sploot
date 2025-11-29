'use client';

import { useCacheManagement } from '@/hooks/use-cache-management';
import { cn } from '@/lib/utils';

export function CacheStatus() {
  const {
    cacheStatus,
    cacheStats,
    isLoading,
    error,
    getCacheStatus,
    cleanCache,
    clearAllCaches,
    isSupported,
  } = useCacheManagement();

  if (!isSupported) {
    return (
      <div className="bg-lab-surface border border-lab-border p-6">
        <p className="text-sm text-lab-text-secondary">
          Cache management is not supported in your browser.
        </p>
      </div>
    );
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-lab-surface border border-lab-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-lab-text">
              Offline Cache Status
            </h3>
            <p className="text-sm text-lab-text-secondary mt-1">
              Manage cached resources for offline access
            </p>
          </div>
          <button
            onClick={getCacheStatus}
            disabled={isLoading}
            className={cn(
              'px-4 py-2 text-sm bg-lab-surface-secondary text-lab-text ',
              'hover:bg-lab-border transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-lab-bg p-3">
            <p className="text-xs text-lab-text-secondary mb-1">Total Entries</p>
            <p className="text-xl font-semibold text-lab-text">
              {cacheStats.totalEntries.toLocaleString()}
            </p>
          </div>
          <div className="bg-lab-bg p-3">
            <p className="text-xs text-lab-text-secondary mb-1">Estimated Size</p>
            <p className="text-xl font-semibold text-lab-text">
              {formatBytes(cacheStats.totalSize)}
            </p>
          </div>
          <div className="bg-lab-bg p-3">
            <p className="text-xs text-lab-text-secondary mb-1">Cache Groups</p>
            <p className="text-xl font-semibold text-lab-text">
              {Object.keys(cacheStatus).length}
            </p>
          </div>
          <div className="bg-lab-bg p-3">
            <p className="text-xs text-lab-text-secondary mb-1">Status</p>
            <p className="text-xl font-semibold text-green-500">
              Active
            </p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}
      </div>

      {/* Cache Details */}
      <div className="bg-lab-surface border border-lab-border p-6">
        <h4 className="text-sm font-semibold text-lab-text mb-4 tracking-wider">
          cache details
        </h4>

        {Object.keys(cacheStatus).length === 0 ? (
          <p className="text-sm text-lab-text-secondary">
            No cached data available. Cache will populate as you use the app.
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(cacheStatus).map(([cacheName, cache]) => (
              <div
                key={cacheName}
                className="bg-lab-bg border border-lab-border p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-medium text-lab-text">
                    {cacheName.replace('sploot-', '').replace(/-v\d+$/, '')}
                  </h5>
                  <span className="text-xs text-lab-text-secondary">
                    {cache.count} items
                  </span>
                </div>

                {/* Progress bar showing cache usage */}
                <div className="w-full h-2 bg-lab-surface-secondary overflow-hidden mb-3">
                  <div
                    className={cn(
                      'h-full transition-all duration-300',
                      cache.count > 100 ? 'bg-yellow-500' : 'bg-lab-primary'
                    )}
                    style={{
                      width: `${Math.min((cache.count / 200) * 100, 100)}%`,
                    }}
                  />
                </div>

                {/* Sample cached URLs */}
                {cache.urls.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-lab-text-secondary hover:text-lab-text">
                      View cached URLs ({cache.urls.length} shown)
                    </summary>
                    <ul className="mt-2 space-y-1 pl-4">
                      {cache.urls.map((url, index) => (
                        <li
                          key={index}
                          className="text-lab-text-tertiary truncate"
                          title={url}
                        >
                          {url.replace(window.location.origin, '')}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-lab-surface border border-lab-border p-6">
        <h4 className="text-sm font-semibold text-lab-text mb-4 tracking-wider">
          cache management
        </h4>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={cleanCache}
            disabled={isLoading}
            className={cn(
              'px-4 py-2 text-sm bg-lab-primary text-white ',
              'hover:opacity-90 transition-opacity',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            Clean Old Entries
          </button>

          <button
            onClick={() => {
              if (confirm('This will clear all cached data. The app will need to re-download resources. Continue?')) {
                clearAllCaches();
              }
            }}
            disabled={isLoading}
            className={cn(
              'px-4 py-2 text-sm bg-red-500 text-white ',
              'hover:opacity-90 transition-opacity',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            Clear All Caches
          </button>
        </div>

        <div className="mt-4 p-3 bg-lab-bg">
          <p className="text-xs text-lab-text-secondary">
            <strong>Clean Old Entries:</strong> Removes the oldest 30% of cached items to free up space.
          </p>
          <p className="text-xs text-lab-text-secondary mt-1">
            <strong>Clear All Caches:</strong> Completely removes all cached data. Use with caution.
          </p>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-lab-surface border border-lab-border p-6">
        <h4 className="text-sm font-semibold text-lab-text mb-3 tracking-wider">
          optimization tips
        </h4>
        <ul className="space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-lab-primary mt-0.5">•</span>
            <p className="text-sm text-lab-text-secondary">
              Cached images will load instantly, even when offline
            </p>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-lab-primary mt-0.5">•</span>
            <p className="text-sm text-lab-text-secondary">
              The app automatically manages cache size to prevent storage issues
            </p>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-lab-primary mt-0.5">•</span>
            <p className="text-sm text-lab-text-secondary">
              Clear cache if you experience loading issues or need to free up space
            </p>
          </li>
        </ul>
      </div>
    </div>
  );
}