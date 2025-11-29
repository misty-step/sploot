'use client';

import { useEffect } from 'react';

interface UseKeyboardShortcutOptions {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  callback: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcut({
  key,
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
  altKey = false,
  callback,
  enabled = true,
}: UseKeyboardShortcutOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isTargetEditable =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable);

      // Don't trigger shortcuts when typing in inputs (unless it's a special case like Cmd+K)
      const isSearchShortcut = (metaKey || ctrlKey) && key.toLowerCase() === 'k';
      if (!isSearchShortcut && isTargetEditable) {
        return;
      }

      const isCtrlPressed = ctrlKey ? event.ctrlKey : true;
      const isMetaPressed = metaKey ? event.metaKey : true;
      const isShiftPressed = shiftKey ? event.shiftKey : !shiftKey;
      const isAltPressed = altKey ? event.altKey : !altKey;

      if (
        event.key.toLowerCase() === key.toLowerCase() &&
        isCtrlPressed &&
        isMetaPressed &&
        isShiftPressed &&
        isAltPressed
      ) {
        event.preventDefault();
        callback();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [key, ctrlKey, metaKey, shiftKey, altKey, callback, enabled]);
}

// Convenience hook for Cmd+K / Ctrl+K
export function useSearchShortcut(callback: () => void, enabled = true) {
  // Use Cmd+K on Mac, Ctrl+K on Windows/Linux
  const isMac = typeof window !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  useKeyboardShortcut({
    key: 'k',
    metaKey: isMac,
    ctrlKey: !isMac,
    callback,
    enabled,
  });
}

// Convenience hook for / key to focus search
export function useSlashSearchShortcut(callback: () => void, enabled = true) {
  useKeyboardShortcut({
    key: '/',
    callback,
    enabled,
  });
}