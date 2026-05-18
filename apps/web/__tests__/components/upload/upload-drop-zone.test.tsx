import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UploadDropZone } from '@/components/upload/upload-drop-zone';

describe('UploadDropZone', () => {
  it('does not advertise unsupported background upload replay', () => {
    render(<UploadDropZone onFilesAdded={vi.fn()} />);

    expect(screen.getByText(/drag & drop memes/i)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`background ${'sync'}`, 'i'))).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`background ${'upload'}`, 'i'))).not.toBeInTheDocument();
  });
});
