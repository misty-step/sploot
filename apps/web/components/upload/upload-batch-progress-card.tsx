import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  calculateOverallProgress,
  getGroupedErrors,
  getUploadStats,
  type UploadProgressFile,
} from "@/lib/upload/upload-progress-summary";

interface UploadBatchProgressCardProps<
  TFile extends UploadProgressFile = UploadProgressFile,
> {
  files: readonly TFile[];
  hasActiveUploads: boolean;
  isCancelling: boolean;
  onRetryAllFailed: () => void;
  onCancelRemainingUploads: () => void;
}

export function UploadBatchProgressCard<
  TFile extends UploadProgressFile = UploadProgressFile,
>({
  files,
  hasActiveUploads,
  isCancelling,
  onRetryAllFailed,
  onCancelRemainingUploads,
}: UploadBatchProgressCardProps<TFile>) {
  const stats = getUploadStats(files);
  const overallProgress = calculateOverallProgress(files);
  const groupedErrors = getGroupedErrors(files);

  const parts: string[] = [];
  if (stats.completed > 0) parts.push(`${stats.completed} completed`);
  if (stats.uploading > 0) parts.push(`${stats.uploading} uploading`);
  if (stats.pending > 0) parts.push(`${stats.pending} pending`);
  if (stats.failed > 0) parts.push(`${stats.failed} failed`);

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium text-sm">Upload Progress</h3>
            <p className="text-muted-foreground text-xs mt-1">
              {parts.join(" • ") || "No files"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {stats.failed > 0 && (
              <Button onClick={onRetryAllFailed} size="sm" variant="ghost">
                Retry {stats.failed} Failed
              </Button>
            )}

            {hasActiveUploads && (
              <Button
                onClick={onCancelRemainingUploads}
                disabled={isCancelling}
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
              >
                {isCancelling ? "Cancelling..." : "Cancel Remaining"}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Progress value={overallProgress} className="h-2" />
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {stats.completed} of {files.length} files
            </span>
            <span className="text-primary font-medium">{overallProgress}%</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-3">
          <div className="text-center">
            <p className="text-sploot-lime text-lg font-semibold">
              {stats.completed}
            </p>
            <p className="text-muted-foreground text-xs">Complete</p>
          </div>
          <div className="text-center">
            <p className="text-primary text-lg font-semibold">
              {stats.uploading}
            </p>
            <p className="text-muted-foreground text-xs">Uploading</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-lg font-semibold">
              {stats.pending}
            </p>
            <p className="text-muted-foreground text-xs">Pending</p>
          </div>
          <div className="text-center">
            <p className="text-destructive text-lg font-semibold">
              {stats.failed}
            </p>
            <p className="text-muted-foreground text-xs">Failed</p>
          </div>
        </div>

        {stats.failed > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-muted-foreground text-xs font-medium mb-2">
              Error Details:
            </p>
            <div className="space-y-1">
              {groupedErrors.map((group) => (
                <div
                  key={group.type}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-destructive">
                    {group.count} {group.count === 1 ? "file" : "files"}:{" "}
                    {group.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
