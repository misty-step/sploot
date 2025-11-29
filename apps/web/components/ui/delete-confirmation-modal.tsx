'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  imageUrl?: string;
  imageName?: string;
  loading?: boolean;
  showDontAskAgain?: boolean;
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete Image',
  description = 'Are you sure you want to delete this image? This action cannot be undone.',
  imageUrl,
  imageName,
  loading = false,
  showDontAskAgain = true,
}: DeleteConfirmationModalProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const handleConfirm = () => {
    if (dontAskAgain) {
      // Store preference in localStorage
      localStorage.setItem('skipDeleteConfirmation', 'true');
    }
    onConfirm();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {/* Image Preview */}
        {imageUrl && (
          <div className="relative bg-muted overflow-hidden border rounded-md">
            <Image
              src={imageUrl}
              alt={imageName || 'Image to delete'}
              width={400}
              height={128}
              className="w-full h-32 object-contain"
            />
            {imageName && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <p className="text-foreground text-xs truncate">
                  {imageName}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Don't ask again checkbox */}
        {showDontAskAgain && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="dont-ask-again"
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked as boolean)}
            />
            <Label
              htmlFor="dont-ask-again"
              className="text-sm cursor-pointer select-none"
            >
              Don&apos;t ask me again
            </Label>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Export a hook to manage delete confirmation state
export function useDeleteConfirmation() {
  const [isOpen, setIsOpen] = useState(false);
  const [targetAsset, setTargetAsset] = useState<{
    id: string;
    imageUrl?: string;
    imageName?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const shouldSkipConfirmation = () => {
    return localStorage.getItem('skipDeleteConfirmation') === 'true';
  };

  const openConfirmation = (asset: {
    id: string;
    imageUrl?: string;
    imageName?: string;
  }) => {
    if (shouldSkipConfirmation()) {
      // Return true to indicate immediate confirmation
      return true;
    }
    setTargetAsset(asset);
    setIsOpen(true);
    return false;
  };

  const closeConfirmation = () => {
    setIsOpen(false);
    setTargetAsset(null);
    setLoading(false);
  };

  const resetPreference = () => {
    localStorage.removeItem('skipDeleteConfirmation');
  };

  return {
    isOpen,
    targetAsset,
    loading,
    setLoading,
    openConfirmation,
    closeConfirmation,
    resetPreference,
    shouldSkipConfirmation,
  };
}
