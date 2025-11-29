'use client';

import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SettingsGearProps {
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

/**
 * Settings gear icon for footer navigation
 * Uses shadcn Button with ghost variant and icon size
 * 90deg rotation on hover
 */
export function SettingsGear({
  onClick,
  className,
  size = 'md',
  showTooltip = true,
}: SettingsGearProps) {
  // Map custom size to Button size
  const buttonSize = size === 'md' ? 'icon' : size === 'sm' ? 'icon-sm' : 'icon-lg';

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      // Default navigation to settings page
      window.location.href = '/app/settings';
    }
  };

  return (
    <Button
      variant="ghost"
      size={buttonSize}
      onClick={handleClick}
      className={cn(
        'text-muted-foreground hover:text-foreground',
        'transition-all duration-200',
        'hover:rotate-90',
        'mr-2',
        className
      )}
      aria-label="Settings"
      title={showTooltip ? 'Settings' : undefined}
    >
      <Settings className="h-4 w-4" strokeWidth={2} />
    </Button>
  );
}