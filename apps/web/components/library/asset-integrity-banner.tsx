'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/sploot';
import { AlertTriangle, ClipboardCheck, X } from 'lucide-react';

interface AssetIntegrityBannerProps {
  onAudit: () => void;
}

export function AssetIntegrityBanner({ onAudit }: AssetIntegrityBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      role="alert"
      className="animate-in slide-in-from-top duration-300 flex items-center gap-3 border-b-[3px] border-sploot-ink bg-sploot-red px-4 py-2.5 text-white"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1 font-sans text-sm">
        <span className="font-extrabold">data integrity warning:</span>{' '}
        some assets may have broken storage links.
      </span>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={onAudit} size="sm" variant="ink" className="gap-1.5">
          <ClipboardCheck className="size-3" />
          run audit
        </Button>

        <IconButton
          label="dismiss warning"
          onClick={() => setDismissed(true)}
          className="hover:!bg-sploot-panel"
        >
          <X />
        </IconButton>
      </div>
    </div>
  );
}
