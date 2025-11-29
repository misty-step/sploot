import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE, isValidFileType, isValidFileSize } from '@/lib/blob';

/**
 * Validation error for a single file
 */
export interface FileValidationError {
  file: File;
  error: string;
}

/**
 * Result of file validation
 */
export interface FileValidationResult {
  valid: File[];
  invalid: FileValidationError[];
}

/**
 * Hook for validating files before upload
 *
 * Validates file type (JPEG, PNG, WebP, GIF) and size (max 10MB).
 * Returns separate arrays of valid and invalid files with error messages.
 *
 * @example
 * ```tsx
 * const { validateFiles, validateFile } = useFileValidation();
 *
 * // Validate multiple files
 * const result = validateFiles(fileList);
 * result.valid.forEach(file => upload(file));
 * result.invalid.forEach(({ file, error }) => showError(error));
 *
 * // Validate single file
 * const error = validateFile(file);
 * if (error) showError(error);
 * ```
 */
export function useFileValidation() {
  /**
   * Validates a single file for upload
   *
   * @param file - File to validate
   * @returns Error message if invalid, null if valid
   */
  const validateFile = (file: File): string | null => {
    if (!isValidFileType(file.type)) {
      return `Invalid file type: ${file.name}. Only JPEG, PNG, WebP, and GIF are allowed.`;
    }
    if (!isValidFileSize(file.size)) {
      if (file.size === 0) {
        return `Empty file: ${file.name}. File must have content.`;
      }
      return `File too large: ${file.name}. Maximum size is 10MB.`;
    }
    return null;
  };

  /**
   * Validates multiple files for upload
   *
   * @param files - Files to validate (FileList, File[], or iterable)
   * @returns Object with valid and invalid file arrays
   */
  const validateFiles = (files: FileList | File[] | Iterable<File>): FileValidationResult => {
    const filesArray = Array.from(files);
    const valid: File[] = [];
    const invalid: FileValidationError[] = [];

    for (const file of filesArray) {
      const error = validateFile(file);
      if (error) {
        invalid.push({ file, error });
      } else {
        valid.push(file);
      }
    }

    return { valid, invalid };
  };

  return {
    validateFile,
    validateFiles,
    /** Allowed MIME types for validation */
    ALLOWED_FILE_TYPES,
    /** Maximum file size in bytes (10MB) */
    MAX_FILE_SIZE,
  };
}
