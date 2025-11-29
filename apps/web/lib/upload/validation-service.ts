import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '@/lib/blob';

/**
 * Validation error with user-facing message
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public errorType: string,
    public userMessage: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Result of file validation
 */
export interface ValidationResult {
  valid: boolean;
  error?: ValidationError;
}

/**
 * Configuration for upload validation
 */
export interface ValidationConfig {
  allowedTypes?: string[];
  maxFileSize?: number;
  maxTagLength?: number;
  maxTags?: number;
}

/**
 * Service for validating upload requests.
 * Deep module: simple validation interface hides MIME type lists, size calculations, tag sanitization.
 *
 * Interface: 3 validation methods (file type, size, tags)
 * Hidden: MIME type normalization, size formatting, tag sanitization logic
 */
export class UploadValidationService {
  private allowedTypes: string[];
  private maxFileSize: number;
  private maxTagLength: number;
  private maxTags: number;

  constructor(config?: ValidationConfig) {
    this.allowedTypes = config?.allowedTypes ?? ALLOWED_FILE_TYPES;
    this.maxFileSize = config?.maxFileSize ?? MAX_FILE_SIZE;
    this.maxTagLength = config?.maxTagLength ?? 50;
    this.maxTags = config?.maxTags ?? 20;
  }

  /**
   * Validate file MIME type against allowed types
   */
  validateFileType(mimeType: string): ValidationResult {
    const normalizedType = mimeType.toLowerCase().trim();

    if (!this.allowedTypes.includes(normalizedType)) {
      return {
        valid: false,
        error: new ValidationError(
          `Invalid file type: ${mimeType}. Only JPEG, PNG, WebP, and GIF images are allowed.`,
          'invalid_type',
          'File type not supported. Use JPEG, PNG, WebP, or GIF'
        ),
      };
    }

    return { valid: true };
  }

  /**
   * Validate file size is within limits
   */
  validateFileSize(size: number): ValidationResult {
    if (size <= 0) {
      return {
        valid: false,
        error: new ValidationError(
          'File size must be greater than 0',
          'invalid_size',
          'File appears to be empty'
        ),
      };
    }

    if (size > this.maxFileSize) {
      const sizeMB = (size / 1024 / 1024).toFixed(2);
      const maxMB = (this.maxFileSize / 1024 / 1024).toFixed(0);

      return {
        valid: false,
        error: new ValidationError(
          `File size (${sizeMB}MB) exceeds the ${maxMB}MB limit`,
          'file_too_large',
          `File is too large (${(size / 1024 / 1024).toFixed(1)}MB). Maximum size is ${maxMB}MB`
        ),
      };
    }

    return { valid: true };
  }

  /**
   * Validate and sanitize tags array
   */
  validateTags(tags: string[]): ValidationResult {
    if (!Array.isArray(tags)) {
      return {
        valid: false,
        error: new ValidationError(
          'Tags must be an array',
          'invalid_tags',
          'Invalid tag format'
        ),
      };
    }

    if (tags.length > this.maxTags) {
      return {
        valid: false,
        error: new ValidationError(
          `Too many tags: ${tags.length}. Maximum is ${this.maxTags}`,
          'too_many_tags',
          `You can add up to ${this.maxTags} tags per upload`
        ),
      };
    }

    // Check individual tag length and content
    for (const tag of tags) {
      if (typeof tag !== 'string') {
        return {
          valid: false,
          error: new ValidationError(
            'All tags must be strings',
            'invalid_tag_type',
            'Invalid tag format'
          ),
        };
      }

      const trimmed = tag.trim();
      if (trimmed.length === 0) {
        return {
          valid: false,
          error: new ValidationError(
            'Tags cannot be empty',
            'empty_tag',
            'Empty tags are not allowed'
          ),
        };
      }

      if (trimmed.length > this.maxTagLength) {
        return {
          valid: false,
          error: new ValidationError(
            `Tag "${trimmed.substring(0, 20)}..." exceeds ${this.maxTagLength} character limit`,
            'tag_too_long',
            `Tags must be ${this.maxTagLength} characters or less`
          ),
        };
      }

      // Check for potentially malicious content (basic XSS prevention)
      if (/<|>|&lt;|&gt;|javascript:|on\w+=/i.test(trimmed)) {
        return {
          valid: false,
          error: new ValidationError(
            'Tag contains invalid characters',
            'invalid_tag_content',
            'Tags cannot contain special characters like < or >'
          ),
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate entire upload request
   * Returns first validation error encountered
   */
  validateUpload(file: File, tags?: string[]): ValidationResult {
    // Validate file type
    const typeResult = this.validateFileType(file.type);
    if (!typeResult.valid) {
      return typeResult;
    }

    // Validate file size
    const sizeResult = this.validateFileSize(file.size);
    if (!sizeResult.valid) {
      return sizeResult;
    }

    // Validate tags if provided
    if (tags && tags.length > 0) {
      const tagsResult = this.validateTags(tags);
      if (!tagsResult.valid) {
        return tagsResult;
      }
    }

    return { valid: true };
  }

  /**
   * Sanitize tags by trimming whitespace and removing duplicates
   */
  sanitizeTags(tags: string[]): string[] {
    if (!Array.isArray(tags)) {
      return [];
    }

    // Trim, deduplicate, and filter empty strings
    const uniqueTags = new Set(
      tags
        .map(tag => typeof tag === 'string' ? tag.trim() : '')
        .filter(tag => tag.length > 0)
    );

    return Array.from(uniqueTags);
  }
}

/**
 * Singleton instance for convenience
 */
let defaultValidator: UploadValidationService | null = null;

export function getValidationService(): UploadValidationService {
  if (!defaultValidator) {
    defaultValidator = new UploadValidationService();
  }
  return defaultValidator;
}
