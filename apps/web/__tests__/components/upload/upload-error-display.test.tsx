import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FileListVirtual } from '@/components/upload/file-list-virtual';
import { UploadErrorDisplay } from '@/components/upload/upload-error-display';
import { UploadFileList } from '@/components/upload/upload-file-list';
import type { FileMetadata } from '@/lib/file-metadata-manager';
import { UploadErrorType } from '@/lib/upload-errors';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
      index,
      key: index,
      size: 64,
      start: index * 64,
    })),
    getTotalSize: () => count * 64,
    measure: vi.fn(),
    measureElement: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: (props: any) => <img {...props} />,
}));

function duplicateMetadata(overrides: Partial<FileMetadata> = {}): FileMetadata {
  return {
    id: 'file-1',
    name: 'duplicate.png',
    size: 1234,
    status: 'duplicate',
    progress: 100,
    assetId: 'asset/with slash',
    blobUrl: 'https://example.com/duplicate.png',
    addedAt: 1,
    ...overrides,
  };
}

describe('UploadErrorDisplay', () => {
  it('routes duplicate view actions to the real meme detail route', () => {
    mockPush.mockClear();

    render(
      <UploadErrorDisplay
        fileId="file-1"
        fileName="duplicate.png"
        error={{
          type: UploadErrorType.DUPLICATE,
          message: 'Already exists',
          userMessage: 'This image is already in your library',
          action: {
            label: 'View existing',
            type: 'view',
            data: { assetId: 'asset/with slash' },
          },
          retryable: false,
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /view existing/i }));

    expect(mockPush).toHaveBeenCalledWith('/app/meme/asset%2Fwith%20slash');
  });
});

describe('UploadFileList duplicate recovery', () => {
  it('routes duplicate rows to the real meme detail route', () => {
    mockPush.mockClear();

    render(
      <UploadFileList
        files={new Map([['file-1', duplicateMetadata()]])}
        onFileUpdate={vi.fn()}
        formatFileSize={() => '1.2 kb'}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^view$/i }));

    expect(mockPush).toHaveBeenCalledWith('/app/meme/asset%2Fwith%20slash');
  });
});

describe('FileListVirtual duplicate recovery', () => {
  it('routes duplicate rows to the real meme detail route', () => {
    mockPush.mockClear();

    render(
      <FileListVirtual
        fileMetadata={new Map([['file-1', duplicateMetadata()]])}
        setFileMetadata={vi.fn()}
        formatFileSize={() => '1.2 kb'}
        retryUpload={vi.fn()}
        removeFile={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^view$/i }));

    expect(mockPush).toHaveBeenCalledWith('/app/meme/asset%2Fwith%20slash');
  });
});
