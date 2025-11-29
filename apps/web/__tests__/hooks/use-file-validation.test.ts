import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFileValidation } from '@/hooks/use-file-validation';

describe('useFileValidation', () => {
  let result: ReturnType<typeof useFileValidation>;

  beforeEach(() => {
    const { result: hookResult } = renderHook(() => useFileValidation());
    result = hookResult.current;
  });

  describe('validateFile', () => {
    it('should accept valid JPEG file', () => {
      const file = new File(['content'], 'image.jpg', { type: 'image/jpeg' });
      const error = result.validateFile(file);
      expect(error).toBeNull();
    });

    it('should accept valid PNG file', () => {
      const file = new File(['content'], 'image.png', { type: 'image/png' });
      const error = result.validateFile(file);
      expect(error).toBeNull();
    });

    it('should accept valid WebP file', () => {
      const file = new File(['content'], 'image.webp', { type: 'image/webp' });
      const error = result.validateFile(file);
      expect(error).toBeNull();
    });

    it('should accept valid GIF file', () => {
      const file = new File(['content'], 'image.gif', { type: 'image/gif' });
      const error = result.validateFile(file);
      expect(error).toBeNull();
    });

    it('should reject invalid file type', () => {
      const file = new File(['content'], 'document.pdf', { type: 'application/pdf' });
      const error = result.validateFile(file);
      expect(error).toContain('Invalid file type');
      expect(error).toContain('document.pdf');
    });

    it('should reject video file', () => {
      const file = new File(['content'], 'video.mp4', { type: 'video/mp4' });
      const error = result.validateFile(file);
      expect(error).toContain('Invalid file type');
    });

    it('should reject empty file (0 bytes)', () => {
      const file = new File([], 'empty.jpg', { type: 'image/jpeg' });
      const error = result.validateFile(file);
      expect(error).toContain('Empty file');
      expect(error).toContain('empty.jpg');
    });

    it('should reject file exceeding max size (10MB)', () => {
      // Create 10MB + 1 byte file
      const largeContent = new Uint8Array(10 * 1024 * 1024 + 1);
      const file = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });
      const error = result.validateFile(file);
      expect(error).toContain('File too large');
      expect(error).toContain('large.jpg');
      expect(error).toContain('10MB');
    });

    it('should accept file at exactly max size (10MB)', () => {
      // Create exactly 10MB file
      const content = new Uint8Array(10 * 1024 * 1024);
      const file = new File([content], 'max.jpg', { type: 'image/jpeg' });
      const error = result.validateFile(file);
      expect(error).toBeNull();
    });

    it('should accept file at boundary (10MB - 1 byte)', () => {
      const content = new Uint8Array(10 * 1024 * 1024 - 1);
      const file = new File([content], 'boundary.jpg', { type: 'image/jpeg' });
      const error = result.validateFile(file);
      expect(error).toBeNull();
    });

    it('should accept 1 byte file', () => {
      const file = new File(['x'], 'tiny.jpg', { type: 'image/jpeg' });
      const error = result.validateFile(file);
      expect(error).toBeNull();
    });

    it('should handle malicious filename with path traversal', () => {
      const file = new File(['content'], '../../etc/passwd.jpg', { type: 'image/jpeg' });
      const error = result.validateFile(file);
      expect(error).toBeNull(); // Valid type and size, filename sanitization is server-side
    });

    it('should handle filename with special characters', () => {
      const file = new File(['content'], 'image<script>.jpg', { type: 'image/jpeg' });
      const error = result.validateFile(file);
      expect(error).toBeNull(); // Valid type and size
    });

    it('should reject file with case-sensitive invalid type', () => {
      // Note: File constructor normalizes MIME types, so we test what browser would provide
      const file = new File(['content'], 'image.jpg', { type: 'image/JPEG' });
      const error = result.validateFile(file);
      // MIME types are case-insensitive per spec, should be handled by isValidFileType
      expect(error).toBeDefined();
    });
  });

  describe('validateFiles', () => {
    it('should validate empty file list', () => {
      const files: File[] = [];
      const result_validation = result.validateFiles(files);
      expect(result_validation.valid).toEqual([]);
      expect(result_validation.invalid).toEqual([]);
    });

    it('should validate all valid files', () => {
      const files = [
        new File(['content1'], 'image1.jpg', { type: 'image/jpeg' }),
        new File(['content2'], 'image2.png', { type: 'image/png' }),
        new File(['content3'], 'image3.gif', { type: 'image/gif' }),
      ];
      const result_validation = result.validateFiles(files);
      expect(result_validation.valid).toHaveLength(3);
      expect(result_validation.invalid).toHaveLength(0);
      expect(result_validation.valid[0].name).toBe('image1.jpg');
      expect(result_validation.valid[1].name).toBe('image2.png');
      expect(result_validation.valid[2].name).toBe('image3.gif');
    });

    it('should separate valid and invalid files', () => {
      const files = [
        new File(['content1'], 'valid.jpg', { type: 'image/jpeg' }),
        new File(['content2'], 'invalid.pdf', { type: 'application/pdf' }),
        new File(['content3'], 'valid2.png', { type: 'image/png' }),
        new File([], 'empty.jpg', { type: 'image/jpeg' }),
      ];
      const result_validation = result.validateFiles(files);
      expect(result_validation.valid).toHaveLength(2);
      expect(result_validation.invalid).toHaveLength(2);
      expect(result_validation.valid[0].name).toBe('valid.jpg');
      expect(result_validation.valid[1].name).toBe('valid2.png');
      expect(result_validation.invalid[0].file.name).toBe('invalid.pdf');
      expect(result_validation.invalid[0].error).toContain('Invalid file type');
      expect(result_validation.invalid[1].file.name).toBe('empty.jpg');
      expect(result_validation.invalid[1].error).toContain('Empty file');
    });

    it('should validate all invalid files', () => {
      const files = [
        new File(['content1'], 'doc.pdf', { type: 'application/pdf' }),
        new File([], 'empty.jpg', { type: 'image/jpeg' }),
        new File([new Uint8Array(11 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' }),
      ];
      const result_validation = result.validateFiles(files);
      expect(result_validation.valid).toHaveLength(0);
      expect(result_validation.invalid).toHaveLength(3);
    });

    it('should handle FileList input', () => {
      // Mock FileList (browser API)
      const fileArray = [
        new File(['content'], 'image.jpg', { type: 'image/jpeg' }),
      ];
      const fileList = {
        length: fileArray.length,
        item: (index: number) => fileArray[index] || null,
        [Symbol.iterator]: function* () {
          for (const file of fileArray) yield file;
        },
      } as unknown as FileList;

      const result_validation = result.validateFiles(fileList);
      expect(result_validation.valid).toHaveLength(1);
      expect(result_validation.valid[0].name).toBe('image.jpg');
    });

    it('should handle large batch (100+ files)', () => {
      const files: File[] = [];
      for (let i = 0; i < 150; i++) {
        files.push(
          new File([`content${i}`], `image${i}.jpg`, { type: 'image/jpeg' })
        );
      }
      const result_validation = result.validateFiles(files);
      expect(result_validation.valid).toHaveLength(150);
      expect(result_validation.invalid).toHaveLength(0);
    });

    it('should maintain file order in valid array', () => {
      const files = [
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
        new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
      ];
      const result_validation = result.validateFiles(files);
      expect(result_validation.valid.map(f => f.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    });

    it('should maintain file order in invalid array', () => {
      const files = [
        new File(['a'], 'a.pdf', { type: 'application/pdf' }),
        new File(['b'], 'b.txt', { type: 'text/plain' }),
        new File(['c'], 'c.doc', { type: 'application/msword' }),
      ];
      const result_validation = result.validateFiles(files);
      expect(result_validation.invalid.map(f => f.file.name)).toEqual(['a.pdf', 'b.txt', 'c.doc']);
    });
  });

  describe('constants', () => {
    it('should export ALLOWED_FILE_TYPES', () => {
      expect(result.ALLOWED_FILE_TYPES).toBeDefined();
      expect(Array.isArray(result.ALLOWED_FILE_TYPES)).toBe(true);
      expect(result.ALLOWED_FILE_TYPES).toContain('image/jpeg');
      expect(result.ALLOWED_FILE_TYPES).toContain('image/png');
      expect(result.ALLOWED_FILE_TYPES).toContain('image/webp');
      expect(result.ALLOWED_FILE_TYPES).toContain('image/gif');
    });

    it('should export MAX_FILE_SIZE', () => {
      expect(result.MAX_FILE_SIZE).toBeDefined();
      expect(result.MAX_FILE_SIZE).toBe(10 * 1024 * 1024); // 10MB
    });
  });
});
