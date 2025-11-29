"use client";

import { ChevronDown } from "lucide-react";

interface ScrollChevronProps {
  targetId: string;
}

const SECTION_LABELS: Record<string, string> = {
  "section-semantic-search": "semantic search section",
  "section-personal-library": "personal library section",
  "section-how-it-works": "how it works section",
  "section-benefits": "benefits section",
};

export function ScrollChevron({ targetId }: ScrollChevronProps) {
  const handleScroll = () => {
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const targetLabel = SECTION_LABELS[targetId] ?? targetId;

  return (
    <button
      onClick={handleScroll}
      className="absolute bottom-8 left-1/2 -translate-x-1/2 text-muted-foreground hover:text-foreground transition-colors animate-bounce cursor-pointer"
      aria-label={`Scroll to ${targetLabel}`}
    >
      <ChevronDown className="w-8 h-8" strokeWidth={1.5} />
    </button>
  );
}
