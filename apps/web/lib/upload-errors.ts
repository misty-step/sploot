/**
 * Upload Error Types and Utilities
 */

export enum UploadErrorType {
  DUPLICATE = 'duplicate',
  FILE_TOO_LARGE = 'file_too_large',
  INVALID_TYPE = 'invalid_type',
  STORAGE_FAILED = 'storage_failed',
  DATABASE_FAILED = 'database_failed',
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  RATE_LIMITED = 'rate_limited',
  SERVER_ERROR = 'server_error',
  AUTH_REQUIRED = 'auth_required',
  QUOTA_EXCEEDED = 'quota_exceeded',
  PROCESSING_FAILED = 'processing_failed',
  UNKNOWN = 'unknown',
}

export interface UploadErrorDetails {
  type: UploadErrorType;
  message: string;
  userMessage: string;
  action?: {
    label: string;
    type: 'retry' | 'view' | 'signin' | 'upgrade' | 'contact';
    data?: any;
  };
  retryable: boolean;
}

/**
 * Map API error responses to user-friendly error details
 */
export function getUploadErrorDetails(
  error: Error | string,
  statusCode?: number
): UploadErrorDetails {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const lowerMessage = errorMessage.toLowerCase();

  // Check for duplicate
  if (lowerMessage.includes('already exists') || lowerMessage.includes('duplicate')) {
    return {
      type: UploadErrorType.DUPLICATE,
      message: errorMessage,
      userMessage: 'This image is already in your library',
      action: {
        label: 'View existing',
        type: 'view',
      },
      retryable: false,
    };
  }

  // Check for file size
  if (lowerMessage.includes('file size') || lowerMessage.includes('too large')) {
    return {
      type: UploadErrorType.FILE_TOO_LARGE,
      message: errorMessage,
      userMessage: 'File is too large. Maximum size is 10MB',
      retryable: false,
    };
  }

  // Check for invalid file type
  if (lowerMessage.includes('invalid file type') || lowerMessage.includes('not allowed')) {
    return {
      type: UploadErrorType.INVALID_TYPE,
      message: errorMessage,
      userMessage: 'File type not supported. Use JPEG, PNG, WebP, or GIF',
      retryable: false,
    };
  }

  // Check for storage errors
  if (lowerMessage.includes('blob') || lowerMessage.includes('storage')) {
    return {
      type: UploadErrorType.STORAGE_FAILED,
      message: errorMessage,
      userMessage: 'Failed to store image. Please try again',
      action: {
        label: 'Retry upload',
        type: 'retry',
      },
      retryable: true,
    };
  }

  // Check for database errors
  if (lowerMessage.includes('database') || lowerMessage.includes('prisma')) {
    return {
      type: UploadErrorType.DATABASE_FAILED,
      message: errorMessage,
      userMessage: 'Failed to save image details. Please try again',
      action: {
        label: 'Retry upload',
        type: 'retry',
      },
      retryable: true,
    };
  }

  // Check for timeout errors
  if (lowerMessage.includes('timeout')) {
    return {
      type: UploadErrorType.TIMEOUT,
      message: errorMessage,
      userMessage: 'Upload timed out - file too large or slow connection',
      action: {
        label: 'Retry upload',
        type: 'retry',
      },
      retryable: true,
    };
  }

  // Check for rate limiting
  if (statusCode === 429 || lowerMessage.includes('rate limit') || lowerMessage.includes('too many')) {
    return {
      type: UploadErrorType.RATE_LIMITED,
      message: errorMessage,
      userMessage: 'Too many uploads. Please wait a moment and try again',
      action: {
        label: 'Retry upload',
        type: 'retry',
      },
      retryable: true,
    };
  }

  // Check for server errors
  if ((statusCode && statusCode >= 500) || lowerMessage.includes('server error') || lowerMessage.includes('internal error')) {
    return {
      type: UploadErrorType.SERVER_ERROR,
      message: errorMessage,
      userMessage: 'Server error occurred. Please try again later',
      action: {
        label: 'Retry upload',
        type: 'retry',
      },
      retryable: true,
    };
  }

  // Check for auth errors
  if (statusCode === 401 || lowerMessage.includes('unauthorized') || lowerMessage.includes('auth')) {
    return {
      type: UploadErrorType.AUTH_REQUIRED,
      message: errorMessage,
      userMessage: 'Please sign in to upload images',
      action: {
        label: 'Sign in',
        type: 'signin',
      },
      retryable: false,
    };
  }

  // Check for quota errors
  if (lowerMessage.includes('quota') || lowerMessage.includes('limit exceeded')) {
    return {
      type: UploadErrorType.QUOTA_EXCEEDED,
      message: errorMessage,
      userMessage: 'Storage quota exceeded',
      action: {
        label: 'Upgrade plan',
        type: 'upgrade',
      },
      retryable: false,
    };
  }

  // Check for processing errors
  if (lowerMessage.includes('processing') || lowerMessage.includes('thumbnail')) {
    return {
      type: UploadErrorType.PROCESSING_FAILED,
      message: errorMessage,
      userMessage: 'Image processing failed, but upload succeeded',
      retryable: false,
    };
  }

  // Check for network errors
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    statusCode === 0 ||
    statusCode === 503
  ) {
    return {
      type: UploadErrorType.NETWORK_ERROR,
      message: errorMessage,
      userMessage: 'Connection lost. Please check your internet and try again',
      action: {
        label: 'Retry upload',
        type: 'retry',
      },
      retryable: true,
    };
  }

  // Default unknown error
  return {
    type: UploadErrorType.UNKNOWN,
    message: errorMessage,
    userMessage: 'Something went wrong. Please try again',
    action: {
      label: 'Contact support',
      type: 'contact',
    },
    retryable: true,
  };
}

/**
 * Format file size for error messages
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}