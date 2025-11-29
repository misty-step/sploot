"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface SearchInputProps {
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  placeholder = "disappointed drake...",
  className = "",
}: SearchInputProps) {
  const router = useRouter();

  const handleFocus = () => {
    router.push("/sign-up");
  };

  const handleClick = () => {
    router.push("/sign-up");
  };

  return (
    <div
      className={`relative w-full max-w-2xl mx-auto ${className}`}
      onClick={handleClick}
    >
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
        <Search className="h-5 w-5" />
      </div>
      <input
        type="text"
        readOnly
        placeholder={placeholder}
        onFocus={handleFocus}
        className="w-full pl-12 pr-4 py-4 bg-background border border-border rounded-lg font-mono text-sm
                   text-foreground placeholder:text-muted-foreground
                   cursor-pointer transition-all duration-200
                   hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        aria-label="Search memes (sign up to use)"
      />
    </div>
  );
}
