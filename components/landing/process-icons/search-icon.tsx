import { Search } from "lucide-react";
import { processIconClassName } from "./shared";
import type { ProcessIconProps } from "./shared";

export function SearchIcon({ className, ...props }: ProcessIconProps) {
  return (
    <Search
      className={processIconClassName(className)}
      strokeWidth={1.5}
      aria-hidden="true"
      {...props}
    />
  );
}
