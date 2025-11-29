'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { UploadErrorDetails, UploadErrorType } from '@/lib/upload-errors';

interface UploadErrorDisplayProps {
  error: UploadErrorDetails;
  fileId: string;
  fileName: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function UploadErrorDisplay({
  error,
  fileId,
  fileName,
  onRetry,
  onDismiss,
  className,
}: UploadErrorDisplayProps) {
  const router = useRouter();

  const handleAction = () => {
    if (!error.action) return;

    switch (error.action.type) {
      case 'retry':
        onRetry?.();
        break;
      case 'view':
        if (error.action.data?.assetId) {
          router.push(`/app?highlight=${error.action.data.assetId}`);
        }
        break;
      case 'signin':
        router.push('/sign-in');
        break;
      case 'upgrade':
        router.push('/app/settings?tab=billing');
        break;
      case 'contact':
        window.open('mailto:support@sploot.app?subject=Upload Error', '_blank');
        break;
    }
  };

  const getErrorIcon = () => {
    switch (error.type) {
      case UploadErrorType.DUPLICATE:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        );
      case UploadErrorType.FILE_TOO_LARGE:
      case UploadErrorType.QUOTA_EXCEEDED:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case UploadErrorType.NETWORK_ERROR:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
            />
          </svg>
        );
      case UploadErrorType.AUTH_REQUIRED:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        );
    }
  };

  const getErrorColor = () => {
    switch (error.type) {
      case UploadErrorType.DUPLICATE:
        return 'text-orange-500 border-orange-500/20 bg-orange-500/10';
      case UploadErrorType.PROCESSING_FAILED:
        return 'text-orange-500 border-orange-500/20 bg-orange-500/10';
      default:
        return 'text-destructive border-destructive/20 bg-destructive/10';
    }
  };

  return (
    <div
      className={cn(
        ' border p-3',
        getErrorColor(),
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          {getErrorIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm mb-1 truncate" title={fileName}>
            {fileName}
          </p>
          <p className="text-xs opacity-90 mb-2">
            {error.userMessage}
          </p>

          <div className="flex items-center gap-2">
            {error.action && (
              <button
                onClick={handleAction}
                className={cn(
                  'text-xs font-medium px-3 py-1  transition-colors',
                  'bg-white/10 hover:bg-white/20'
                )}
              >
                {error.action.label}
              </button>
            )}

            {error.retryable && onRetry && !error.action && (
              <button
                onClick={onRetry}
                className="text-xs font-medium px-3 py-1 bg-white/10 hover:bg-white/20 transition-colors"
              >
                Retry
              </button>
            )}

            {onDismiss && (
              <button
                onClick={onDismiss}
                className="ml-auto text-xs opacity-60 hover:opacity-100 transition-opacity"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}