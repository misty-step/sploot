'use client';

import { useState } from 'react';
import { Share2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useWebShare } from '@/hooks/use-web-share';
import { useIsMobile } from '@/hooks/use-is-mobile';

interface ShareMemeInput {
  assetId: string;
  blobUrl?: string;
  filename?: string;
  mimeType?: string;
}

interface ShareButtonProps extends ShareMemeInput {
  variant?: 'ghost' | 'default';
  size?: 'icon' | 'icon-sm';
  className?: string;
}

/**
 * The share flow, extracted so the toybox tile action rail can trigger the
 * exact same logic the standalone ShareButton runs: native file share →
 * desktop image clipboard → share-link fallback. Returns the handler plus its
 * loading flag; both the rail and ShareButton compose it.
 */
export function useShareMeme({ assetId, blobUrl, filename, mimeType }: ShareMemeInput) {
  const [loading, setLoading] = useState(false);
  const { isSupported: isWebShareSupported, canShareFiles } = useWebShare();
  const isMobile = useIsMobile();

  const getShareFilename = () => {
    if (filename?.trim()) return filename.trim();
    const extension = mimeType?.split('/')[1] || 'png';
    return `sploot-meme.${extension}`;
  };

  const fetchMemeBlob = async (): Promise<Blob> => {
    if (!blobUrl) {
      throw new Error('Image unavailable for sharing');
    }

    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch image for sharing');
    }

    const blob = await response.blob();
    const resolvedType = blob.type || mimeType || response.headers.get('content-type') || '';
    if (!resolvedType.startsWith('image/')) {
      throw new Error('Only image memes can be shared as files');
    }

    return blob.type ? blob : blob.slice(0, blob.size, resolvedType);
  };

  const getMemeFile = async (): Promise<File> => {
    const blob = await fetchMemeBlob();
    return new File([blob], getShareFilename(), {
      type: blob.type || mimeType || 'image/png',
    });
  };

  const convertImageBlobToPng = async (blob: Blob): Promise<Blob> => {
    if (blob.type === 'image/png') {
      return blob;
    }

    const image = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Image clipboard is unavailable');
      }

      context.drawImage(image, 0, 0);

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((pngBlob) => {
          if (pngBlob) {
            resolve(pngBlob);
          } else {
            reject(new Error('Failed to prepare image for clipboard'));
          }
        }, 'image/png');
      });
    } finally {
      image.close();
    }
  };

  const copyImageToClipboard = async (): Promise<boolean> => {
    const ClipboardItemConstructor = typeof window !== 'undefined' ? window.ClipboardItem : undefined;
    if (!navigator.clipboard?.write || !ClipboardItemConstructor || !blobUrl) {
      return false;
    }

    const blob = await fetchMemeBlob();
    const clipboardBlob = await convertImageBlobToPng(blob);

    await navigator.clipboard.write([
      new ClipboardItemConstructor({
        [clipboardBlob.type || 'image/png']: clipboardBlob,
      }),
    ]);

    toast.success('Image copied. Paste it into Slack or a chat.');
    return true;
  };

  const handleNativeFileShare = async (): Promise<boolean> => {
    if (!isWebShareSupported || !canShareFiles || !blobUrl) {
      return false;
    }

    const file = await getMemeFile();
    const shareData: ShareData = {
      title: filename || 'Meme from sploot',
      files: [file],
    };

    if ('canShare' in navigator && typeof navigator.canShare === 'function' && !navigator.canShare(shareData)) {
      return false;
    }

    try {
      await navigator.share(shareData);
      toast.success('Image shared');
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return true;
      }

      if (error instanceof Error && error.name === 'NotAllowedError') {
        console.error(`[ShareButton] File share not allowed for asset ${assetId}:`, error);
        toast.error('Share permission denied');
        return false;
      }

      console.error(`[ShareButton] Native file share failed for asset ${assetId}:`, error);
      return false;
    }
  };

  const handleNativeUrlShare = async (shareUrl: string): Promise<boolean> => {
    try {
      const shareData: ShareData = {
        title: filename || 'Check out this meme from sploot',
        url: shareUrl,
      };

      await navigator.share(shareData);

      toast.success('Share sheet opened');
      return true;
    } catch (error) {
      // User cancelled share (AbortError) - handle silently
      if (error instanceof Error && error.name === 'AbortError') {
        return true; // Success - user just cancelled
      }

      // Permission denied or not allowed error
      if (error instanceof Error && error.name === 'NotAllowedError') {
        console.error(`[ShareButton] Share not allowed for asset ${assetId}:`, error);
        toast.error('Share permission denied');
        return false;
      }

      console.error(`[ShareButton] Native URL share failed for asset ${assetId}:`, error);
      return false;
    }
  };

  /**
   * Main share handler - branches between native share and clipboard fallback.
   */
  const handleShare = async () => {
    setLoading(true);
    try {
      if (await handleNativeFileShare()) {
        return;
      }

      if (!isMobile && await copyImageToClipboard()) {
        return;
      }

      // Generate share URL via API
      const res = await fetch(`/api/assets/${assetId}/share`, { method: 'POST' });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to generate share link');
      }

      const { shareUrl } = await res.json();

      // Fallback to URL sharing only when file share/image clipboard is unavailable.
      if (isWebShareSupported && isMobile) {
        const nativeShareSuccess = await handleNativeUrlShare(shareUrl);
        if (nativeShareSuccess) {
          return; // Native share handled it
        }
        // Fall through to clipboard if native share failed
      }

      // Fallback: Copy to clipboard
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied! Share it with friends');
    } catch (error) {
      console.error('[ShareButton] Share failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to share');
    } finally {
      setLoading(false);
    }
  };

  return { share: handleShare, loading };
}

export function ShareButton({
  assetId,
  blobUrl,
  filename,
  mimeType,
  variant = 'ghost',
  size = 'icon-sm',
  className,
}: ShareButtonProps) {
  const { share, loading } = useShareMeme({ assetId, blobUrl, filename, mimeType });

  return (
    <Button
      variant={variant}
      size={size}
      onClick={share}
      disabled={loading}
      aria-label="Share meme"
      className={className}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Share2 className="h-4 w-4" />
      )}
    </Button>
  );
}
