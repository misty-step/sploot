'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  Settings,
  Search,
  Grid3x3,
  Grid2x2,
  LayoutGrid,
  Home,
  LogOut,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload?: () => void;
  onSignOut?: () => void;
  onDensityChange?: (density: 'compact' | 'dense' | 'comfortable') => void;
  currentDensity?: 'compact' | 'dense' | 'comfortable';
}

/**
 * Command palette for quick actions
 * Opens with ⌘K / Ctrl+K
 * Built with shadcn Command primitive
 */
export function CommandPalette({
  isOpen,
  onClose,
  onUpload,
  onSignOut,
  onDensityChange,
  currentDensity = 'dense',
}: CommandPaletteProps) {
  const router = useRouter();

  const handleUpload = () => {
    onClose();
    if (onUpload) {
      onUpload();
    } else {
      router.push('/app/upload');
    }
  };

  const handleSettings = () => {
    onClose();
    router.push('/app/settings');
  };

  const handleSearch = () => {
    onClose();
    // Focus search bar after closing
    setTimeout(() => {
      const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
      searchInput?.focus();
    }, 100);
  };

  const handleDensityChange = (density: 'compact' | 'dense' | 'comfortable') => {
    onClose();
    if (onDensityChange) {
      onDensityChange(density);
    }
  };

  const handleHome = () => {
    onClose();
    router.push('/app');
  };

  const handleSignOut = () => {
    onClose();
    if (onSignOut) {
      onSignOut();
    } else {
      // Default sign out behavior
      window.location.href = '/api/auth/signout';
    }
  };

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={onClose}
      title="Command Palette"
      description="Quick actions and navigation"
    >
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={handleUpload}>
            <Upload className="mr-2" />
            <span>Upload Images</span>
            <CommandShortcut>U</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleSearch}>
            <Search className="mr-2" />
            <span>Search</span>
            <CommandShortcut>/</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="View Density">
          <CommandItem onSelect={() => handleDensityChange('compact')}>
            <Grid3x3 className="mr-2" />
            <span>Compact</span>
            {currentDensity === 'compact' && <CommandShortcut>✓</CommandShortcut>}
          </CommandItem>
          <CommandItem onSelect={() => handleDensityChange('dense')}>
            <Grid2x2 className="mr-2" />
            <span>Dense</span>
            {currentDensity === 'dense' && <CommandShortcut>✓</CommandShortcut>}
          </CommandItem>
          <CommandItem onSelect={() => handleDensityChange('comfortable')}>
            <LayoutGrid className="mr-2" />
            <span>Comfortable</span>
            {currentDensity === 'comfortable' && <CommandShortcut>✓</CommandShortcut>}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={handleHome}>
            <Home className="mr-2" />
            <span>Go to Home</span>
          </CommandItem>
          <CommandItem onSelect={handleSettings}>
            <Settings className="mr-2" />
            <span>Settings</span>
            <CommandShortcut>S</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Account">
          <CommandItem onSelect={handleSignOut}>
            <LogOut className="mr-2" />
            <span>Sign Out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/**
 * Hook to manage command palette state
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  const openPalette = useCallback(() => setIsOpen(true), []);
  const closePalette = useCallback(() => setIsOpen(false), []);
  const togglePalette = useCallback(() => setIsOpen((prev) => !prev), []);

  return {
    isOpen,
    openPalette,
    closePalette,
    togglePalette,
  };
}
