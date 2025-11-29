'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ClipboardCheck, X } from 'lucide-react';

interface AssetIntegrityBannerProps {
  onAudit: () => void;
}

export function AssetIntegrityBanner({ onAudit }: AssetIntegrityBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <Alert variant="destructive" className="animate-in slide-in-from-top duration-300 rounded-none border-x-0 border-t-0">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center gap-3 w-full">
        <span className="flex-1 text-sm">
          <span className="font-medium">Data integrity warning:</span>
          {' '}
          Some assets may have broken storage links.
        </span>

        <div className="flex items-center gap-2">
          {/* Audit button */}
          <Button
            type="button"
            onClick={onAudit}
            size="sm"
            variant="outline"
            className="gap-1.5 border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:border-destructive/50"
          >
            <ClipboardCheck className="size-3" />
            Run Audit
          </Button>

          {/* Dismiss button */}
          <Button
            type="button"
            onClick={() => setDismissed(true)}
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            title="Dismiss warning"
          >
            <X className="size-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
