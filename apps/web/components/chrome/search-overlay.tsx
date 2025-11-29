'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch?: (query: string) => void;
}

/**
 * Full-screen search overlay for mobile devices
 * Built with shadcn Dialog + Command
 */
export function SearchOverlay({
  isOpen,
  onClose,
  onSearch,
}: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize query from URL
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery) {
      setQuery(urlQuery);
    }
  }, [searchParams]);

  const handleSearch = async (searchQuery?: string) => {
    const queryToUse = searchQuery || query;
    if (!queryToUse.trim()) return;

    setIsSearching(true);

    // Update URL with search query
    const params = new URLSearchParams(searchParams.toString());
    params.set('q', queryToUse.trim());
    router.push(`/app?${params.toString()}`);

    // Call onSearch callback if provided
    onSearch?.(queryToUse.trim());

    // Close overlay after search
    setTimeout(() => {
      setIsSearching(false);
      onClose();
    }, 300);
  };

  const clearSearch = () => {
    setQuery('');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    const newUrl = params.toString() ? `/app?${params}` : '/app';
    router.push(newUrl);
  };

  const suggestions = ['funny', 'reaction', 'cat', 'meme'];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Search your meme collection</DialogDescription>
        </DialogHeader>

        <Command className="rounded-lg border-0">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 size-5 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Search your memes..."
              value={query}
              onValueChange={setQuery}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              className={isSearching ? 'animate-pulse' : ''}
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                onClick={clearSearch}
                className="ml-2 size-8"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>

          <CommandList className="max-h-[300px]">
            <CommandEmpty>
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Try searching for:
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      onClick={() => handleSearch(suggestion)}
                      className="font-mono"
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            </CommandEmpty>

            {query && (
              <CommandItem
                onSelect={() => handleSearch()}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Search className="size-4" />
                <span className="font-mono">Search for &quot;{query}&quot;</span>
              </CommandItem>
            )}
          </CommandList>

          <div className="border-t p-3">
            <Button
              onClick={() => handleSearch()}
              disabled={!query.trim()}
              className="w-full"
              size="lg"
            >
              Search
            </Button>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
