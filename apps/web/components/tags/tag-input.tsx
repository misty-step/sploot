'use client';

import { useState, KeyboardEvent, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  className?: string;
  disabled?: boolean;
  suggestions?: string[]; // Available tag suggestions
}

export function TagInput({
  tags,
  onTagsChange,
  placeholder = 'Add tags...',
  maxTags = 10,
  className,
  disabled = false,
  suggestions = []
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions based on input value
  const filteredSuggestions = suggestions.filter(
    (suggestion) =>
      !tags.includes(suggestion) &&
      suggestion.toLowerCase().includes(inputValue.toLowerCase())
  ).slice(0, 5); // Limit to 5 suggestions

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const addTag = (tagValue?: string) => {
    const trimmedValue = (tagValue || inputValue).trim().toLowerCase();

    if (trimmedValue && !tags.includes(trimmedValue) && tags.length < maxTags) {
      onTagsChange([...tags, trimmedValue]);
      setInputValue('');
      setIsOpen(false);
    }
  };

  const removeTag = (index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    onTagsChange(newTags);
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    // Show suggestions when user types
    setIsOpen(value.length > 0 && filteredSuggestions.length > 0);
  };

  const handleSuggestionClick = (suggestion: string) => {
    addTag(suggestion);
    inputRef.current?.focus();
  };

  return (
    <div className={cn('w-full', className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div
            className={cn(
              'flex flex-wrap items-center gap-2 p-3 rounded-md border transition-colors cursor-text',
              'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
              disabled && 'opacity-50 pointer-events-none'
            )}
            onClick={() => inputRef.current?.focus()}
          >
            {/* Tag badges */}
            {tags.map((tag, index) => (
              <Badge
                key={`${tag}-${index}`}
                variant="secondary"
                className="gap-1 text-primary"
              >
                <span>{tag}</span>
                {!disabled && (
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTag(index);
                    }}
                    variant="ghost"
                    size="icon-sm"
                    className="h-auto w-auto p-0 hover:bg-transparent"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X className="size-3" />
                  </Button>
                )}
              </Badge>
            ))}

            {/* Input field */}
            {tags.length < maxTags && !disabled && (
              <Input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  // Delay to allow suggestion clicks to register
                  setTimeout(() => {
                    if (inputValue.trim()) {
                      addTag();
                    }
                  }, 200);
                }}
                placeholder={tags.length === 0 ? placeholder : ''}
                className="flex-1 min-w-[120px] h-auto border-0 p-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            )}
          </div>
        </PopoverTrigger>

        {/* Suggestions popover */}
        {filteredSuggestions.length > 0 && (
          <PopoverContent
            className="w-full p-2"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                Suggestions
              </p>
              {filteredSuggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start font-normal"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </PopoverContent>
        )}
      </Popover>

      {/* Helper text */}
      <p className="mt-2 text-xs text-muted-foreground">
        Press Enter or comma to add a tag • {tags.length}/{maxTags} tags
      </p>
    </div>
  );
}
