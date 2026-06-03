import type { UploadErrorDetails } from "@/lib/upload-errors";

export type UploadProgressStatus =
  | "pending"
  | "uploading"
  | "success"
  | "error"
  | "queued"
  | "duplicate";

export interface UploadProgressFile {
  status: UploadProgressStatus;
  progress: number;
  errorDetails?: Pick<UploadErrorDetails, "type" | "userMessage">;
}

export interface UploadStats {
  completed: number;
  uploading: number;
  pending: number;
  failed: number;
  total: number;
}

export interface GroupedUploadError<
  TFile extends UploadProgressFile = UploadProgressFile,
> {
  type: UploadErrorDetails["type"];
  message: string;
  count: number;
  files: TFile[];
}

export function calculateOverallProgress<TFile extends UploadProgressFile>(
  files: readonly TFile[],
): number {
  if (files.length === 0) return 0;

  const totalProgress = files.reduce((acc, file) => {
    if (file.status === "success" || file.status === "duplicate") {
      return acc + 100;
    } else if (file.status === "uploading") {
      return acc + file.progress;
    } else if (file.status === "error") {
      return acc + 0;
    } else {
      return acc + 0;
    }
  }, 0);

  return Math.round(totalProgress / files.length);
}

export function getUploadStats<TFile extends UploadProgressFile>(
  files: readonly TFile[],
): UploadStats {
  const completed = files.filter(
    (file) => file.status === "success" || file.status === "duplicate",
  ).length;
  const uploading = files.filter((file) => file.status === "uploading").length;
  const pending = files.filter(
    (file) => file.status === "pending" || file.status === "queued",
  ).length;
  const failed = files.filter((file) => file.status === "error").length;

  return { completed, uploading, pending, failed, total: files.length };
}

export function getGroupedErrors<TFile extends UploadProgressFile>(
  files: readonly TFile[],
): GroupedUploadError<TFile>[] {
  const failedFiles = files.filter(
    (file) => file.status === "error" && file.errorDetails,
  );
  const groups = new Map<string, GroupedUploadError<TFile>>();

  failedFiles.forEach((file) => {
    if (file.errorDetails) {
      const key = file.errorDetails.type;
      if (!groups.has(key)) {
        groups.set(key, {
          type: file.errorDetails.type,
          message: file.errorDetails.userMessage,
          count: 0,
          files: [],
        });
      }
      const group = groups.get(key)!;
      group.count++;
      group.files.push(file);
    }
  });

  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}
