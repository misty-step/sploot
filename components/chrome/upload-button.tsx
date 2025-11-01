'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSpringScale } from '@/hooks/use-spring-animation';

interface UploadButtonProps {
  onClick?: () => void;
  isActive?: boolean;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Upload button component for the navbar
 * Uses shadcn Button with upload variant
 */
export function UploadButton({
  onClick,
  isActive = false,
  className,
  showLabel = true,
  size = 'md',
}: UploadButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // Spring physics for scale animation
  const scale = useSpringScale(isHovered, isPressed);

  // Map custom size to Button size
  const buttonSize = size === 'md' ? 'default' : size;

  return (
    <Button
      variant="outline"
      size={buttonSize}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      style={{
        transform: `scale(${scale})`,
      }}
      className={cn(
        'relative touch-manipulation font-mono text-sm',
        showLabel && 'px-6',
        className
      )}
      aria-label={showLabel ? undefined : 'Upload'}
      title={showLabel ? undefined : 'Upload new meme'}
    >
      <Upload className="h-4 w-4" strokeWidth={2} />
      {showLabel && 'upload'}
    </Button>
  );
}

/**
 * Floating upload button for mobile or alternative layouts
 * Uses shadcn Button with upload variant and icon size
 */
export function UploadButtonFloating({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // Spring physics with slightly bouncier config for floating button
  const scale = useSpringScale(isHovered, isPressed, {
    stiffness: 350,
    damping: 20,
    mass: 0.8,
  });

  return (
    <Button
      variant="outline"
      size="icon-lg"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      style={{
        transform: `scale(${scale})`,
      }}
      className={cn('shadow-lg hover:shadow-xl group', className)}
      aria-label="Upload new meme"
    >
      <Upload className="h-6 w-6 group-hover:scale-110 transition-transform" strokeWidth={2} />
    </Button>
  );
}
