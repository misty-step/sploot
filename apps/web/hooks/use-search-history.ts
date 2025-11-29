'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sploot_search_history';
const MAX_HISTORY_ITEMS = 10;

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
}

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  // Load history from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SearchHistoryItem[];
        // Filter out invalid entries and sort by timestamp
        const valid = parsed
          .filter(item => item.query && typeof item.query === 'string' && item.timestamp)
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_HISTORY_ITEMS);
        setHistory(valid);
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
      // Clear corrupted data
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Add a search query to history
  const addToHistory = useCallback((query: string) => {
    if (!query.trim()) return;

    setHistory(prev => {
      // Remove duplicates and add new item at the beginning
      const filtered = prev.filter(item => item.query !== query);
      const newHistory = [
        { query, timestamp: Date.now() },
        ...filtered
      ].slice(0, MAX_HISTORY_ITEMS);

      // Persist to localStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
        } catch (error) {
          console.error('Failed to save search history:', error);
        }
      }

      return newHistory;
    });
  }, []);

  // Remove a specific item from history
  const removeFromHistory = useCallback((query: string) => {
    setHistory(prev => {
      const newHistory = prev.filter(item => item.query !== query);

      // Persist to localStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
        } catch (error) {
          console.error('Failed to save search history:', error);
        }
      }

      return newHistory;
    });
  }, []);

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}