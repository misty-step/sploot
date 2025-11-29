import { describe, it, expect, beforeEach } from 'vitest';
import { UploadValidationService, ValidationError } from '@/lib/upload/validation-service';
import { MAX_FILE_SIZE } from '@/lib/blob';

describe('UploadValidationService', () => {
  let validator: UploadValidationService;

  beforeEach(() => {
    validator = new UploadValidationService();
  });

  describe('validateFileType', () => {
    it('accepts valid JPEG MIME type', () => {
      const result = validator.validateFileType('image/jpeg');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts valid PNG MIME type', () => {
      const result = validator.validateFileType('image/png');
      expect(result.valid).toBe(true);
    });

    it('accepts valid WebP MIME type', () => {
      const result = validator.validateFileType('image/webp');
      expect(result.valid).toBe(true);
    });

    it('accepts valid GIF MIME type', () => {
      const result = validator.validateFileType('image/gif');
      expect(result.valid).toBe(true);
    });

    it('normalizes MIME type to lowercase', () => {
      const result = validator.validateFileType('IMAGE/JPEG');
      expect(result.valid).toBe(true);
    });

    it('trims whitespace from MIME type', () => {
      const result = validator.validateFileType('  image/png  ');
      expect(result.valid).toBe(true);
    });

    it('rejects invalid MIME type', () => {
      const result = validator.validateFileType('application/pdf');
      expect(result.valid).toBe(false);
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error?.errorType).toBe('invalid_type');
    });

    it('rejects SVG files (potential XSS vector)', () => {
      const result = validator.validateFileType('image/svg+xml');
      expect(result.valid).toBe(false);
    });

    it('rejects video files', () => {
      const result = validator.validateFileType('video/mp4');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateFileSize', () => {
    it('accepts valid file size', () => {
      const result = validator.validateFileSize(1024 * 1024); // 1MB
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts file at exact size limit', () => {
      const result = validator.validateFileSize(MAX_FILE_SIZE);
      expect(result.valid).toBe(true);
    });

    it('accepts 1 byte file', () => {
      const result = validator.validateFileSize(1);
      expect(result.valid).toBe(true);
    });

    it('rejects zero byte file', () => {
      const result = validator.validateFileSize(0);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('invalid_size');
    });

    it('rejects negative file size', () => {
      const result = validator.validateFileSize(-100);
      expect(result.valid).toBe(false);
    });

    it('rejects file exceeding size limit by 1 byte', () => {
      const result = validator.validateFileSize(MAX_FILE_SIZE + 1);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('file_too_large');
    });

    it('rejects very large file', () => {
      const result = validator.validateFileSize(100 * 1024 * 1024); // 100MB
      expect(result.valid).toBe(false);
      expect(result.error?.userMessage).toContain('Maximum size is 10MB');
    });

    it('provides user-friendly error message with size in MB', () => {
      const result = validator.validateFileSize(15 * 1024 * 1024); // 15MB
      expect(result.error?.userMessage).toMatch(/\d+\.\d+ ?MB/);
    });
  });

  describe('validateTags', () => {
    it('accepts valid tag array', () => {
      const result = validator.validateTags(['tag1', 'tag2', 'tag3']);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts empty tag array', () => {
      const result = validator.validateTags([]);
      expect(result.valid).toBe(true);
    });

    it('accepts single tag', () => {
      const result = validator.validateTags(['mytag']);
      expect(result.valid).toBe(true);
    });

    it('rejects non-array tags', () => {
      const result = validator.validateTags('not an array' as any);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('invalid_tags');
    });

    it('rejects too many tags', () => {
      const manyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
      const result = validator.validateTags(manyTags);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('too_many_tags');
    });

    it('accepts exactly max tags', () => {
      const maxTags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
      const result = validator.validateTags(maxTags);
      expect(result.valid).toBe(true);
    });

    it('rejects non-string tag', () => {
      const result = validator.validateTags(['valid', 123 as any, 'another']);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('invalid_tag_type');
    });

    it('rejects empty string tag', () => {
      const result = validator.validateTags(['valid', '', 'another']);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('empty_tag');
    });

    it('rejects whitespace-only tag', () => {
      const result = validator.validateTags(['valid', '   ', 'another']);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('empty_tag');
    });

    it('rejects tag exceeding length limit', () => {
      const longTag = 'a'.repeat(51);
      const result = validator.validateTags([longTag]);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('tag_too_long');
    });

    it('accepts tag at exact length limit', () => {
      const maxLengthTag = 'a'.repeat(50);
      const result = validator.validateTags([maxLengthTag]);
      expect(result.valid).toBe(true);
    });

    it('rejects tag with XSS attempt - script tag', () => {
      const result = validator.validateTags(['<script>alert("xss")</script>']);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('invalid_tag_content');
    });

    it('rejects tag with XSS attempt - javascript protocol', () => {
      const result = validator.validateTags(['javascript:alert("xss")']);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('invalid_tag_content');
    });

    it('rejects tag with XSS attempt - event handler', () => {
      const result = validator.validateTags(['onclick=alert("xss")']);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('invalid_tag_content');
    });

    it('rejects tag with HTML entities', () => {
      const result = validator.validateTags(['&lt;script&gt;']);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('invalid_tag_content');
    });

    it('accepts tag with safe special characters', () => {
      const result = validator.validateTags(['tag-with-dash', 'tag_underscore', 'tag.dot']);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateUpload', () => {
    it('accepts valid upload with file and tags', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const result = validator.validateUpload(file, ['tag1', 'tag2']);
      expect(result.valid).toBe(true);
    });

    it('accepts valid upload without tags', () => {
      const file = new File(['content'], 'test.png', { type: 'image/png' });
      const result = validator.validateUpload(file);
      expect(result.valid).toBe(true);
    });

    it('accepts valid upload with empty tag array', () => {
      const file = new File(['content'], 'test.webp', { type: 'image/webp' });
      const result = validator.validateUpload(file, []);
      expect(result.valid).toBe(true);
    });

    it('rejects upload with invalid file type', () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const result = validator.validateUpload(file, ['tag1']);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('invalid_type');
    });

    it('rejects upload with invalid file size', () => {
      const largeContent = new Uint8Array(MAX_FILE_SIZE + 1);
      const file = new File([largeContent], 'test.jpg', { type: 'image/jpeg' });
      const result = validator.validateUpload(file, ['tag1']);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('file_too_large');
    });

    it('rejects upload with invalid tags', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const result = validator.validateUpload(file, ['<script>']);
      expect(result.valid).toBe(false);
      expect(result.error?.errorType).toBe('invalid_tag_content');
    });

    it('returns first validation error encountered', () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const result = validator.validateUpload(file, ['<script>']);
      // Should fail on file type first, not tags
      expect(result.error?.errorType).toBe('invalid_type');
    });
  });

  describe('sanitizeTags', () => {
    it('trims whitespace from tags', () => {
      const result = validator.sanitizeTags(['  tag1  ', ' tag2 ']);
      expect(result).toEqual(['tag1', 'tag2']);
    });

    it('removes duplicate tags', () => {
      const result = validator.sanitizeTags(['tag1', 'tag2', 'tag1', 'tag3']);
      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('removes empty strings', () => {
      const result = validator.sanitizeTags(['tag1', '', '  ', 'tag2']);
      expect(result).toEqual(['tag1', 'tag2']);
    });

    it('handles non-array input gracefully', () => {
      const result = validator.sanitizeTags('not an array' as any);
      expect(result).toEqual([]);
    });

    it('handles non-string elements gracefully', () => {
      const result = validator.sanitizeTags(['tag1', 123 as any, null as any, 'tag2']);
      expect(result).toEqual(['tag1', 'tag2']);
    });

    it('preserves case sensitivity', () => {
      const result = validator.sanitizeTags(['Tag1', 'TAG1', 'tag1']);
      expect(result).toEqual(['Tag1', 'TAG1', 'tag1']);
    });

    it('returns empty array for empty input', () => {
      const result = validator.sanitizeTags([]);
      expect(result).toEqual([]);
    });
  });

  describe('custom configuration', () => {
    it('accepts custom allowed types', () => {
      const customValidator = new UploadValidationService({
        allowedTypes: ['image/jpeg'],
      });

      const jpegResult = customValidator.validateFileType('image/jpeg');
      expect(jpegResult.valid).toBe(true);

      const pngResult = customValidator.validateFileType('image/png');
      expect(pngResult.valid).toBe(false);
    });

    it('accepts custom max file size', () => {
      const customValidator = new UploadValidationService({
        maxFileSize: 1024 * 1024, // 1MB
      });

      const smallResult = customValidator.validateFileSize(500 * 1024);
      expect(smallResult.valid).toBe(true);

      const largeResult = customValidator.validateFileSize(2 * 1024 * 1024);
      expect(largeResult.valid).toBe(false);
    });

    it('accepts custom max tag length', () => {
      const customValidator = new UploadValidationService({
        maxTagLength: 10,
      });

      const shortResult = customValidator.validateTags(['shortag']);
      expect(shortResult.valid).toBe(true);

      const longResult = customValidator.validateTags(['verylongtag']);
      expect(longResult.valid).toBe(false);
    });

    it('accepts custom max tags count', () => {
      const customValidator = new UploadValidationService({
        maxTags: 5,
      });

      const fewResult = customValidator.validateTags(['a', 'b', 'c', 'd', 'e']);
      expect(fewResult.valid).toBe(true);

      const manyResult = customValidator.validateTags(['a', 'b', 'c', 'd', 'e', 'f']);
      expect(manyResult.valid).toBe(false);
    });
  });

  describe('ValidationError', () => {
    it('includes error type and user message', () => {
      const error = new ValidationError(
        'Technical message',
        'error_type',
        'User-friendly message'
      );

      expect(error.message).toBe('Technical message');
      expect(error.errorType).toBe('error_type');
      expect(error.userMessage).toBe('User-friendly message');
      expect(error.statusCode).toBe(400);
    });

    it('accepts custom status code', () => {
      const error = new ValidationError(
        'Message',
        'type',
        'User message',
        403
      );

      expect(error.statusCode).toBe(403);
    });
  });
});
