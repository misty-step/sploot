'use client';

import { useAuthActions, useAuthUser } from '@/lib/auth/client';
import { Settings, LogOut } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  className?: string;
  avatarSize?: 'sm' | 'md' | 'lg';
  showDropdown?: boolean;
  onSignOut?: () => void;
}

/**
 * User avatar component for the navbar
 * Uses shadcn Avatar + DropdownMenu primitives
 */
export function UserAvatar({
  className,
  avatarSize = 'md',
  showDropdown = true,
  onSignOut,
}: UserAvatarProps) {
  const { signOut } = useAuthActions();
  const { user } = useAuthUser();

  // Avatar size configurations
  const sizeClasses = {
    sm: 'size-7',
    md: 'size-8', // 32px as specified
    lg: 'size-10',
  };

  const handleSignOut = async () => {
    if (onSignOut) {
      onSignOut();
    } else {
      await signOut();
    }
  };

  const getUserInitial = () => {
    return user?.firstName?.[0] || user?.username?.[0] || '?';
  };

  const getUserDisplay = () => {
    return user?.firstName || user?.username || 'User';
  };

  const getUserEmail = () => {
    return user?.emailAddresses?.[0]?.emailAddress || '';
  };

  if (!showDropdown) {
    return (
      <Avatar className={cn(sizeClasses[avatarSize], className)}>
        <AvatarImage
          src={user?.imageUrl}
          alt={getUserDisplay()}
        />
        <AvatarFallback className="bg-primary text-primary-foreground font-mono font-bold">
          {getUserInitial()}
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn('cursor-pointer focus-visible:outline-none', className)}
          aria-label="User menu"
        >
          <Avatar className={sizeClasses[avatarSize]}>
            <AvatarImage
              src={user?.imageUrl}
              alt={getUserDisplay()}
            />
            <AvatarFallback className="bg-primary text-primary-foreground font-mono font-bold">
              {getUserInitial()}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="font-mono text-sm font-medium leading-none">
              {getUserDisplay()}
            </p>
            <p className="font-mono text-xs leading-none text-muted-foreground">
              {getUserEmail()}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            window.location.href = '/app/settings';
          }}
          className="font-mono text-xs cursor-pointer"
        >
          <Settings className="mr-2 size-4" />
          <span>settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleSignOut}
          variant="destructive"
          className="font-mono text-xs cursor-pointer"
        >
          <LogOut className="mr-2 size-4" />
          <span>sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Simple avatar display without dropdown
 * Useful for displaying user avatar in other contexts
 */
export function AvatarDisplay({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { user } = useAuthUser();

  const sizeClasses = {
    sm: 'size-6',
    md: 'size-8',
    lg: 'size-10',
  };

  const getUserInitial = () => {
    return user?.firstName?.[0] || user?.username?.[0] || '?';
  };

  const getUserDisplay = () => {
    return user?.firstName || user?.username || 'User';
  };

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      <AvatarImage
        src={user?.imageUrl}
        alt={getUserDisplay()}
      />
      <AvatarFallback className="bg-primary text-primary-foreground font-mono font-bold">
        {getUserInitial()}
      </AvatarFallback>
    </Avatar>
  );
}
