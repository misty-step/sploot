import { describe, expect, it } from "vitest";

import {
  calculateOverallProgress,
  getGroupedErrors,
  getUploadStats,
  type UploadProgressFile,
} from "@/lib/upload/upload-progress-summary";
import { UploadErrorType } from "@/lib/upload-errors";

function makeFile(overrides: Partial<UploadProgressFile>): UploadProgressFile {
  return {
    status: "pending",
    progress: 0,
    ...overrides,
  };
}

describe("upload-progress-summary", () => {
  it("counts upload stats with duplicate as completed and queued as pending", () => {
    const files: UploadProgressFile[] = [
      makeFile({ status: "success", progress: 100 }),
      makeFile({ status: "duplicate", progress: 100 }),
      makeFile({ status: "uploading", progress: 55 }),
      makeFile({ status: "pending", progress: 0 }),
      makeFile({ status: "queued", progress: 0 }),
      makeFile({ status: "error", progress: 0 }),
    ];

    expect(getUploadStats(files)).toEqual({
      completed: 2,
      uploading: 1,
      pending: 2,
      failed: 1,
      total: 6,
    });
  });

  it("calculates overall progress as average with success/duplicate=100, uploading=current, others=0", () => {
    const files: UploadProgressFile[] = [
      makeFile({ status: "success", progress: 100 }),
      makeFile({ status: "duplicate", progress: 100 }),
      makeFile({ status: "uploading", progress: 41 }),
      makeFile({ status: "pending", progress: 99 }),
      makeFile({ status: "queued", progress: 87 }),
      makeFile({ status: "error", progress: 70 }),
    ];

    expect(calculateOverallProgress(files)).toBe(40);
  });

  it("returns 0 overall progress when there are no files", () => {
    expect(calculateOverallProgress([])).toBe(0);
  });

  it("groups errors by errorDetails.type and sorts descending by count", () => {
    const files: UploadProgressFile[] = [
      makeFile({
        status: "error",
        progress: 0,
        errorDetails: {
          type: UploadErrorType.NETWORK_ERROR,
          userMessage: "connection vanished",
        },
      }),
      makeFile({
        status: "error",
        progress: 0,
        errorDetails: {
          type: UploadErrorType.NETWORK_ERROR,
          userMessage: "connection vanished",
        },
      }),
      makeFile({
        status: "error",
        progress: 0,
        errorDetails: {
          type: UploadErrorType.SERVER_ERROR,
          userMessage: "server exploded",
        },
      }),
      makeFile({ status: "error", progress: 0 }),
      makeFile({ status: "pending", progress: 0 }),
    ];

    const grouped = getGroupedErrors(files);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].type).toBe(UploadErrorType.NETWORK_ERROR);
    expect(grouped[0].message).toBe("connection vanished");
    expect(grouped[0].count).toBe(2);
    expect(grouped[0].files).toHaveLength(2);

    expect(grouped[1].type).toBe(UploadErrorType.SERVER_ERROR);
    expect(grouped[1].message).toBe("server exploded");
    expect(grouped[1].count).toBe(1);
    expect(grouped[1].files).toHaveLength(1);
  });
});
