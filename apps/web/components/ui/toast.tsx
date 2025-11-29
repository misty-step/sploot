'use client';

import { toast as sonnerToast, Toaster } from 'sonner';

// Re-export Toaster component for use in layout
export { Toaster };

// Global function to show toast - maintains backward compatibility
export function showToast(
  message: string,
  type: 'success' | 'error' | 'info' | 'processing' | 'complete' = 'success',
  duration = 3000,
) {
  const options = {
    duration,
  };

  switch (type) {
    case 'success':
    case 'complete':
      sonnerToast.success(message, options);
      break;
    case 'error':
      sonnerToast.error(message, options);
      break;
    case 'info':
      sonnerToast.info(message, options);
      break;
    case 'processing':
      sonnerToast.loading(message, options);
      break;
    default:
      sonnerToast(message, options);
  }
}

// Export toast function directly for direct usage
export const toast = sonnerToast;
