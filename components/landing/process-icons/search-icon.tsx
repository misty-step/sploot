import { Search } from "lucide-react";
import { processIconClassName } from "./shared";
import type { ProcessIconProps } from "./shared";

export function SearchIcon({ className, ...props }: ProcessIconProps) {
  return (
    <div className="flex items-center justify-center w-20 h-20 brutalist-corners border-4 border-current bg-black/50">
      <Search
        className={processIconClassName(className)}
        size={48}
        strokeWidth={3}
        aria-hidden="true"
        {...props}
      />
    </div>
  );
}
