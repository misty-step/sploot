import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useUploadCompletion,
  type UploadCompletionFile,
  type UploadCompletionStats,
} from '@/components/upload/use-upload-completion';

const uploadedFile = (
  overrides: Partial<UploadCompletionFile> = {},
): UploadCompletionFile => ({
  id: 'file-1',
  status: 'success',
  assetId: 'asset-1',
  ...overrides,
});

describe('useUploadCompletion', () => {
  it('reports a finished upload batch once even if the parent rerenders with a new callback', async () => {
    const firstComplete = vi.fn();
    const files = [uploadedFile()];
    const { rerender } = renderHook(
      ({ onComplete }) => useUploadCompletion(files, onComplete),
      {
        initialProps: {
          onComplete: firstComplete,
        },
      },
    );

    await waitFor(() => {
      expect(firstComplete).toHaveBeenCalledTimes(1);
    });

    expect(firstComplete).toHaveBeenCalledWith({
      uploaded: 1,
      duplicates: 0,
      failed: 0,
    });

    const secondComplete = vi.fn();
    rerender({ onComplete: secondComplete });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(firstComplete).toHaveBeenCalledTimes(1);
    expect(secondComplete).not.toHaveBeenCalled();
  });

  it('resets after the completed batch is cleared', async () => {
    const firstComplete = vi.fn();
    const { rerender } = renderHook(
      ({
        files,
        onComplete,
      }: {
        files: UploadCompletionFile[];
        onComplete: (stats: UploadCompletionStats) => void;
      }) => useUploadCompletion(files, onComplete),
      {
        initialProps: {
          files: [uploadedFile()],
          onComplete: firstComplete,
        },
      },
    );

    await waitFor(() => {
      expect(firstComplete).toHaveBeenCalledTimes(1);
    });

    rerender({
      files: [],
      onComplete: firstComplete,
    });

    const secondComplete = vi.fn();
    rerender({
      files: [uploadedFile({ id: 'file-2', assetId: 'asset-2' })],
      onComplete: secondComplete,
    });

    await waitFor(() => {
      expect(secondComplete).toHaveBeenCalledTimes(1);
    });
  });
});
