import { Upload } from "lucide-react";
import { processIconClassName } from "./shared";
import type { ProcessIconProps } from "./shared";

export function UploadIcon({ className, ...props }: ProcessIconProps) {
  return (
    <Upload
      className={processIconClassName(className)}
      strokeWidth={1.5}
      aria-hidden="true"
      {...props}
    />
  );
}
