'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { IconButton } from '@/components/sploot';

export function ThemeToggle({ className }: { className?: string }) {
  // resolvedTheme, not theme: with the default "system" preference, `theme`
  // stays "system" while the page actually renders dark — the control must
  // reflect the resolved state or it misreports on dark-OS machines.
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Avoid hydration mismatch by only rendering after mount
  React.useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  if (!mounted) {
    return <IconButton label="switch theme" disabled className={className} />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <IconButton
      label="switch theme"
      pressed={isDark}
      className={className}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Moon /> : <Sun />}
    </IconButton>
  );
}
