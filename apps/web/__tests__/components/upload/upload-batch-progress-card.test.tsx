import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UploadBatchProgressCard } from "@/components/upload/upload-batch-progress-card";
import type { UploadProgressFile } from "@/lib/upload/upload-progress-summary";
import { UploadErrorType } from "@/lib/upload-errors";

function makeFile(overrides: Partial<UploadProgressFile>): UploadProgressFile {
  return {
    status: "pending",
    progress: 0,
    ...overrides,
  };
}

describe("UploadBatchProgressCard", () => {
  it("renders stats, progress, and grouped errors with existing copy", () => {
    render(
      <UploadBatchProgressCard
        files={[
          makeFile({ status: "success", progress: 100 }),
          makeFile({ status: "duplicate", progress: 100 }),
          makeFile({ status: "uploading", progress: 40 }),
          makeFile({ status: "pending", progress: 0 }),
          makeFile({ status: "queued", progress: 0 }),
          makeFile({
            status: "error",
            progress: 0,
            errorDetails: {
              type: UploadErrorType.NETWORK_ERROR,
              userMessage: "network issue",
            },
          }),
          makeFile({
            status: "error",
            progress: 0,
            errorDetails: {
              type: UploadErrorType.NETWORK_ERROR,
              userMessage: "network issue",
            },
          }),
          makeFile({
            status: "error",
            progress: 0,
            errorDetails: {
              type: UploadErrorType.SERVER_ERROR,
              userMessage: "server issue",
            },
          }),
        ]}
        hasActiveUploads
        isCancelling={false}
        onRetryAllFailed={vi.fn()}
        onCancelRemainingUploads={vi.fn()}
      />,
    );

    expect(screen.getByText("Upload Progress")).toBeInTheDocument();
    expect(
      screen.getByText("2 completed • 1 uploading • 2 pending • 3 failed"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 of 8 files")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Retry 3 Failed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel Remaining" }),
    ).toBeInTheDocument();

    const groupedErrorRows = screen.getAllByText(/file[s]?:/i);
    expect(groupedErrorRows[0]).toHaveTextContent("2 files: network issue");
    expect(groupedErrorRows[1]).toHaveTextContent("1 file: server issue");
  });

  it("wires retry and cancel actions", () => {
    const onRetryAllFailed = vi.fn();
    const onCancelRemainingUploads = vi.fn();

    render(
      <UploadBatchProgressCard
        files={[
          makeFile({
            status: "error",
            progress: 0,
            errorDetails: {
              type: UploadErrorType.UNKNOWN,
              userMessage: "unknown issue",
            },
          }),
        ]}
        hasActiveUploads
        isCancelling={false}
        onRetryAllFailed={onRetryAllFailed}
        onCancelRemainingUploads={onCancelRemainingUploads}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry 1 Failed" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel Remaining" }));

    expect(onRetryAllFailed).toHaveBeenCalledTimes(1);
    expect(onCancelRemainingUploads).toHaveBeenCalledTimes(1);
  });

  it("shows cancelling state and hides action buttons when conditions are not met", () => {
    render(
      <UploadBatchProgressCard
        files={[makeFile({ status: "success", progress: 100 })]}
        hasActiveUploads={false}
        isCancelling
        onRetryAllFailed={vi.fn()}
        onCancelRemainingUploads={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /retry/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cancel remaining/i }),
    ).not.toBeInTheDocument();
  });
});
