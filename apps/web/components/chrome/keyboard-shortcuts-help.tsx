'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  category: string;
}

/**
 * Keyboard shortcuts help dialog
 * Opens with ? key, displays all available shortcuts organized by category
 */
export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  const shortcuts: ShortcutItem[] = [
    // Navigation
    { keys: ['⌘', 'K'], description: 'Command Palette', category: 'navigation' },
    { keys: ['/'], description: 'Search', category: 'navigation' },
    { keys: ['?'], description: 'Keyboard Shortcuts', category: 'navigation' },
    { keys: ['esc'], description: 'Close / Clear', category: 'navigation' },

    // View Modes
    { keys: ['1'], description: 'Grid View', category: 'view' },
    { keys: ['2'], description: 'List View', category: 'view' },

    // Navigation in Lists
    { keys: ['↑'], description: 'Navigate Up', category: 'lists' },
    { keys: ['↓'], description: 'Navigate Down', category: 'lists' },
    { keys: ['↵'], description: 'Select / Execute', category: 'lists' },
  ];

  const categories = [
    { id: 'navigation', label: 'Navigation' },
    { id: 'view', label: 'View Modes' },
    { id: 'lists', label: 'List Navigation' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Navigate and control the application using keyboard shortcuts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto pr-2 max-h-[60vh]">
          {categories.map((category, categoryIndex) => {
            const categoryShortcuts = shortcuts.filter((s) => s.category === category.id);
            if (categoryShortcuts.length === 0) return null;

            return (
              <div key={category.id}>
                {categoryIndex > 0 && <Separator className="mb-4" />}
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground tracking-wider">
                  {category.label}
                </h3>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div
                      key={`${category.id}-${index}`}
                      className="flex items-center justify-between gap-4 py-2 px-3 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <span className="text-sm flex-1">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="flex items-center gap-1">
                            <kbd
                              className={cn(
                                'inline-flex items-center justify-center',
                                'min-w-[28px] px-2 py-1',
                                'bg-background border border-border',
                                'text-foreground font-mono text-xs',
                                'rounded shadow-sm'
                              )}
                            >
                              {key}
                            </kbd>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="text-muted-foreground text-xs mx-0.5">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="text-sm text-muted-foreground">
          Press{' '}
          <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-foreground font-mono text-xs">
            esc
          </kbd>{' '}
          or{' '}
          <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-foreground font-mono text-xs">
            ?
          </kbd>{' '}
          to close
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook to manage keyboard shortcuts help modal state
 */
export function useKeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  const openHelp = useCallback(() => setIsOpen(true), []);
  const closeHelp = useCallback(() => setIsOpen(false), []);
  const toggleHelp = useCallback(() => setIsOpen((prev) => !prev), []);

  return {
    isOpen,
    openHelp,
    closeHelp,
    toggleHelp,
  };
}
