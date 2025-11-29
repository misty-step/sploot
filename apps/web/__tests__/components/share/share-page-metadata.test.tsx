import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SharePageMetadata } from '@/components/share/share-page-metadata';
import React from 'react';

describe('SharePageMetadata', () => {
  describe('Rendering', () => {
    it('should render all metadata fields when provided', () => {
      render(
        <SharePageMetadata
          size={1048576} // 1MB
          width={1920}
          height={1080}
          mime="image/jpeg"
        />
      );

      expect(screen.getByText('Size:')).toBeInTheDocument();
      expect(screen.getByText('1.0MB')).toBeInTheDocument();
      expect(screen.getByText('Dimensions:')).toBeInTheDocument();
      expect(screen.getByText('1920 × 1080')).toBeInTheDocument();
      expect(screen.getByText('Type:')).toBeInTheDocument();
      expect(screen.getByText('JPEG')).toBeInTheDocument();
    });

    it('should render only provided fields', () => {
      render(<SharePageMetadata size={2048} />);

      expect(screen.getByText('Size:')).toBeInTheDocument();
      expect(screen.getByText('2.0KB')).toBeInTheDocument();
      expect(screen.queryByText('Dimensions:')).not.toBeInTheDocument();
      expect(screen.queryByText('Type:')).not.toBeInTheDocument();
    });

    it('should apply custom className when provided', () => {
      const { container } = render(
        <SharePageMetadata size={1024} className="custom-metadata-class" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('custom-metadata-class');
    });
  });

  describe('File Size Formatting', () => {
    it('should format bytes correctly (< 1KB)', () => {
      render(<SharePageMetadata size={512} />);
      expect(screen.getByText('512B')).toBeInTheDocument();
    });

    it('should format kilobytes correctly', () => {
      render(<SharePageMetadata size={1024} />);
      expect(screen.getByText('1.0KB')).toBeInTheDocument();
    });

    it('should format kilobytes with decimal precision', () => {
      render(<SharePageMetadata size={1536} />); // 1.5KB
      expect(screen.getByText('1.5KB')).toBeInTheDocument();
    });

    it('should format megabytes correctly', () => {
      render(<SharePageMetadata size={1048576} />); // 1MB
      expect(screen.getByText('1.0MB')).toBeInTheDocument();
    });

    it('should format large megabytes with decimal precision', () => {
      render(<SharePageMetadata size={2621440} />); // 2.5MB
      expect(screen.getByText('2.5MB')).toBeInTheDocument();
    });

    it('should format very large files in megabytes', () => {
      render(<SharePageMetadata size={10485760} />); // 10MB
      expect(screen.getByText('10.0MB')).toBeInTheDocument();
    });

    it('should handle zero bytes', () => {
      render(<SharePageMetadata size={0} />);
      expect(screen.getByText('0B')).toBeInTheDocument();
    });
  });

  describe('Dimensions Display', () => {
    it('should render dimensions with multiplication symbol', () => {
      render(<SharePageMetadata width={1920} height={1080} />);

      const dimensionsText = screen.getByText(/1920 × 1080/);
      expect(dimensionsText).toBeInTheDocument();
    });

    it('should not render dimensions if only width provided', () => {
      render(<SharePageMetadata width={1920} />);

      expect(screen.queryByText('Dimensions:')).not.toBeInTheDocument();
    });

    it('should not render dimensions if only height provided', () => {
      render(<SharePageMetadata height={1080} />);

      expect(screen.queryByText('Dimensions:')).not.toBeInTheDocument();
    });

    it('should handle small dimensions', () => {
      render(<SharePageMetadata width={100} height={100} />);

      expect(screen.getByText('100 × 100')).toBeInTheDocument();
    });

    it('should handle large dimensions', () => {
      render(<SharePageMetadata width={4096} height={2160} />); // 4K

      expect(screen.getByText('4096 × 2160')).toBeInTheDocument();
    });
  });

  describe('MIME Type Display', () => {
    it('should strip "image/" prefix from MIME type', () => {
      render(<SharePageMetadata mime="image/png" />);

      expect(screen.getByText('PNG')).toBeInTheDocument();
      expect(screen.queryByText('image/png')).not.toBeInTheDocument();
    });

    it('should convert MIME type to uppercase', () => {
      render(<SharePageMetadata mime="image/jpeg" />);

      expect(screen.getByText('JPEG')).toBeInTheDocument();
    });

    it('should handle WebP format', () => {
      render(<SharePageMetadata mime="image/webp" />);

      expect(screen.getByText('WEBP')).toBeInTheDocument();
    });

    it('should handle GIF format', () => {
      render(<SharePageMetadata mime="image/gif" />);

      expect(screen.getByText('GIF')).toBeInTheDocument();
    });

    it('should not render type if MIME is undefined', () => {
      render(<SharePageMetadata size={1024} />);

      expect(screen.queryByText('Type:')).not.toBeInTheDocument();
    });

    it('should handle MIME types without image/ prefix gracefully', () => {
      render(<SharePageMetadata mime="png" />);

      expect(screen.getByText('PNG')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should apply monospace font', () => {
      const { container } = render(<SharePageMetadata size={1024} />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('font-jetbrains-mono');
    });

    it('should apply gray text color', () => {
      const { container } = render(<SharePageMetadata size={1024} />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('text-gray-400');
    });

    it('should apply small text size', () => {
      const { container } = render(<SharePageMetadata size={1024} />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('text-xs');
    });

    it('should use flexbox for responsive layout', () => {
      const { container } = render(<SharePageMetadata size={1024} />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex', 'flex-wrap', 'items-center', 'justify-center');
    });

    it('should apply appropriate gaps for spacing', () => {
      const { container } = render(<SharePageMetadata size={1024} />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('gap-x-4', 'gap-y-2');
    });
  });

  describe('Label Styling', () => {
    it('should apply darker gray to labels', () => {
      const { container } = render(<SharePageMetadata size={1024} />);

      const label = container.querySelector('.text-gray-500');
      expect(label).toBeInTheDocument();
      expect(label?.textContent).toBe('Size:');
    });

    it('should apply lighter gray to values', () => {
      const { container } = render(<SharePageMetadata size={1024} />);

      const value = container.querySelector('.text-gray-300');
      expect(value).toBeInTheDocument();
      expect(value?.textContent).toBe('1.0KB');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null size gracefully', () => {
      render(<SharePageMetadata size={null as unknown as undefined} />);

      expect(screen.queryByText('Size:')).not.toBeInTheDocument();
    });

    it('should handle undefined width and height', () => {
      render(<SharePageMetadata width={undefined} height={undefined} />);

      expect(screen.queryByText('Dimensions:')).not.toBeInTheDocument();
    });

    it('should handle null width and defined height', () => {
      render(
        <SharePageMetadata
          width={null as unknown as undefined}
          height={1080}
        />
      );

      expect(screen.queryByText('Dimensions:')).not.toBeInTheDocument();
    });

    it('should handle defined width and null height', () => {
      render(
        <SharePageMetadata
          width={1920}
          height={null as unknown as undefined}
        />
      );

      expect(screen.queryByText('Dimensions:')).not.toBeInTheDocument();
    });

    it('should handle empty MIME string', () => {
      render(<SharePageMetadata mime="" />);

      expect(screen.queryByText('Type:')).not.toBeInTheDocument();
    });

    it('should render without any props', () => {
      const { container } = render(<SharePageMetadata />);

      expect(container.firstChild).toBeInTheDocument();
      expect(container.textContent).toBe('');
    });

    it('should handle very long MIME types', () => {
      render(<SharePageMetadata mime="image/vnd.adobe.photoshop" />);

      expect(screen.getByText('VND.ADOBE.PHOTOSHOP')).toBeInTheDocument();
    });
  });

  describe('Multiple Fields Layout', () => {
    it('should render all three fields in correct order', () => {
      const { container } = render(
        <SharePageMetadata
          size={2048}
          width={800}
          height={600}
          mime="image/png"
        />
      );

      const spans = container.querySelectorAll('span.flex');
      expect(spans).toHaveLength(3);

      // Check order: Size, Dimensions, Type
      expect(spans[0].textContent).toContain('Size:');
      expect(spans[1].textContent).toContain('Dimensions:');
      expect(spans[2].textContent).toContain('Type:');
    });

    it('should wrap fields responsively', () => {
      const { container } = render(
        <SharePageMetadata
          size={2048}
          width={800}
          height={600}
          mime="image/png"
        />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex-wrap');
    });
  });
});
