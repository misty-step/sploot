'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';

/**
 * ComponentPool - Reusable component pool for virtual lists
 *
 * Manages a pool of pre-allocated components to avoid constant creation/destruction
 * during virtual scrolling. Components are acquired from the pool when needed
 * and released back when scrolled out of view.
 */
export class ComponentPool<T extends object> {
  private pool: T[] = [];
  private inUse = new WeakSet<T>();
  private factory: () => T;
  private initialSize: number;
  private maxSize: number;
  private created = 0;
  private acquiredCount = 0;
  private releasedCount = 0;

  constructor(
    factory: () => T,
    options: {
      initialSize?: number;
      maxSize?: number;
    } = {}
  ) {
    this.factory = factory;
    this.initialSize = options.initialSize ?? 100;
    this.maxSize = options.maxSize ?? 1000;

    // Pre-allocate components
    for (let i = 0; i < this.initialSize; i++) {
      this.pool.push(factory());
      this.created++;
    }
  }

  /**
   * Acquire a component from the pool
   */
  acquire(): T {
    this.acquiredCount++;

    let component = this.pool.pop();
    if (!component) {
      // Create new if pool is empty and under max size
      if (this.created < this.maxSize) {
        component = this.factory();
        this.created++;
      } else {
        // If at max size, wait for a release or throw
        throw new Error(`ComponentPool: Max size (${this.maxSize}) reached`);
      }
    }

    this.inUse.add(component);
    return component;
  }

  /**
   * Release a component back to the pool
   */
  release(component: T): void {
    if (this.inUse.has(component)) {
      this.releasedCount++;
      this.inUse.delete(component);

      // Only add back to pool if under max pool size
      if (this.pool.length < this.maxSize) {
        this.pool.push(component);
      }
    }
  }

  /**
   * Release all components
   */
  releaseAll(): void {
    // Clear in-use tracking
    this.inUse = new WeakSet<T>();
    // Pool already contains unused components
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      poolSize: this.pool.length,
      created: this.created,
      acquired: this.acquiredCount,
      released: this.releasedCount,
      currentlyInUse: this.acquiredCount - this.releasedCount
    };
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool = [];
    this.inUse = new WeakSet<T>();
    this.created = 0;
    this.acquiredCount = 0;
    this.releasedCount = 0;
  }
}

/**
 * File item data structure
 */
export interface VirtualFileItem {
  id: string;
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress?: number;
  error?: string;
}

/**
 * Props for individual file row component
 */
interface FileRowProps {
  item: VirtualFileItem;
  index: number;
  style: React.CSSProperties;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
}

/**
 * Memoized file row component
 */
const FileRow = memo(({ item, index, style, onRemove, onRetry }: FileRowProps) => {
  const statusColors = {
    pending: 'text-gray-400',
    uploading: 'text-blue-400',
    success: 'text-green-400',
    error: 'text-red-400'
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      style={style}
      className="flex items-center justify-between p-3 border-b border-gray-800 hover:bg-gray-900/50"
    >
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium">{item.name}</div>
        <div className="text-xs text-gray-500">{formatSize(item.size)}</div>
      </div>

      <div className="flex items-center gap-3">
        {item.status === 'uploading' && item.progress !== undefined && (
          <div className="w-20 bg-gray-800 h-1.5">
            <div
              className="bg-blue-500 h-1.5 transition-all"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}

        <span className={`text-xs ${statusColors[item.status]}`}>
          {item.status}
        </span>

        {item.error && (
          <span className="text-xs text-red-400" title={item.error}>
            ⚠️
          </span>
        )}

        {item.status === 'error' && onRetry && (
          <button
            onClick={() => onRetry(item.id)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Retry
          </button>
        )}

        {onRemove && (
          <button
            onClick={() => onRemove(item.id)}
            className="text-gray-400 hover:text-red-400"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
});

FileRow.displayName = 'FileRow';

/**
 * Virtual file list with component pooling
 */
interface VirtualFileListProps {
  items: VirtualFileItem[];
  height?: number;
  itemHeight?: number;
  overscan?: number;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  className?: string;
}

export function VirtualFileList({
  items,
  height = 600,
  itemHeight = 64,
  overscan = 5,
  onRemove,
  onRetry,
  className = ''
}: VirtualFileListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Calculate visible range
  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleEnd = Math.ceil((scrollTop + height) / itemHeight);

  // Add overscan
  const renderStart = Math.max(0, visibleStart - overscan);
  const renderEnd = Math.min(items.length, visibleEnd + overscan);

  // Total height for scrollbar
  const totalHeight = items.length * itemHeight;

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
    setIsScrolling(true);

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Set scrolling to false after scroll ends
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
  }, []);

  // Create component pool for file rows (not used directly but demonstrates the pattern)
  const componentPool = useMemo(() => {
    // For React components, we'd typically pool the data structures, not the components themselves
    // This is here for demonstration of the ComponentPool pattern
    return new ComponentPool(() => ({ id: '', data: {} }), {
      initialSize: 50,
      maxSize: 200
    });
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      componentPool.clear();
    };
  }, [componentPool]);

  // Render visible items
  const visibleItems = [];
  for (let i = renderStart; i < renderEnd; i++) {
    const item = items[i];
    if (!item) continue;

    const style: React.CSSProperties = {
      position: 'absolute',
      top: i * itemHeight,
      left: 0,
      right: 0,
      height: itemHeight
    };

    visibleItems.push(
      <FileRow
        key={item.id}
        item={item}
        index={i}
        style={style}
        onRemove={onRemove}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="overflow-auto"
        style={{ height }}
        onScroll={handleScroll}
      >
        {/* Virtual spacer for scrollbar */}
        <div style={{ height: totalHeight, position: 'relative' }}>
          {/* Rendered items */}
          {visibleItems}
        </div>
      </div>

      {/* Debug info (dev only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-2 right-2 text-xs bg-black/80 text-green-400 p-2 rounded font-mono">
          <div>Visible: {visibleStart}-{visibleEnd}</div>
          <div>Rendered: {renderStart}-{renderEnd}</div>
          <div>Total: {items.length}</div>
          <div>Pool: {componentPool.getStats().poolSize}</div>
          <div>Created: {componentPool.getStats().created}</div>
          <div>{isScrolling ? 'Scrolling...' : 'Idle'}</div>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to use component pool in React components
 */
export function useComponentPool<T extends object>(
  factory: () => T,
  options?: { initialSize?: number; maxSize?: number }
) {
  const poolRef = useRef<ComponentPool<T> | undefined>(undefined);

  if (!poolRef.current) {
    poolRef.current = new ComponentPool(factory, options);
  }

  useEffect(() => {
    return () => {
      poolRef.current?.clear();
    };
  }, []);

  return poolRef.current;
}